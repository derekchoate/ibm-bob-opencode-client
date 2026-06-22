/**
 * IBM BOB Format Converter — LangSpec V3 ↔ OpenAI format conversion.
 * 
 * Converts between AI SDK LanguageModelV3 call options and the
 * OpenAI-compatible chat completions API request/response shapes.
 */

import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
  LanguageModelV3TextPart,
  LanguageModelV3ToolChoice,
  LanguageModelV3Usage,
  SharedV3Warning,
} from '@ai-sdk/provider';

// ============================================================================
// OpenAI API Type Definitions (minimal subset for conversion)
// ============================================================================

export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface OpenAIChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }> | null;
  };
  finish_reason: string | null;
}

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: OpenAIUsage | null;
}

export interface OpenAIStreamDelta {
  role?: string;
  content?: string | null;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    type?: 'function';
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

export interface OpenAIStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: OpenAIStreamDelta;
    finish_reason: string | null;
  }>;
  usage: OpenAIUsage | null;
}

// ============================================================================
// Convert LanguageModelV3CallOptions → OpenAI request body (Record<string, any>)
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
export function convertToOpenAIRequestBody(
  options: LanguageModelV3CallOptions,
  defaultModel: string,
): Record<string, any> {
  const messages = convertMessages(options.prompt);

  const body: Record<string, any> = {
    model: defaultModel,
    messages,
    temperature: options.temperature,
    max_tokens: options.maxOutputTokens,
    top_p: options.topP,
    frequency_penalty: options.frequencyPenalty,
    presence_penalty: options.presencePenalty,
  };

  if (options.stopSequences && options.stopSequences.length > 0) {
    body.stop = options.stopSequences;
  }

  if (options.seed !== undefined) {
    body.seed = options.seed;
  }

  // Response format
  if (options.responseFormat?.type === 'json') {
    body.response_format = { type: 'json_object' };
    if (options.responseFormat.schema) {
      body.response_format.schema = options.responseFormat.schema as Record<string, unknown>;
    }
  } else if (options.responseFormat?.type === 'text') {
    // text is the default, no special handling needed
  }

  // Tools
  if (options.tools && options.tools.length > 0) {
    body.tools = convertTools(options.tools);
  }

  // Tool choice
  if (options.toolChoice) {
    body.tool_choice = convertToolChoice(options.toolChoice);
  }

  /* eslint-enable @typescript-eslint/no-explicit-any */
  return body;
}

// ============================================================================
// Convert LangSpec V3 prompt → OpenAI messages array
// ============================================================================

function convertMessages(prompt: LanguageModelV3Prompt): OpenAIChatMessage[] {
  const messages: OpenAIChatMessage[] = [];

  for (const msg of prompt) {
    if (msg.role === 'system') {
      // System messages have string content directly
      messages.push({
        role: 'system',
        content: msg.content,
      });
    } else if (msg.role === 'user') {
      // User messages have content array of TextPart | FilePart — convert to single text string
      const content = userContentToText(msg.content as Array<LanguageModelV3TextPart>);
      messages.push({
        role: 'user',
        content,
      });
    } else if (msg.role === 'assistant') {
      // Assistant message with content array
      const assistantMsg: OpenAIChatMessage = {
        role: 'assistant',
        content: '',
      };

      // Collect text and tool-call parts
      for (const part of msg.content) {
        if (part.type === 'text') {
          assistantMsg.content += (assistantMsg.content ? '\n' : '') + part.text;
        } else if (part.type === 'tool-call') {
          if (!assistantMsg.tool_calls) {
            assistantMsg.tool_calls = [];
          }
          assistantMsg.tool_calls.push({
            id: part.toolCallId,
            type: 'function',
            function: {
              name: part.toolName,
              arguments: JSON.stringify(part.input),
            },
          });
        }
      }

      // Only add if there's content or tool calls
      if (assistantMsg.content || assistantMsg.tool_calls) {
        messages.push(assistantMsg);
      }
    } else if (msg.role === 'tool') {
      // Tool result messages — each tool-result part becomes a separate message
      for (const part of msg.content) {
        if (part.type === 'tool-result') {
          const content = typeof part.output === 'string'
            ? part.output
            : JSON.stringify(part.output);
          messages.push({
            role: 'tool',
            content,
            tool_call_id: part.toolCallId,
          });
        }
      }
    }
  }

  return messages;
}

