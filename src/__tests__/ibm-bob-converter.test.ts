/**
 * Tests for IBM BOB Format Converter — LangSpec V3 ↔ OpenAI format conversion.
 */

import {
  convertToOpenAIRequestBody,
  convertOpenAIResponse,
  createEmptyWarnings,
} from '../ibm-bob-converter';
import type { LanguageModelV3CallOptions } from '@ai-sdk/provider';

// ─── convertToOpenAIRequestBody ──────────────────────────────────────────────

describe('convertToOpenAIRequestBody', () => {
  const basePrompt = [
    { role: 'system' as const, content: 'You are helpful.' },
    { role: 'user' as const, content: [{ type: 'text' as const, text: 'Hello' }] },
  ] as unknown as LanguageModelV3CallOptions['prompt'];

  it('converts basic prompt to OpenAI body', () => {
    const options = { prompt: basePrompt } as LanguageModelV3CallOptions;
    const result = convertToOpenAIRequestBody(options, 'test-model');

    expect(result).toMatchObject({
      model: 'test-model',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ],
    });
  });

  it('includes optional parameters when provided', () => {
    const options = {
      prompt: basePrompt,
      temperature: 0.7,
      maxOutputTokens: 100,
      topP: 0.9,
      frequencyPenalty: 0.5,
      presencePenalty: 0.3,
    } as unknown as LanguageModelV3CallOptions;

    const result = convertToOpenAIRequestBody(options, 'test-model');

    expect(result).toMatchObject({
      temperature: 0.7,
      max_tokens: 100,
      top_p: 0.9,
      frequency_penalty: 0.5,
      presence_penalty: 0.3,
    });
  });

  it('includes stopSequences when provided', () => {
    const options = {
      prompt: basePrompt,
      stopSequences: ['\n\n', 'END'],
    } as unknown as LanguageModelV3CallOptions;

    const result = convertToOpenAIRequestBody(options, 'test-model');
    expect(result.stop).toEqual(['\n\n', 'END']);
  });

  it('includes seed when provided', () => {
    const options = {
      prompt: basePrompt,
      seed: 42,
    } as unknown as LanguageModelV3CallOptions;

    const result = convertToOpenAIRequestBody(options, 'test-model');
    expect(result.seed).toBe(42);
  });

  it('includes response_format when type is json', () => {
    const options = {
      prompt: basePrompt,
      responseFormat: { type: 'json' as const },
    } as unknown as LanguageModelV3CallOptions;

    const result = convertToOpenAIRequestBody(options, 'test-model');
    expect(result.response_format).toEqual({ type: 'json_object' });
  });

  it('includes tools when provided', () => {
    const options = {
      prompt: basePrompt,
      tools: [
        {
          type: 'function' as const,
          name: 'get_weather',
          description: 'Get the weather for a location',
          inputSchema: {
            type: 'object' as const,
            properties: {
              location: { type: 'string' as const },
            },
          } as unknown,
        },
      ],
    } as unknown as LanguageModelV3CallOptions;

    const result = convertToOpenAIRequestBody(options, 'test-model');
    expect(result.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the weather for a location',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' },
            },
          },
        },
      },
    ]);
  });

  it('converts tool choice auto', () => {
    const options = {
      prompt: basePrompt,
      toolChoice: { type: 'auto' as const },
    } as unknown as LanguageModelV3CallOptions;

    const result = convertToOpenAIRequestBody(options, 'test-model');
    expect(result.tool_choice).toBe('auto');
  });

  it('converts tool choice none', () => {
    const options = {
      prompt: basePrompt,
      toolChoice: { type: 'none' as const },
    } as unknown as LanguageModelV3CallOptions;

    const result = convertToOpenAIRequestBody(options, 'test-model');
    expect(result.tool_choice).toBe('none');
  });

  it('converts tool choice required', () => {
    const options = {
      prompt: basePrompt,
      toolChoice: { type: 'required' as const },
    } as unknown as LanguageModelV3CallOptions;

    const result = convertToOpenAIRequestBody(options, 'test-model');
    expect(result.tool_choice).toBe('required');
  });

  it('converts tool choice specific tool', () => {
    const options = {
      prompt: basePrompt,
      toolChoice: { type: 'tool' as const, toolName: 'get_weather' },
    } as unknown as LanguageModelV3CallOptions;

    const result = convertToOpenAIRequestBody(options, 'test-model');
    expect(result.tool_choice).toEqual({
      type: 'function',
      function: { name: 'get_weather' },
    });
  });

  it('handles assistant message with tool calls', () => {
    const prompt = [
      { role: 'assistant' as const, content: [{
        type: 'tool-call' as const,
        toolCallId: 'tc-1',
        toolName: 'get_weather',
        input: { location: 'London' },
      }] } as unknown as LanguageModelV3CallOptions['prompt'][0],
    ];

    const options = { prompt } as LanguageModelV3CallOptions;
    const result = convertToOpenAIRequestBody(options, 'test-model');

    expect(result.messages[0]).toMatchObject({
      role: 'assistant',
      tool_calls: [
        {
          id: 'tc-1',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"location":"London"}' },
        },
      ],
    });
  });

  it('handles tool result messages', () => {
    const prompt = [
      { role: 'tool' as const, content: [{
        type: 'tool-result' as const,
        toolCallId: 'tc-1',
        output: '{"temp": 20}',
      }] } as unknown as LanguageModelV3CallOptions['prompt'][0],
    ];

    const options = { prompt } as LanguageModelV3CallOptions;
    const result = convertToOpenAIRequestBody(options, 'test-model');

    expect(result.messages[0]).toMatchObject({
      role: 'tool',
      content: '{"temp": 20}',
      tool_call_id: 'tc-1',
    });
  });
});

