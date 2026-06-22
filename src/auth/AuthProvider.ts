/**
 * AuthProvider - Orchestrates OAuth2 Authorization Code + PKCE flow
 *
 * Handles:
 * 1. OIDC discovery (well-known endpoint)
 * 2. PKCE code verifier/challenge generation
 * 3. Local callback server for auth code reception
 * 4. Browser launch for interactive authorization
 * 5. Token exchange and refresh
 * 6. Transparent token management for API calls
 */

import type {
  BobOAuthConfig,
  StoredTokens,
  PKCEResource,
  TokenResponse,
} from '../types';

import { generatePKCE } from './PKCEManager';

import { TokenStore } from './TokenStore';

import { startCallbackServer } from './CallbackServer';

// Default scopes for LLM API access
const DEFAULT_SCOPES = ['openid', 'profile'];

// Buffer time before expiry to proactively refresh (in ms)
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export interface AuthProviderOptions {
  oauthConfig: Partial<BobOAuthConfig>;
  apiBaseUrl: string;
  tokenStoreBackend?: 'file' | 'keychain';
  onAuthUrlGenerated?: (url: string) => void;
}

/**
 * Result of authentication state check.
 */
export interface AuthState {
  /** Whether the user is currently authenticated */
  isAuthenticated: boolean;

  /** Whether the current access token will expire within the buffer time */
  isExpiringSoon: boolean;

  /** Timestamp when the access token expires (ms), or null if not authenticated */
  expiresAt: number | null;
}

export class AuthProvider {

  private oauthConfig: Required<
    Pick<BobOAuthConfig, 'issuerUrl' | 'clientId' | 'callbackPath'>
  > & Pick<BobOAuthConfig, 'clientSecret' | 'scope'>;

  private apiBaseUrl: string;
  private tokenStore: TokenStore;
  private currentPKCE?: PKCEResource;
  private onAuthUrlGenerated?: (url: string) => void;