/**
 * Convert user message content (TextPart | FilePart) to a single text string.
 */
function userContentToText(parts: Array<LanguageModelV3TextPart>): string {
  const texts: string[] = [];
  for (const part of parts) {
    if (part.type === 'text') {
      texts.push(part.text);
    }
    // File parts are not supported in OpenAI chat completions text format; skip
  }
  return texts.join('\n');
}

// ============================================================================
// Convert LangSpec V3 tools → OpenAI tools format
// ============================================================================

function convertTools(
  tools: LanguageModelV3CallOptions['tools'],
): Array<{ type: 'function'; function: { name: string; description: string; parameters: unknown } }> {
  return (tools ?? []).map((tool) => {
    if (tool.type === 'function') {
      return {
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description ?? '',
          parameters: tool.inputSchema as unknown,
        },
      };
    }
    // Skip non-function tools (provider-defined tools)
    return null;
  }).filter((t): t is NonNullable<typeof t> => t != null);
}

// ============================================================================
// Convert LangSpec V3 tool choice → OpenAI format
// ============================================================================

function convertToolChoice(
  toolChoice: LanguageModelV3ToolChoice,
): Record<string, unknown> | string {
  if (toolChoice.type === 'auto') {
    return 'auto';
  }
  if (toolChoice.type === 'none') {
    return 'none';
  }
  if (toolChoice.type === 'required') {
    // OpenAI uses "any" for required tool usage, but some providers use "required"
    return 'required';
  }
  if (toolChoice.type === 'tool') {
    const name = toolChoice.toolName;
    return { type: 'function', function: { name } };
  }
  return {};
}

// ============================================================================
// Convert OpenAI response → LangSpec V3 result
// ============================================================================

export function convertOpenAIResponse(
  response: OpenAIChatResponse,
): Omit<LanguageModelV3GenerateResult, 'warnings' | 'request'> {
  const choice = response.choices[0];
  if (!choice) {
    throw new Error('No choices returned from IBM BOB API');
  }

  const content: LanguageModelV3Content[] = [];

  // Text content
  if (choice.message.content != null && choice.message.content.length > 0) {
    content.push({ type: 'text', text: choice.message.content });
  }

  // Tool calls
  if (choice.message.tool_calls != null && choice.message.tool_calls.length > 0) {
    for (const tc of choice.message.tool_calls) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = { _raw: tc.function.arguments };
      }
      const toolCallInput = args as unknown;
      content.push({
        type: 'tool-call',
        toolCallId: tc.id,
        toolName: tc.function.name,
        input: toolCallInput,
      } as LanguageModelV3Content);
    }
  }

  // Finish reason
  const finishReason = mapFinishReason(choice.finish_reason);

  // Usage — V3 usage has nested structure for inputTokens and outputTokens
  const usage: LanguageModelV3Usage = response.usage
    ? {
        inputTokens: {
          total: response.usage.prompt_tokens ?? 0,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: response.usage.completion_tokens ?? 0,
          text: undefined,
          reasoning: undefined,
        },
      }
    : {
        inputTokens: { total: 0, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 0, text: undefined, reasoning: undefined },
      };

  return { content, finishReason, usage };
}

// ============================================================================
// Convert OpenAI streaming chunk → LangSpec V3 stream parts (generator)
// ============================================================================

