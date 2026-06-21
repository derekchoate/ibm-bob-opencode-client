/**
 * Tests for BobLanguageModel, ibmBob factory, BobProvider and createBobAiProvider.
 */

import { BobLanguageModel } from '../model';
import { ibmBob } from '../model';
import { bob, createBobAiProvider, type BobProvider } from '../provider';
import type { BobAiProviderSettings } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSettings(overrides?: Partial<BobAiProviderSettings>): BobAiProviderSettings {
  return { baseUrl: 'https://api.example.com/inference/v1', apiKey: 'test-key', ...overrides };
}

// ─── ibmBob factory ──────────────────────────────────────────────────────────

describe('ibmBob factory function', () => {
  it('returns a BobLanguageModel instance with the correct modelId', () => {
    const model = ibmBob('ibm/granite-4-hybrid');
    expect(model).toBeInstanceOf(BobLanguageModel);
    expect(model.modelId).toBe('ibm/granite-4-hybrid');
  });

  it('uses "default" when no model is specified', () => {
    const model = ibmBob('');
    expect(model.modelId).toBe('');
  });

  it('passes settings through to the model', () => {
    const settings = makeSettings({ timeout: 10_000, getToken: async () => 'token' });
    const model = ibmBob('test-model', settings);
    const resolved = model.getSettings();
    expect(resolved.timeout).toBe(10_000);
    expect(resolved.getToken).toBeDefined();
  });

  it('returns a plain function (not a class, so new check is on provider)', () => {
    expect(typeof ibmBob).toBe('function');
  });

  it('includes default baseURL when not provided in settings', () => {
    const model = ibmBob('test-model');
    const settings = model.getSettings();
    expect(settings.baseUrl).toBeUndefined(); // ibmBob does NOT set a default; that's the provider's job
  });
});

// ─── BobLanguageModel ────────────────────────────────────────────────────────

describe('BobLanguageModel', () => {
  it('has specificationVersion of v3', () => {
    const model = ibmBob('test-model');
    expect(model.specificationVersion).toBe('v3');
  });

  it('returns "ibm-bob" as provider', () => {
    const model = ibmBob('test-model');
    expect(model.provider).toBe('ibm-bob');
  });

  it('has empty supportedUrls', () => {
    const model = ibmBob('test-model');
    expect(model.supportedUrls).toEqual({});
  });

  describe('doGenerate', () => {
    it('throws if getToken and apiKey are both missing', async () => {
      const model = ibmBob('test-model', {});
      await expect(model.doGenerate({ prompt: [] })).rejects.toThrow('No authentication configured');
    });

    it('calls the IBM BOB API with correct body on success (mocked fetch)', async () => {
      const mockResponse = {
        id: 'resp-1',
        object: 'chat.completion',
        created: Date.now(),
        model: 'test-model',
        choices: [{ index: 0, message: { role: 'assistant' as const, content: 'Hello!', tool_calls: null }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
        headers: new Map(),
      });

      const model = ibmBob('test-model', makeSettings());
      const result = await model.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text' as const, text: 'Hi' }] }] });

      expect(result.content).toEqual([{ type: 'text', text: 'Hello!' }]);
      expect(result.finishReason.unified).toBe('stop');
      expect(result.usage.inputTokens.total).toBe(5);
      expect(result.usage.outputTokens.total).toBe(3);

      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('/chat/completions');
      const body = JSON.parse(options.body);
      expect(body.model).toBe('test-model');
    });
  });

  describe('doStream', () => {
    it('returns a ReadableStream of LanguageModelV3StreamPart (mocked fetch)', async () => {
      // Build SSE data: each "data:" line followed by \n, then blank line to separate messages.
      const now = Date.now();
      const sseData = [
        'data: {"id":"s1","object":"chat.completion.chunk","created":' + now + ',"model":"m","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}',
        '',
        'data: {"id":"s1","object":"chat.completion.chunk","created":' + (now + 1) + ',"model":"m","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}',
        '',
        'data: {"id":"s1","object":"chat.completion.chunk","created":' + (now + 2) + ',"model":"m","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":8}}',
        '',
        'data: [DONE]',
        '',
      ].join('\n');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sseData));
            controller.close();
          },
        }),
      });

      const model = ibmBob('test-model', makeSettings());
      const result = await model.doStream({ prompt: [{ role: 'user', content: [{ type: 'text' as const, text: 'Hi' }] }] });

      expect(result.stream).toBeInstanceOf(ReadableStream);

      // Collect all stream parts
      const reader = result.stream.getReader();
      const parts: string[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value.type);
      }

      expect(parts).toContain('response-metadata');
      expect(parts).toContain('text-start');
      expect(parts).toContain('text-delta');
      expect(parts).toContain('text-end');
      expect(parts).toContain('finish');
    });
  });
});

