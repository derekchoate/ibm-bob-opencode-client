/**
 * IBM BOB Language Model — AI SDK (LangSpec V3) Implementation
 * 
 * Contains the BobLanguageModel class which implements the @ai-sdk/provider
 * LanguageModelV3 interface, using IBM BOB's OpenAI-compatible API endpoint.
 */

import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';

import { postJson, postStream, readNextSseLine, BobTransportConfig } from './ibm-bob-transport';
import type { BobAiProviderSettings } from './types';
import {
  convertToOpenAIRequestBody,
  convertOpenAIResponse,
  convertOpenAIStream,
  createEmptyWarnings,
} from './ibm-bob-converter';

// ============================================================================
// BobLanguageModel — LanguageModelV3 Implementation
// ============================================================================

export class BobLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3' as const;

  get provider(): string {
    return 'ibm-bob';
  }

  get modelId(): string {
    return this._settings.defaultModel ?? 'default';
  }

  // IBM BOB does not support any special URL patterns beyond standard HTTP(S)
  readonly supportedUrls: Record<string, RegExp[]> = {};

  private _settings: BobAiProviderSettings;
  private _transportConfig: BobTransportConfig;

  constructor(settings: BobAiProviderSettings) {
    this._settings = settings;

    const timeout = settings.timeout ?? 30_000;
    this._transportConfig = {
      baseUrl: settings.baseUrl || 'https://api.us-east.bob.ibm.com/inference/v1',
      path: '/chat/completions',
      timeout,
      apiKey: settings.apiKey,
      getToken: settings.getToken,
      headers: settings.headers,
    };
  }

  /**
   * Get a copy of the current settings.
   */
  getSettings(): BobAiProviderSettings {
    return { ...this._settings };
  }

  /**
   * Generate a non-streaming completion.
   */
  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const body = convertToOpenAIRequestBody(options, this.modelId);
    const responseBody = await postJson(this._transportConfig, { body: JSON.stringify(body) });

    const parsed = convertOpenAIResponse(responseBody.data as Parameters<typeof convertOpenAIResponse>[0]);

    return {
      content: parsed.content,
      finishReason: parsed.finishReason,
      usage: parsed.usage,
      warnings: createEmptyWarnings(),
      request: {
        body: JSON.stringify(body),
      },
      response: {
        id: (responseBody.raw as any).id ?? '',
        timestamp: new Date(),
        modelId: this.modelId,
        headers: Object.fromEntries((responseBody.raw as any).headers || {}),
      },
    };
  }

  /**
   * Generate a streaming completion.
   */
  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const body = convertToOpenAIRequestBody(options, this.modelId);

    // Start the stream — get a handle to read SSE lines
    const streamHandle = await postStream(this._transportConfig, { body: JSON.stringify(body) });

    // Create a ReadableStream that wraps our async generator
    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start: (controller) => {
        // Run the converter generator and push each part into the controller
        runConverter(controller, streamHandle);
      },
    });

    return {
      stream,
      request: {
        body: JSON.stringify(body),
      },
    };
  }
}

// ============================================================================
// Helper: Convert SSE lines → ReadableStream controller
// ============================================================================

async function runConverter(
  controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>,
  streamHandle: Parameters<typeof postStream>[0] extends BobTransportConfig ? any : never,
): Promise<void> {
  // Rebuild transport config from handle (we stored it on the handle)
  const lineReader = () => readNextSseLine(streamHandle);

  try {
    for await (const part of convertOpenAIStream(lineReader)) {
      controller.enqueue(part);
    }
    controller.close();
  } catch (error) {
    controller.error(error);
  }
}

// ============================================================================
// Factory Function — ibmBob()
// ============================================================================

/**
 * Create an IBM BOB language model instance.
 * 
 * @example
 * ```ts
 * // Static API key mode (legacy)
 * const model = ibmBob('ibm/granite-4-hybrid', { apiKey: 'sk-...' });
 * 
 * // OAuth2 mode — getToken resolves fresh tokens per-request
 * const auth = createAuthProvider({ oauthConfig, ... });
 * await auth.login();
 * const model = ibmBob('ibm/granite-4-hybrid', {
 *   getToken: () => auth.getAccessToken(),
 * });
 * 
 * // Use with AI SDK
 * const { text } = await generateText({ model, prompt: '...' });
 * ```
 */
export function ibmBob(
  modelId: string,
  settings?: BobAiProviderSettings,
): BobLanguageModel {
  return new BobLanguageModel({ ...settings, defaultModel: modelId });
}