/**
 * IBM BOB Provider for AI SDK (LangSpec V3)
 * 
 * A LanguageModelV3 provider that integrates IBM BOB as an AI model source
 * using the OpenAI-compatible API format.
 * 
 * Supports both legacy API key authentication and OAuth2 Authorization Code + PKCE.
 * 
 * @packageDocumentation
 */

// ============================================================================
// AI SDK Provider — LanguageModelV3 Implementation
// ============================================================================

export { BobLanguageModel, ibmBob } from './model';
export { createBobAiProvider, bob, type BobProvider } from './provider';
export type { BobAiProviderSettings } from './types';

// ============================================================================
// Configuration & Helpers (legacy OpenCode compatibility)
// ============================================================================

export { resolveConfig, validateConfig, getApiKey, getApiBaseUrl, getModel, getChatCompletionsUrl, AVAILABLE_MODELS, getModelById, isOAuthConfig, getOAuthConfig, getTokenStoreBackend } from './config';

// ============================================================================
// OAuth Authentication Module (unchanged)
// ============================================================================

export { AuthProvider, createAuthProvider, TokenStore, startCallbackServer, generatePKCE } from './auth';

// ============================================================================
// Type Exports — AI SDK Provider Settings (alias)
// ============================================================================

// ============================================================================
// Type Exports — OpenAI-Compatible API Types
// ============================================================================

export type {
  ChatCompletionMessage,
  ChatCompletionRequest,
  Choice,
  Usage,
  ChatCompletionResponse,
  Delta,
  StreamChoice,
  ChatCompletionChunkResponse,
} from './types';

// ============================================================================
// Type Exports — Provider Configuration Types
// ============================================================================

export type {
  BobProviderConfig,
  BobProviderOptions,
  BobAuthConfig,
  BobOAuthConfig,
  TokenStoreBackend,
} from './types';

// ============================================================================
// Type Exports — OpenCode Provider Interface Types (legacy)
// ============================================================================

export type {
  Message,
  ChatOptions,
  StreamCallback,
  CompletionResult,
  ProviderInfo,
} from './types';

// ============================================================================
// Type Exports — IBM BOB Specific Types
// ============================================================================

export type {
  BobModel,
  BobChatCompletionResponse,
  BobChatCompletionChunkResponse,
} from './types';

// ============================================================================
// Type Exports — OAuth2 Authentication Types
// ============================================================================

export type {
  AuthState,
  StoredTokens,
  PKCEResource,
  TokenResponse,
  AuthorizationServerMetadata,
} from './types';

// ============================================================================
// Type Exports — HTTP Transport Layer
// ============================================================================

export type {
  BobTransportConfig,
  TransportRequestOptions,
  ParsedResponse,
  StreamHandle,
} from './ibm-bob-transport';

// ============================================================================
// Type Exports — Format Converter (OpenAI API types)
// ============================================================================

export type {
  OpenAIChatMessage,
  OpenAIChoice,
  OpenAIUsage,
  OpenAIChatResponse,
  OpenAIStreamDelta,
  OpenAIStreamChunk,
} from './ibm-bob-converter';

// ============================================================================
// Type Exports — Auth Module
// ============================================================================

export type { AuthProviderOptions } from './auth/AuthProvider';
export type { CallbackResult, CallbackError } from './auth/CallbackServer';