// ─── createBobAiProvider ─────────────────────────────────────────────────────

describe('createBobAiProvider', () => {
  it('returns a callable function with .languageModel property', () => {
    const provider = createBobAiProvider();
    expect(typeof provider).toBe('function');
    expect(typeof provider.languageModel).toBe('function');
  });

  it('creates a model via direct call', () => {
    const provider = createBobAiProvider();
    const model = provider('ibm/granite-4-hybrid');
    expect(model.modelId).toBe('ibm/granite-4-hybrid');
    expect(model.provider).toBe('ibm-bob');
  });

  it('creates a model via .languageModel method', () => {
    const provider = createBobAiProvider();
    const model = provider.languageModel('ibm/granite-4-hybrid');
    expect(model.modelId).toBe('ibm/granite-4-hybrid');
  });

  it('throws when called with new keyword', () => {
    const provider = createBobAiProvider();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new (provider as any)()).toThrow(
      'The IBM BOB provider factory function cannot be called with the "new" keyword.',
    );
  });

  it('passes custom baseUrl to created models', () => {
    const provider = createBobAiProvider({ baseUrl: 'https://custom.api.com/v1' });
    const model = provider('test-model');
    expect(model.getSettings().baseUrl).toBe('https://custom.api.com/v1');
  });

  it('allows per-call settings to override provider defaults', () => {
    const provider = createBobAiProvider({ baseUrl: 'https://default.api.com' });
    const model = provider('test-model', { baseUrl: 'https://override.api.com' });
    expect(model.getSettings().baseUrl).toBe('https://override.api.com');
  });

  it('includes default base URL when no options provided', () => {
    const provider = createBobAiProvider();
    const model = provider('test-model');
    // The factory sets the default baseUrl in the settings
    expect(model.getSettings().baseUrl).toBe('https://api.us-east.bob.ibm.com/inference/v1');
  });
});

// ─── Default bob instance ────────────────────────────────────────────────────

describe('default bob instance', () => {
  it('is a callable BobProvider function', () => {
    expect(typeof bob).toBe('function');
    expect(typeof (bob as any).languageModel).toBe('function');
  });

  it('creates models with the default base URL', () => {
    const model = bob('ibm/granite-4-hybrid');
    expect(model.modelId).toBe('ibm/granite-4-hybrid');
    expect(model.provider).toBe('ibm-bob');
  });

  it('uses the default base URL', () => {
    const model = bob('test-model');
    expect(model.getSettings().baseUrl).toBe('https://api.us-east.bob.ibm.com/inference/v1');
  });
});

// ─── BobProvider type ────────────────────────────────────────────────────────

describe('BobProvider interface', () => {
  it('has correct signature for callable and languageModel', () => {
    const provider = createBobAiProvider() as unknown as BobProvider;
    // Both should return the same model ID
    const m1 = provider('model-1');
    const m2 = provider.languageModel('model-1');
    expect(m1.modelId).toBe(m2.modelId);
  });
});