// ─── convertOpenAIResponse ──────────────────────────────────────────────────

describe('convertOpenAIResponse', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeChoice(overrides: Partial<{ message: { role: string; content: string | null; tool_calls: any }; finish_reason: string } & { usage: any }> = {} as any) {
    return {
      index: 0,
      message: { role: 'assistant' as const, content: '', tool_calls: null, ...overrides.message },
      finish_reason: 'stop',
      ...overrides,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeResponse(overrides: Partial<{ choices: any[]; usage: any }> = {} as any) {
    return {
      id: 'resp-1',
      object: 'chat.completion',
      created: Date.now(),
      model: 'test-model',
      choices: [makeChoice()],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      ...overrides,
    };
  }

  it('converts a basic text response', () => {
    const result = convertOpenAIResponse(makeResponse({
      choices: [{ index: 0, message: { role: 'assistant' as const, content: 'Hello!', tool_calls: null }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }));

    expect(result.content).toEqual([{ type: 'text', text: 'Hello!' }]);
    expect(result.finishReason.unified).toBe('stop');
    expect(result.usage.inputTokens.total).toBe(10);
    expect(result.usage.outputTokens.total).toBe(5);
  });

  it('converts a tool call response', () => {
    const result = convertOpenAIResponse(makeResponse({
      choices: [{
        index: 0,
        message: {
          role: 'assistant' as const,
          content: null,
          tool_calls: [
            { id: 'tc-1', type: 'function', function: { name: 'get_weather', arguments: '{"location":"London"}' } },
          ],
        },
        finish_reason: 'tool_calls',
      }],
      usage: null,
    }));

    expect(result.content).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.content[0] as any).type).toBe('tool-call');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.content[0] as any).toolCallId).toBe('tc-1');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.content[0] as any).toolName).toBe('get_weather');
  });

  it('throws when no choices returned', () => {
    const response = makeResponse({ choices: [] });
    expect(() => convertOpenAIResponse(response)).toThrow(
      'No choices returned from IBM BOB API',
    );
  });

  it('maps finish reason length', () => {
    const result = convertOpenAIResponse(makeResponse({
      choices: [{ index: 0, message: { role: 'assistant' as const, content: 'x', tool_calls: null }, finish_reason: 'length' }],
    }));
    expect(result.finishReason.unified).toBe('length');
  });

  it('maps finish reason content-filter', () => {
    const result = convertOpenAIResponse(makeResponse({
      choices: [{ index: 0, message: { role: 'assistant' as const, content: 'x', tool_calls: null }, finish_reason: 'content_filter' }],
    }));
    expect(result.finishReason.unified).toBe('content-filter');
  });

  it('maps finish reason tool-calls', () => {
    const result = convertOpenAIResponse(makeResponse({
      choices: [{ index: 0, message: { role: 'assistant' as const, content: null, tool_calls: [] }, finish_reason: 'tool_calls' }],
    }));
    expect(result.finishReason.unified).toBe('tool-calls');
  });
});

// ─── createEmptyWarnings ─────────────────────────────────────────────────────

describe('createEmptyWarnings', () => {
  it('returns an empty array', () => {
    const result = createEmptyWarnings();
    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });
});