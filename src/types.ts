/**
 * IBM BOB Provider Types for OpenCode
 */

// ============================================================================
// OpenAI-Compatible API Types
// ============================================================================

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
}

export interface Choice {
  index: number;
  message: ChatCompletionMessage;
  finish_reason: string | null;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Choice[];
  usage: Usage;
}

// Streaming types
export interface Delta {
  role?: string;
  content?: string;
}

export interface StreamChoice {
  index: number;
  delta?: Delta;
  finish_reason: string | null;
}

export interface ChatCompletionChunkResponse {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: StreamChoice[];
}

// ============================================================================
// Provider Configuration Types
// ============================================================================

/**
 * Token store backend selection.
 * - "file": Local file storage (default, cross-platform)
 * - "keychain": OS keychain via keytar (macOS Keychain, Windows Credential Manager, Linux libsecret)
 */
export type TokenStoreBackend = 'file' | 'keychain';

/**
 * OAuth configuration for the authentication provider.
 */
export interface BobOAuthConfig {
  /** IBM BOB authorization server issuer URL (e.g., https://api.us-east.bob.ibm.com) */
  issuerUrl: string;
  /** OAuth2 client ID registered with IBM BOB */
  clientId: string;
  /** OAuth2 client secret (required for confidential clients) */
  clientSecret?: string;
  /** OAuth2 redirect URI path (must match the registered callback path) */
  callbackPath: string; // e.g., '/bob-shell-auth-callback'
  /** OAuth2 scopes to request during authorization */
  scope?: string[];
}

/**
 * Combined configuration for both legacy API key and OAuth auth.
 */
export interface BobAuthConfig {
  /** Use OS keychain instead of file-based storage (optional, defaults to 'file') */
  tokenStoreBackend?: TokenStoreBackend;
  /** OAuth2 configuration (if omitted, falls back to static apiKey) */
  oauth?: Partial<BobOAuthConfig>;
}

export interface BobProviderConfig {
  /** IBM BOB API base URL (e.g., https://bob-api.ibm.com) */
  apiKey: string;

  /** IBM BOB API endpoint base URL */
  apiBaseUrl?: string;

  /** Default model to use */
  model?: string;

  /** Maximum number of tokens in the response */
  maxTokens?: number;

  /** Sampling temperature (0-2) */
  temperature?: number;

  /** Top-p sampling parameter */
  topP?: number;

  /** Frequency penalty (-2 to 2) */
  frequencyPenalty?: number;

  /** Presence penalty (-2 to 2) */
  presencePenalty?: number;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Authentication configuration (OAuth2 or legacy API key) */
  auth?: BobAuthConfig;
}

export interface BobProviderOptions {
  config: Partial<BobProviderConfig>;
}

// ============================================================================
// OpenCode Provider Interface Types
// ============================================================================

/**
 * Message types supported by OpenCode
 */
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Chat options for completions
 */
export interface ChatOptions {
  model?: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
}

/**
 * Streaming callback function type
 */
export type StreamCallback = (chunk: string, fullContent: string) => void;

/**
 * Completion result
 */
export interface CompletionResult {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Provider info
 */
export interface ProviderInfo {
  name: string;
  version: string;
  models: string[];
}

// ============================================================================
// IBM BOB Specific Types
// ============================================================================

export interface BobModel {
  id: string;
  name: string;
  description?: string;
  maxTokens?: number;
  contextWindow?: number;
}

export type { ChatCompletionResponse as BobChatCompletionResponse };
export type { ChatCompletionChunkResponse as BobChatCompletionChunkResponse };

// ============================================================================
// OAuth2 Authentication Types
// ============================================================================

/**
 * OAuth2 authorization server metadata.
 */
export interface AuthorizationServerMetadata {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint?: string;
}

/**
 * PKCE code verifier and challenge pair.
 */
export interface PKCEResource {
  /** Random code verifier (43-128 characters) */
  verifier: string;
  /** Base64url-encoded SHA256 hash of the verifier */
  challenge: string;
}

/**
 * OAuth2 token response from the token endpoint.
 */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds until expiry
  scope: string;
  token_type: 'Bearer';
}

/**
 * Persisted tokens stored on disk or in keychain.
 */
export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** Unix timestamp (ms) when the access token expires */
  expiresAt: number;
  /** Unix timestamp (ms) when the tokens were originally obtained */
  createdAt: number;
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
