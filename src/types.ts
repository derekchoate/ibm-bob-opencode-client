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