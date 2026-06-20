/**
 * IBM BOB Provider for OpenCode
 * 
 * Implements the OpenCode provider interface using IBM BOB's
 * OpenAI-compatible API endpoint.
 * 
 * Supports two authentication modes:
 * 1. Legacy API key (static Bearer token)
 * 2. OAuth2 Authorization Code + PKCE with automatic token refresh
 */

import { resolveConfig, validateConfig, getChatCompletionsUrl, fetchAvailableModels, clearModelCache, isOAuthConfig, getOAuthConfig, getTokenStoreBackend } from './config';
import {
  BobProviderConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunkResponse,
  ChatOptions,
  CompletionResult,
  ProviderInfo,
  StreamCallback,
} from './types';
import type { AuthState } from './types';

// Lazy import to avoid build issues when keytar is not available
const { AuthProvider, createAuthProvider } = (() => {
  try {
    const auth = require('./auth');
    return { AuthProvider: auth.AuthProvider, createAuthProvider: auth.createAuthProvider };
  } catch {
    return { AuthProvider: null, createAuthProvider: null };
  }
})();

const PACKAGE_VERSION = '0.1.0';

export interface BobProviderOptions {
  config?: Partial<BobProviderConfig>;
}

export class BobProvider {
  private config: ReturnType<typeof resolveConfig>;
  private authProvider: any; // AuthProvider, loaded lazily

  constructor(options?: BobProviderOptions) {
    this.config = resolveConfig(options?.config);
  }

  /**
   * Get provider information
   */
  getInfo(): ProviderInfo {
    return {
      name: 'ibm-bob',
      version: PACKAGE_VERSION,
      models: [this.config.model],
    };
  }

  /**
   * Get dynamically discovered available models from the API.
   * Returns cached results if available within the TTL window.
   */
  async getAvailableModels(): Promise<string[]> {
    const models = await fetchAvailableModels(this.config);
    return models.map((m) => m.id);
  }

  /**
   * Refresh the model cache by re-fetching from the API.
   */
  async refreshModels(): Promise<string[]> {
    clearModelCache();
    return this.getAvailableModels();
  }

  /**
   * Get the resolved configuration
   */
  getConfig(): ReturnType<typeof resolveConfig> {
    return { ...this.config };
  }

  /**
   * Validate the current configuration
   */
  validate(): string[] {
    return validateConfig(this.config);
  }

  // =========================================================================
  // OAuth Authentication Methods
  // =========================================================================

  /**
   * Initialize the auth provider (lazy initialization).
   */
  private async initAuthProvider(): Promise<void> {
    if (this.authProvider) {
      return;
    }

    if (!AuthProvider) {
      throw new Error(
        'OAuth support requires the auth module. Ensure ./auth directory is included when distributing.'
      );
    }

    const oauthConfig = getOAuthConfig(this.config);
    if (!oauthConfig?.issuerUrl || !oauthConfig?.clientId || !oauthConfig?.callbackPath) {
      throw new Error('OAuth configuration is incomplete. Check auth.oauth settings.');
    }

    this.authProvider = createAuthProvider({
      oauthConfig,
      apiBaseUrl: this.config.apiBaseUrl,
      tokenStoreBackend: getTokenStoreBackend(this.config),
    });
  }

  /**
   * Get the current authentication state.
   * Only available when OAuth is configured.
   */
  async getAuthState(): Promise<AuthState | null> {
    if (!isOAuthConfig(this.config)) {
      return null; // Not using OAuth
    }

    await this.initAuthProvider();
    return this.authProvider.getAuthState();
  }

  /**
   * Start the interactive login flow.
   * Opens a browser for user authorization, then waits for the callback.
   * Only available when OAuth is configured.
   */
  async login(onAuthUrlGenerated?: (url: string) => void): Promise<void> {
    if (!isOAuthConfig(this.config)) {
      throw new Error('Login is only available when OAuth is configured.');
    }

    await this.initAuthProvider();
    return this.authProvider.login(onAuthUrlGenerated);
  }

  /**
   * Log out by clearing all stored tokens.
   * Only available when OAuth is configured.
   */
  async logout(): Promise<void> {
    if (!isOAuthConfig(this.config)) {
      throw new Error('Logout is only available when OAuth is configured.');
    }

    await this.initAuthProvider();
    this.authProvider.logout();
    this.authProvider = null; // Reset for next login
  }