export async function* convertOpenAIStream(
  lineReader: () => Promise<string | null>,
): AsyncGenerator<LanguageModelV3StreamPart> {
  let isFirstChunk = true;
  const currentTextId = 'txt-0';
  let isActiveText = false;
  let finishReason: LanguageModelV3FinishReason = { unified: 'other', raw: undefined };
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Track tool calls by index
  const pendingToolCalls = new Map<number, {
    id: string | null;
    argumentsBuffer: string;
    name: string | null;
  }>();
  const forwardedIndices = new Set<number>();

  while (true) {
    const line = await lineReader();
    if (line === null) break;

    // Parse the JSON chunk
    let chunk: OpenAIStreamChunk;
    try {
      chunk = JSON.parse(line) as OpenAIStreamChunk;
    } catch {
      continue; // Skip invalid JSON
    }

    // Emit response metadata on first chunk
    if (isFirstChunk) {
      isFirstChunk = false;
      yield {
        type: 'response-metadata',
        id: chunk.id,
        timestamp: new Date(chunk.created),
        modelId: chunk.model,
      };
    }

    // Track usage
    if (chunk.usage != null) {
      totalInputTokens = chunk.usage.prompt_tokens ?? totalInputTokens;
      totalOutputTokens = chunk.usage.completion_tokens ?? totalOutputTokens;
    }

    const choice = chunk.choices[0];
    if (!choice || !choice.delta) continue;

    // Update finish reason
    if (choice.finish_reason != null) {
      finishReason = mapFinishReason(choice.finish_reason);
    }

    const delta = choice.delta;

    // Text content
    if (delta.content != null && delta.content.length > 0) {
      if (!isActiveText) {
        yield { type: 'text-start', id: currentTextId };
        isActiveText = true;
      }
      yield { type: 'text-delta', id: currentTextId, delta: delta.content };
    }

    // Tool calls
    if (delta.tool_calls != null && delta.tool_calls.length > 0) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;

        // If we already forwarded this index, emit directly
        if (forwardedIndices.has(idx)) {
          if (tc.function?.arguments != null) {
            yield {
              type: 'tool-input-delta',
              id: `tool-${idx}`,
              delta: tc.function.arguments,
            };
          }
          continue;
        }

        // Buffer until we get the function name
        let pending = pendingToolCalls.get(idx);
        if (!pending) {
          pending = { id: null, argumentsBuffer: '', name: null };
          pendingToolCalls.set(idx, pending);
        } else {
          if (pending.id === null && tc.id != null) {
            pending.id = tc.id;
          }
        }

        if (tc.function?.arguments != null) {
          pending.argumentsBuffer += tc.function.arguments;
        }

        if (tc.function?.name != null) {
          const toolCallId = pending.id ?? `call-${idx}`;
          yield {
            type: 'tool-input-start',
            id: toolCallId,
            toolName: tc.function.name,
          };
          yield {
            type: 'tool-input-delta',
            id: toolCallId,
            delta: pending.argumentsBuffer,
          };
          yield { type: 'tool-input-end', id: toolCallId };
          forwardedIndices.add(idx);
          pendingToolCalls.delete(idx);
        }
      }
    }
  }

  // Flush active text block
  if (isActiveText) {
    yield { type: 'text-end', id: currentTextId };
  }

  // Flush any pending tool calls that never got a name
  for (const [idx, pending] of pendingToolCalls) {
    const toolCallId = pending.id ?? `call-${idx}`;
    if (pending.name) {
      yield { type: 'tool-input-start', id: toolCallId, toolName: pending.name };
    }
    yield { type: 'tool-input-delta', id: toolCallId, delta: pending.argumentsBuffer };
    yield { type: 'tool-input-end', id: toolCallId };
  }

  // Emit finish
  yield {
    type: 'finish',
    usage: {
      inputTokens: {
        total: totalInputTokens,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: totalOutputTokens,
        text: undefined,
        reasoning: undefined,
      },
    },
    finishReason,
  };
}

// ============================================================================
// Finish reason mapping
// ============================================================================

function mapFinishReason(raw: string | null): LanguageModelV3FinishReason {
  if (raw == null) return { unified: 'other', raw: undefined };

  switch (raw) {
    case 'stop':
      return { unified: 'stop', raw };
    case 'length':
      return { unified: 'length', raw };
    case 'content_filter':
      return { unified: 'content-filter', raw };
    case 'tool_calls':
      return { unified: 'tool-calls', raw };
    default:
      return { unified: 'other', raw };
  }
}

// ============================================================================
// Warning conversion (empty — no warnings by default)
// ============================================================================

export function createEmptyWarnings(): SharedV3Warning[] {
  return [];
}