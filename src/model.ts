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

import {
  postJson,
  postStream,
  readNextSseLine,
  BobTransportConfig,
} from './ibm-bob-transport';

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

    // Build the transport configuration from settings
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

  // ============================================================================
  // LanguageModelV3 Implementation
  // ============================================================================

  /**
   * Generate a non-streaming completion.
   */
  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {

    const body = convertToOpenAIRequestBody(options, this.modelId);

    const responseBody = await postJson(
      this._transportConfig,
      { body: JSON.stringify(body) },
    );

    const parsed = convertOpenAIResponse(
      responseBody.data as Parameters<typeof convertOpenAIResponse>[0],
    );

    return wrapGenerateResult(
      parsed,
      responseBody,
      body,
      this.modelId,
    );
  }

  /**
   * Generate a streaming completion.
   */
  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {

    const body = convertToOpenAIRequestBody(options, this.modelId);

    // Start the stream — get a handle to read SSE lines
    const streamHandle = await postStream(
      this._transportConfig,
      { body: JSON.stringify(body) },
    );

    // Create a ReadableStream that wraps our async generator
    const stream = createStreamFromConverter(streamHandle);

    return {
      stream,
      request: {
        body: JSON.stringify(body),
      },
    };
  }
}

// ============================================================================
// Helper: Wrap doGenerate result
// ============================================================================

/**
 * Wrap the parsed response into a full LanguageModelV3GenerateResult.
 */
function wrapGenerateResult(
  parsed: Omit<LanguageModelV3GenerateResult, 'warnings' | 'request'>,
  responseBody: Awaited<ReturnType<typeof postJson>>,
  body: Record<string, unknown>,
  modelId: string,
): LanguageModelV3GenerateResult {

  return {
    content: parsed.content,
    finishReason: parsed.finishReason,
    usage: parsed.usage,
    warnings: createEmptyWarnings(),
    request: {
      body: JSON.stringify(body),
    },
    response: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      id: (responseBody.raw as any).id ?? '',
      timestamp: new Date(),
      modelId,
      headers: Object.fromEntries(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (responseBody.raw as any).headers || {},
      ),
    },
  };
}

// ============================================================================
// Helper: Convert SSE lines → ReadableStream controller
// ============================================================================

/**
 * Create a ReadableStream from the stream converter generator.
 */
function createStreamFromConverter(
  streamHandle: Awaited<ReturnType<typeof postStream>>,
): ReadableStream<LanguageModelV3StreamPart> {

  return new ReadableStream<LanguageModelV3StreamPart>({
    start: (controller) => {
      runConverter(controller, streamHandle);
    },
  });
}

/**
 * Run the converter and push each part into the controller.
 */
async function runConverter(
  controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>,
  streamHandle: Awaited<ReturnType<typeof postStream>>,
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