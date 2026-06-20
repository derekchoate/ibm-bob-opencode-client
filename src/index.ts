/**
 * IBM BOB Provider for OpenCode
 * 
 * A model/LLM provider that integrates IBM BOB as an AI model source
 * for the OpenCode project, using an OpenAI-compatible API format.
 * 
 * Supports both legacy API key authentication and OAuth2 Authorization Code + PKCE.
 * 
 * @packageDocumentation
 */

// ============================================================================
// Main Provider Class
// ============================================================================

export { BobProvider, createBobProvider } from './provider';

// ============================================================================
// Configuration & Helpers
// ============================================================================

export {
  resolveConfig,
  validateConfig,
  getApiKey,
  getApiBaseUrl,
  getModel,
  getChatCompletionsUrl,
  AVAILABLE_MODELS,
  getModelById,
  isOAuthConfig,
  getOAuthConfig,
  getTokenStoreBackend,
} from './config';

// ============================================================================
// OAuth Authentication Module
// ============================================================================

export {
  AuthProvider,
  createAuthProvider,
  TokenStore,
  startCallbackServer,
  generatePKCE,
} from './auth';

// ============================================================================
// Type Exports
// ============================================================================

export type {
  // OpenAI-Compatible API Types
  ChatCompletionMessage,
  ChatCompletionRequest,
  Choice,
  Usage,
  ChatCompletionResponse,
  Delta,
  StreamChoice,
  ChatCompletionChunkResponse,

  // Provider Configuration Types
  BobProviderConfig,
  BobProviderOptions,
  BobAuthConfig,
  BobOAuthConfig,
  TokenStoreBackend,

  // OpenCode Provider Interface Types
  Message,
  ChatOptions,
  StreamCallback,
  CompletionResult,
  ProviderInfo,

  // IBM BOB Specific Types
  BobModel,
  BobChatCompletionResponse,
  BobChatCompletionChunkResponse,

  // OAuth2 Authentication Types
  AuthState,
  StoredTokens,
  PKCEResource,
  TokenResponse,
  AuthorizationServerMetadata,
} from './types';

export type { AuthProviderOptions } from './auth/AuthProvider';
export type { CallbackResult, CallbackError } from './auth/CallbackServer';