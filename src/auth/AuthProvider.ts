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

import type { BobOAuthConfig, StoredTokens, PKCEResource, TokenResponse } from '../types';
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
  private oauthConfig: Required<Pick<BobOAuthConfig, 'issuerUrl' | 'clientId' | 'callbackPath'>> & Pick<BobOAuthConfig, 'clientSecret' | 'scope'>;
  private apiBaseUrl: string;
  private tokenStore: TokenStore;
  private currentPKCE?: PKCEResource;

  constructor(options: AuthProviderOptions) {
    const oauth = options.oauthConfig;
    
    if (!oauth.issuerUrl || !oauth.clientId || !oauth.callbackPath) {
      throw new Error(
        'OAuth configuration is incomplete. Required: issuerUrl, clientId, callbackPath'
      );
    }

    this.oauthConfig = {
      issuerUrl: oauth.issuerUrl,
      clientId: oauth.clientId,
      callbackPath: oauth.callbackPath,
      clientSecret: oauth.clientSecret || '',
      scope: oauth.scope || DEFAULT_SCOPES,
    };

    this.apiBaseUrl = options.apiBaseUrl;
    this.tokenStore = new TokenStore(options.tokenStoreBackend || 'file');
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
        'Not authenticated. Call `login()` first to authenticate.'
      );
    }

    if (state.isExpiringSoon || !state.isAuthenticated) {
      await this.refreshTokens();
    }

    const tokens = this.tokenStore.load();
    if (!tokens) {
      throw new Error('Token store is empty after refresh. Please re-authenticate.');
    }

    return tokens.accessToken;
  }

  /**
   * Start the interactive login flow.
   * Opens a browser for user authorization, then waits for the callback.
   */
  async login(onAuthUrlGenerated?: (url: string) => void): Promise<void> {
    // First clear any existing tokens
    this.tokenStore.delete();

    // Generate PKCE challenge
    const pkce = await generatePKCE();
    this.currentPKCE = pkce;

    // Start local callback server first to get the actual port
    const server = startCallbackServer(0);
    
    try {
      const redirectUri = `http://127.0.0.1:${server.actualPort}${this.oauthConfig.callbackPath}`;

      // Build authorization URL with the actual redirect URI
      const authUrl = this.buildAuthorizationUrl(pkce.challenge, redirectUri);

      // Open browser (optional callback for custom handling)
      if (onAuthUrlGenerated) {
        onAuthUrlGenerated(authUrl);
      } else {
        this.openBrowser(authUrl);
      }

      // Wait for the authorization code callback
      const callbackResult = await Promise.race([
        server.result,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Authorization timed out after 5 minutes. Please try again.')), 5 * 60 * 1000);
        }),
      ]);

      // Exchange auth code for tokens using the actual redirect URI
      await this.exchangeCodeForTokens(callbackResult.code, redirectUri);

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

    const response = await this.fetchTokenResponse({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: this.oauthConfig.clientId,
    });

    this.saveTokenResponse(response);
  }

  /**
   * Log out by deleting all stored tokens.
   */
  logout(): void {
    this.tokenStore.delete();
  }

  // =========================================================================
  // Internal Methods
  // =========================================================================

  /**
   * Build the OAuth2 authorization URL with PKCE params.
   * Uses a placeholder redirect URI that gets replaced at token exchange time.
   */
  private buildAuthorizationUrl(codeChallenge: string, placeholderRedirectUri: string): string {
    const authEndpoint = this.resolveAuthorizationEndpoint();

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.oauthConfig.clientId,
      scope: (this.oauthConfig.scope || DEFAULT_SCOPES).join(' '),
      redirect_uri: placeholderRedirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${authEndpoint}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens.
   */
  private async exchangeCodeForTokens(code: string, actualRedirectUri: string): Promise<void> {
    const response = await this.fetchTokenResponse({
      grant_type: 'authorization_code',
      code,
      redirect_uri: actualRedirectUri,
      client_id: this.oauthConfig.clientId,
      ...(this.oauthConfig.clientSecret ? { client_secret: this.oauthConfig.clientSecret } : {}),
      code_verifier: this.currentPKCE?.verifier || '',
    });

    this.saveTokenResponse(response);
  }

  /**
   * Fetch tokens from the OAuth2 token endpoint.
   */
  private async fetchTokenResponse(body: Record<string, string>): Promise<TokenResponse> {
    const tokenEndpoint = this.resolveTokenEndpoint();

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
        `Token request failed (${response.status}): ${errorText}`
      );
    }

    return (await response.json()) as TokenResponse;
  }

  /**
   * Save token response to the token store.
   */
  private saveTokenResponse(response: TokenResponse): void {
    const now = Date.now();
    const tokens: StoredTokens = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: now + (response.expires_in * 1000),
      createdAt: now,
    };

    this.tokenStore.save(tokens);
  }

  /**
   * Resolve the authorization endpoint from issuer URL.
   */
  private resolveAuthorizationEndpoint(): string {
    // For IBM BOB, use the known endpoint pattern
    const baseUrl = this.oauthConfig.issuerUrl.replace(/\/+$/, '');
    return `${baseUrl}/authorize`;
  }

  /**
   * Resolve the token endpoint from issuer URL.
   */
  private resolveTokenEndpoint(): string {
    // For IBM BOB, use the known endpoint pattern
    const baseUrl = this.oauthConfig.issuerUrl.replace(/\/+$/, '');
    return `${baseUrl}/oauth2/token`;
  }

  /**
   * Open a browser to the authorization URL.
   */
  private openBrowser(url: string): void {
    try {
      const openModule = require('open');
      (openModule as any)(url).catch(() => {
        console.warn('[IBM BOB Provider] Failed to open browser automatically.');
        console.warn(`Please visit this URL to authenticate:\n${url}`);
      });
    } catch {
      console.warn('[IBM BOB Provider] Browser auto-open not available.');
      console.warn(`Please visit this URL to authenticate:\n${url}`);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new AuthProvider instance.
 */
export function createAuthProvider(options: AuthProviderOptions): AuthProvider {
  return new AuthProvider(options);
}