  /**
   * Get a valid access token (refreshes if needed).
   * Only available when OAuth is configured.
   */
  private async getAccessToken(): Promise<string> {
    if (!isOAuthConfig(this.config)) {
      throw new Error('Token management is only available when OAuth is configured.');
    }

    await this.initAuthProvider();
    return this.authProvider.getAccessToken();
  }

  // =========================================================================
  // API Methods (unchanged from original)
  // =========================================================================

  /**
   * Send a chat completion request to IBM BOB
   */
  async complete(options: ChatOptions): Promise<CompletionResult> {
    const errors = this.validate();
    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }

    const request = this.buildRequest(options);
    const url = getChatCompletionsUrl(this.config);

    let apiKey: string;
    
    if (isOAuthConfig(this.config)) {
      apiKey = await this.getAccessToken();
    } else {
      apiKey = this.config.apiKey || '';
    }

    const response = await this.fetchWithTimeout(url, request, apiKey);
    return this.parseResponse(response, options.model);
  }

  /**
   * Send a streaming chat completion request to IBM BOB
   */
  async completeStream(
    options: ChatOptions,
    onChunk: StreamCallback
  ): Promise<CompletionResult> {
    const errors = this.validate();
    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }

    const request = this.buildRequest({ ...options, stream: true });
    const url = getChatCompletionsUrl(this.config);

    let apiKey: string;
    
    if (isOAuthConfig(this.config)) {
      apiKey = await this.getAccessToken();
    } else {
      apiKey = this.config.apiKey || '';
    }

    let fullContent = '';
    const promptTokens = 0;
    let completionTokens = 0;

    await this.streamResponse(url, request, apiKey, (chunk) => {
      const parsed = this.parseStreamChunk(chunk);
      if (parsed?.choices?.[0]?.delta?.content) {
        const content = parsed.choices[0].delta.content;
        fullContent += content;
        onChunk(content, fullContent);
        completionTokens += 1; // Approximate token counting
      }
    });

    return {
      content: fullContent,
      model: options.model || this.config.model,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private buildRequest(options: ChatOptions): ChatCompletionRequest {
    const messages = options.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    return {
      model: options.model || this.config.model,
      messages,
      temperature: options.temperature ?? this.config.temperature,
      max_tokens: options.maxTokens ?? (this.config as any).maxTokens,
      top_p: options.topP ?? this.config.topP,
      frequency_penalty: this.config.frequencyPenalty,
      presence_penalty: this.config.presencePenalty,
      stream: options.stream ?? false,
    };
  }

  private async fetchWithTimeout(
    url: string,
    body: ChatCompletionRequest,
    apiKey: string
  ): Promise<ChatCompletionResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `IBM BOB API error (${response.status}): ${errorText}`
        );
      }

      return (await response.json()) as ChatCompletionResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `IBM BOB API request timed out after ${this.config.timeout}ms`
        );
      }
      throw error;
    }
  }

  private async streamResponse(
    url: string,
    body: ChatCompletionRequest,
    apiKey: string,
    onChunkReceived: (chunk: string) => void
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `IBM BOB API error (${response.status}): ${errorText}`
        );
      }

      if (!response.body) {
        throw new Error('Response body is null - cannot stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            try {
              JSON.parse(data); // Validate JSON before emitting
              onChunkReceived(trimmed);
            } catch {
              // Skip invalid JSON chunks
              console.warn('Skipping invalid stream chunk:', data);
            }
          }
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `IBM BOB streaming request timed out after ${this.config.timeout}ms`
        );
      }
      throw error;
    }
  }

  private parseResponse(
    apiResponse: ChatCompletionResponse,
    requestedModel?: string
  ): CompletionResult {
    const choice = apiResponse.choices?.[0];
    if (!choice) {
      throw new Error('No choices returned from IBM BOB API');
    }

    return {
      content: choice.message.content ?? '',
      model: requestedModel || apiResponse.model,
      usage: apiResponse.usage
        ? {
            promptTokens: apiResponse.usage.prompt_tokens,
            completionTokens: apiResponse.usage.completion_tokens,
            totalTokens: apiResponse.usage.total_tokens,
          }
        : undefined,
    };
  }

  private parseStreamChunk(chunk: string): ChatCompletionChunkResponse | null {
    try {
      const data = chunk.startsWith('data: ') ? chunk.slice(6) : chunk;
      return JSON.parse(data) as ChatCompletionChunkResponse;
    } catch {
      return null;
    }
  }
}

// ============================================================================
// Factory Function (for easier usage)
// ============================================================================

export function createBobProvider(
  options?: BobProviderOptions
): BobProvider {
  return new BobProvider(options);
}