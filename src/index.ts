/**
 * IBM BOB Provider for OpenCode
 * 
 * A model/LLM provider that integrates IBM BOB as an AI model source
 * for the OpenCode project, using an OpenAI-compatible API format.
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
} from './config';

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
} from './types';