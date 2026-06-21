/**
 * IBM BOB HTTP Transport Layer
 * 
 * Shared transport for making requests to the IBM BOB OpenAI-compatible API.
 * Handles timeout, streaming, auth header injection via configurable token resolver function.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Options for a single API request.
 */
export interface TransportRequestOptions {
  /** Request body (already serialized to JSON by the caller) */
  body: string;
  /** Whether this is a streaming request */
  stream?: boolean;
  /** Abort signal for cancelling the request */
  abortSignal?: AbortSignal;
  /** Additional headers beyond auth and content-type */
  extraHeaders?: Record<string, string>;
}

/**
 * Parsed non-streaming API response.
 */
export interface ParsedResponse {
  data: unknown;
  raw: Response;
}

/**
 * Streaming response with a readable stream reader.
 */
export interface StreamHandle {
  /** The underlying Response object */
  response: Response;
  /** Text decoder for the streaming body */
  decoder: TextDecoder;
  /** Buffer accumulator for incomplete lines */
  buffer: string;
  /** Cached reader — created lazily on first use and reused across calls */
  _reader?: ReadableStreamDefaultReader<Uint8Array>;
  /** Queue of complete SSE data messages (each message is separated by a blank line) */
  _messageQueue: string[];
}

// ============================================================================
// Transport Configuration
// ============================================================================

export interface BobTransportConfig {
  /** Base URL for the API (e.g., https://api.us-east.bob.ibm.com/inference/v1) */
  baseUrl: string;
  /** Request endpoint path (defaults to '/chat/completions') */
  path?: string;
  /** Timeout in milliseconds */
  timeout: number;
  /** Static API key (legacy mode). Either this or getToken must be provided. */
  apiKey?: string;
  /** Async function that resolves a fresh access token per-request (OAuth2 mode) */
  getToken?: () => Promise<string>;
  /** Extra headers to include on every request. Accepts either a static object or a lazy resolver function for OAuth token refresh support. */
  headers?: Record<string, string> | (() => Record<string, string>);
  /** Custom fetch implementation (for testing or middleware) */
  fetcher?: typeof fetch;
}

/** Resolve the Authorization header value. */
async function resolveAuthToken(config: BobTransportConfig): Promise<string> {
  if (config.apiKey) {
    return config.apiKey;
  }
  if (config.getToken) {
    return config.getToken();
  }
  throw new Error('No authentication configured. Provide apiKey or getToken.');
}

/** Build the final request headers object. */
function buildHeaders(
  token: string,
  stream: boolean,
  config: BobTransportConfig,
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  const base: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  if (stream) {
    base.Accept = 'text/event-stream';
  }

  // Resolve headers — supports both static object and lazy function for OAuth refresh
  const resolvedHeaders = typeof config.headers === 'function'
    ? config.headers()
    : config.headers;

  if (resolvedHeaders) {
    Object.assign(base, resolvedHeaders);
  }

  if (extraHeaders) {
    Object.assign(base, extraHeaders);
  }

  return base;
}

/** Build the full URL for the request. */
function buildUrl(config: BobTransportConfig): string {
  const path = config.path ?? '/chat/completions';
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  return `${baseUrl}${path}`;
}

// ============================================================================
// Non-streaming Request
// ============================================================================

export async function postJson(
  config: BobTransportConfig,
  options: TransportRequestOptions,
): Promise<ParsedResponse> {
  const token = await resolveAuthToken(config);
  const url = buildUrl(config);
  const headers = buildHeaders(token, false, config, options.extraHeaders);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await (config.fetcher ?? fetch)(url, {
      method: 'POST',
      headers,
      body: options.body,
      signal: options.abortSignal ?? controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `IBM BOB API error (${response.status}): ${errorText}`
      );
    }

    const data = await response.json();
    return { data, raw: response };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `IBM BOB API request timed out after ${config.timeout}ms`
      );
    }
    throw error;
  }
}

// ============================================================================
// Streaming Request
// ============================================================================

export async function postStream(
  config: BobTransportConfig,
  options: TransportRequestOptions,
): Promise<StreamHandle> {
  const token = await resolveAuthToken(config);
  const url = buildUrl(config);
  const headers = buildHeaders(token, true, config, options.extraHeaders);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await (config.fetcher ?? fetch)(url, {
      method: 'POST',
      headers,
      body: options.body,
      signal: options.abortSignal ?? controller.signal,
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

    return {
      response,
      decoder: new TextDecoder(),
      buffer: '',
      _messageQueue: [],
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `IBM BOB streaming request timed out after ${config.timeout}ms`
      );
    }
    throw error;
  }
}

/** Lazily get or create a reader for the stream handle. */
async function getStreamReader(handle: StreamHandle): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  if (!handle._reader) {
    if (handle.response.body) {
      handle._reader = handle.response.body.getReader();
    } else {
      throw new Error('Response body is null');
    }
  }
  return handle._reader;
}

// ============================================================================
// SSE Line Parser
// ============================================================================

/**
 * Read the next SSE data message from a stream handle.
 * 
 * An SSE "message" is everything between blank lines. When we encounter `data: ...`,
 * we extract the JSON payload and queue up any remaining complete messages so that
 * subsequent calls to this function can return them without re-reading from the reader.
 */
export async function readNextSseLine(
  handle: StreamHandle,
): Promise<string | null> {
  const { response, decoder } = handle;

  // We mutate handle.buffer directly (TS doesn't see side effects through destructuring)
  let buf = handle.buffer;
  const queue = handle._messageQueue;

  // If we have queued messages from a previous bulk read, return the next one.
  if (queue.length > 0) {
    return queue.shift() ?? null;
  }

  if (!response.body) {
    return null;
  }

  const reader = await getStreamReader(handle);

  while (true) {
    const { done, value } = await reader.read();
    if (done && buf.length === 0) {
      return null;
    }

    buf += decoder.decode(value, { stream: true });

    // Split by newline. The last element may be incomplete.
    const lines = buf.split('\n');
    buf = lines.pop() || '';

    // Scan through lines, collecting data messages separated by blank lines.
    // Multi-line SSE values (multiple consecutive `data:` lines) are joined with newlines.
    const collectedMessages: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Blank line — message boundary, skip it
      if (!trimmed) {
        continue;
      }

      // [DONE] — streaming sentinel, skip it
      if (trimmed === 'data: [DONE]') {
        continue;
      }

      // Non-data line (id:, event:, etc.) — skip it
      if (!trimmed.startsWith('data: ')) {
        continue;
      }

      // Collect consecutive data lines into one message value.
      const parts = [trimmed.slice(6)];
      let j = i + 1;

      while (j < lines.length) {
        const nextTrimmed = lines[j].trim();
        // Blank line or [DONE] marks the end of this message's data section
        if (!nextTrimmed || nextTrimmed === 'data: [DONE]') {
          break;
        }
        if (nextTrimmed.startsWith('data: ')) {
          parts.push(nextTrimmed.slice(6));
          j++;
        } else {
          // Non-data line — stop collecting
          break;
        }
      }

      collectedMessages.push(parts.join('\n'));
      i = j - 1; // advance past this message's lines
    }

    if (collectedMessages.length > 0) {
      // Return first collected message. Queue the rest for subsequent calls.
      const [firstMessage, ...rest] = collectedMessages;
      queue.push(...rest);
      return firstMessage;
    }

    // If stream ended without finding a data message, flush and return null.
    if (done) {
      handle.buffer = '';
      return null;
    }
  }
}