  constructor(options: AuthProviderOptions) {

    const oauth = options.oauthConfig;

    validateOAuthConfig(oauth);

    this.oauthConfig = {
      issuerUrl: String(oauth.issuerUrl),
      clientId: String(oauth.clientId),
      callbackPath: String(oauth.callbackPath),
      clientSecret: oauth.clientSecret || '',
      scope: oauth.scope || DEFAULT_SCOPES,
    };

    this.apiBaseUrl = options.apiBaseUrl;
    this.tokenStore = new TokenStore(options.tokenStoreBackend || 'file');
    this.onAuthUrlGenerated = options.onAuthUrlGenerated;
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * Get the current authentication state.
   */
  getAuthState(): AuthState {

    const tokens = this.tokenStore.load();

    if (!tokens) {
      return { isAuthenticated: false, isExpiringSoon: false, expiresAt: null };
    }

    const now = Date.now();
    const isExpiringSoon = (tokens.expiresAt - now) < REFRESH_BUFFER_MS;

    return {
      isAuthenticated: true,
      isExpiringSoon,
      expiresAt: tokens.expiresAt,
    };
  }

  /**
   * Get a valid access token. Refreshes if expired or about to expire.
   */
  async getAccessToken(): Promise<string> {

    const state = this.getAuthState();

    if (!state.isAuthenticated) {
      throw new Error(
        'Not authenticated. Call `login()` first to authenticate.',
      );
    }

    if (state.isExpiringSoon || !state.isAuthenticated) {
      await this.refreshTokens();
    }

    const tokens = this.tokenStore.load();
    if (!tokens) {
      throw new Error(
        'Token store is empty after refresh. Please re-authenticate.',
      );
    }

    return tokens.accessToken;
  }

  /**
   * Start the interactive login flow.
   * Opens a browser for user authorization, then waits for the callback.
   */
  async login(
    onAuthUrlGenerated?: (url: string) => void,
  ): Promise<void> {

    // First clear any existing tokens
    this.tokenStore.delete();

    // Generate PKCE challenge
    const pkce = await generatePKCE();
    this.currentPKCE = pkce;

    // Start local callback server first to get the actual port
    const server = startCallbackServer(0);

    try {
      // Build redirect URI with the actual server port
      const redirectUri = buildRedirectUri(
        server,
        this.oauthConfig.callbackPath,
      );

      // Build authorization URL and open browser
      await launchAuthorization(
        pkce.challenge,
        redirectUri,
        onAuthUrlGenerated ?? this.onAuthUrlGenerated,
        this.oauthConfig,
      );

      // Exchange auth code for tokens using the actual redirect URI
      const callbackResult = await waitForAuthorizationCode(server);
      await completeTokenExchange(
        callbackResult.code,
        redirectUri,
        this.oauthConfig,
        this.currentPKCE?.verifier || '',
      );

    } finally {
      server.stop();
    }

    // Clean up PKCE resource
    this.currentPKCE = undefined;
  }

  /**
   * Refresh access and refresh tokens using the stored refresh token.
   */
  async refreshTokens(): Promise<void> {

    const tokens = this.tokenStore.load();

    if (!tokens) {
      throw new Error('No tokens found. Please authenticate first.');
    }

    const response = await fetchTokenResponse(this.oauthConfig, {
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: this.oauthConfig.clientId,
    });

    saveTokenResponse(response);
  }

  /**
   * Log out by deleting all stored tokens.
   */
  logout(): void {
    this.tokenStore.delete();
  }

  // =========================================================================
  // Internal Methods (used by extracted public methods)
  // =========================================================================

  /** Get the OAuth config for internal use. */
  getOAuthConfig() {
    return this.oauthConfig;
  }

  /** Get the token store for internal use. */
  getTokenStore() {
    return this.tokenStore;
  }
}

// ============================================================================
// Validation Helpers
// ============================================================================

/** Validate that required OAuth configuration is present. */
function validateOAuthConfig(oauth: Partial<BobOAuthConfig>): void {

  if (!oauth.issuerUrl || !oauth.clientId || !oauth.callbackPath) {
    throw new Error(
      'OAuth configuration is incomplete. Required: issuerUrl, clientId, callbackPath',
    );
  }
}

// ============================================================================
// URI Helpers
// ============================================================================

/** Build the redirect URI from server and callback path. */
function buildRedirectUri(
  server: { actualPort: number },
  callbackPath: string,
): string {

  return `http://127.0.0.1:${server.actualPort}${callbackPath}`;
}

// ============================================================================
// Authorization Helpers
// ============================================================================

/** Build the OAuth2 authorization URL with PKCE params. */
function buildAuthorizationUrl(
  codeChallenge: string,
  redirectUri: string,
  oauthConfig: Required<Pick<BobOAuthConfig, 'issuerUrl' | 'clientId'>> &
    Pick<BobOAuthConfig, 'scope'>,
): string {

  const authEndpoint = resolveAuthorizationEndpoint(oauthConfig.issuerUrl);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: oauthConfig.clientId,
    scope: (oauthConfig.scope || DEFAULT_SCOPES).join(' '),
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${authEndpoint}?${params.toString()}`;
}

/** Resolve the authorization endpoint from issuer URL. */
function resolveAuthorizationEndpoint(issuerUrl: string): string {

  const baseUrl = issuerUrl.replace(/\/+$/, '');
  return `${baseUrl}/authorize`;
}

/** Launch browser for user authorization and wait for callback. */
async function launchAuthorization(
  codeChallenge: string,
  redirectUri: string,
  onAuthUrlGenerated: ((url: string) => void) | undefined,
  oauthConfig: Required<Pick<BobOAuthConfig, 'issuerUrl' | 'clientId'>> &
    Pick<BobOAuthConfig, 'scope'>,
): Promise<void> {

  const authUrl = buildAuthorizationUrl(codeChallenge, redirectUri, oauthConfig);

  // Open browser (optional callback for custom handling)
  if (onAuthUrlGenerated) {
    onAuthUrlGenerated(authUrl);
  } else {
    openBrowser(authUrl);
  }
}

/** Open a browser to the authorization URL. */
function openBrowser(url: string): void {

  try {
    const openModule = require('open');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (openModule as any)(url).catch(() => {
      console.warn('[IBM BOB Provider] Failed to open browser automatically.');
      console.warn(`Please visit this URL to authenticate:\n${url}`);
    });
  } catch {
    console.warn('[IBM BOB Provider] Browser auto-open not available.');
    console.warn(`Please visit this URL to authenticate:\n${url}`);
  }
}

// ============================================================================
// Token Helpers
// ============================================================================

/** Exchange authorization code for tokens. */
async function completeTokenExchange(
  code: string,
  redirectUri: string,
  oauthConfig: Required<Pick<BobOAuthConfig, 'issuerUrl' | 'clientId'>> &
    Pick<BobOAuthConfig, 'clientSecret'>,
  codeVerifier: string,
): Promise<void> {

  const response = await fetchTokenResponse(oauthConfig, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: oauthConfig.clientId,
    ...(oauthConfig.clientSecret ? { client_secret: oauthConfig.clientSecret } : {}),
    code_verifier: codeVerifier,
  });

  saveTokenResponse(response);
}

/** Fetch tokens from the OAuth2 token endpoint. */
async function fetchTokenResponse(
  oauthConfig: Pick<BobOAuthConfig, 'issuerUrl' | 'clientId'>,
  body: Record<string, string>,
): Promise<TokenResponse> {

  const tokenEndpoint = resolveTokenEndpoint(oauthConfig.issuerUrl);

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Token request failed (${response.status}): ${errorText}`,
    );
  }

  return (await response.json()) as TokenResponse;
}

/** Resolve the token endpoint from issuer URL. */
function resolveTokenEndpoint(issuerUrl: string): string {

  const baseUrl = issuerUrl.replace(/\/+$/, '');
  return `${baseUrl}/oauth2/token`;
}

/** Save token response to the token store. */
function saveTokenResponse(response: TokenResponse): void {

  const now = Date.now();
  const tokens: StoredTokens = {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: now + (response.expires_in * 1000),
    createdAt: now,
  };

  // Save using a global/default token store
  const tokenStore = new TokenStore('file');
  tokenStore.save(tokens);
}

// ============================================================================
// Waiting Helpers
// ============================================================================

/** Wait for the authorization code callback with timeout. */
async function waitForAuthorizationCode(
  server: { result: Promise<{ code: string }>; stop: () => void },
): Promise<{ code: string }> {

  return Promise.race([
    server.result,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(
          'Authorization timed out after 5 minutes. Please try again.',
        ));
      }, 5 * 60 * 1000);
    }),
  ]);
}

// ============================================================================
// Factory Function
// ============================================================================

/** Create a new AuthProvider instance. */
export function createAuthProvider(options: AuthProviderOptions): AuthProvider {
  return new AuthProvider(options);
}