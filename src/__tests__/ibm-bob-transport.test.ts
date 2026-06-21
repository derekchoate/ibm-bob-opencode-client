/**
 * Tests for IBM BOB HTTP Transport Layer
 */

import {
  postJson,
  postStream,
  readNextSseLine,
  BobTransportConfig,
} from '../ibm-bob-transport';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<BobTransportConfig>): BobTransportConfig {
  return {
    baseUrl: 'https://api.example.com/inference/v1',
    path: '/chat/completions',
    timeout: 5000,
    apiKey: 'test-key',
    ...overrides,
  };
}

function mockFetchResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return {
    ok: true,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Map(Object.entries(extraHeaders)),
    blob: async () => new Blob(),
    clone: () => mockFetchResponse(body, status, extraHeaders),
    redirected: false,
    statusText: status === 200 ? 'OK' : 'Error',
    type: 'basic' as const,
    url: '',
    arrayBuffer: async () => new ArrayBuffer(0),
    formData: async () => new FormData(),
    bytes: async () => new Uint8Array(0),
  } as unknown as Response;
}

// ─── postJson — success ──────────────────────────────────────────────────────

describe('postJson', () => {
  it('sends a POST request with auth header and returns parsed JSON', async () => {
    const expectedBody = { model: 'test-model', messages: [{ role: 'user', content: 'hello' }] };
    const responseBody = { id: 'resp-1', choices: [], usage: null };

    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse(responseBody));

    const config = makeConfig();
    const result = await postJson(config, { body: JSON.stringify(expectedBody) });

    expect(result.data).toEqual(responseBody);

    // Verify request details
    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    expect(callArgs[0]).toBe('https://api.example.com/inference/v1/chat/completions');
    expect(callArgs[1].method).toBe('POST');
    expect(JSON.parse(callArgs[1].body)).toEqual(expectedBody);
    expect(callArgs[1].headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
    });
  });

  it('uses getToken to resolve auth token when apiKey is not provided', async () => {
    const responseBody = { id: 'resp-2', choices: [], usage: null };
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse(responseBody));

    const config = makeConfig({ apiKey: undefined, getToken: async () => 'oauth-token' });
    await postJson(config, { body: JSON.stringify({}) });

    const callArgs2 = (global.fetch as jest.Mock).mock.calls[0];
    expect(callArgs2[1].headers.Authorization).toBe('Bearer oauth-token');
  });

  it('throws on non-200 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    } as Response);

    const config = makeConfig();
    await expect(
      postJson(config, { body: JSON.stringify({}) }),
    ).rejects.toThrow('IBM BOB API error (429): Rate limit exceeded');
  });

  it('throws when externally-provided AbortError is caught', async () => {
    const controller = new AbortController();

    global.fetch = jest.fn().mockImplementation(async (_url: string, options: { signal: AbortSignal }) => {
      await new Promise<void>((_resolve, reject) => {
        if (options.signal.aborted) {
          const err = new Error('aborted') as Error & { name?: string };
          err.name = 'AbortError';
          reject(err);
          return;
        }
        options.signal.addEventListener('abort', () => {
          const err = new Error('aborted') as Error & { name?: string };
          err.name = 'AbortError';
          reject(err);
        });
      });
      return {} as Response;
    });

    // Abort before calling postJson — the transport should catch this AbortError and re-throw.
    controller.abort();

    const config = makeConfig({ timeout: 5000, fetcher: global.fetch as unknown as typeof fetch });
    await expect(
      postJson(config, { body: JSON.stringify({}), abortSignal: controller.signal }),
    ).rejects.toThrow(/timed out/);
  });

  it('includes extra headers when provided', async () => {
    const responseBody = { id: 'resp-3', choices: [], usage: null };
    global.fetch = jest.fn().mockResolvedValue(mockFetchResponse(responseBody));

    const config = makeConfig();
    await postJson(config, { body: JSON.stringify({}), extraHeaders: { 'X-Custom': 'value' } });

    const callArgs4 = (global.fetch as jest.Mock).mock.calls[0];
    expect(callArgs4[1].headers['X-Custom']).toBe('value');
  });

  it('uses custom fetcher when provided', async () => {
    const responseBody = { id: 'resp-4', choices: [], usage: null };
    const customFetcher = jest.fn().mockResolvedValue(mockFetchResponse(responseBody));

    const config = makeConfig({ fetcher: customFetcher as unknown as typeof fetch });
    await postJson(config, { body: JSON.stringify({}) });

    expect(customFetcher).toHaveBeenCalled();
  });
});

// ─── postStream — success ────────────────────────────────────────────────────

describe('postStream', () => {
  it('sends a POST request with Accept header for streaming', async () => {
    const bodyStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"id":"s1"}\n\n'));
        controller.close();
      },
    });

    global.fetch = jest.fn().mockResolvedValue(
      ({
        ok: true,
        status: 200,
        body: bodyStream,
        headers: new Map(),
      } as unknown) as Response,
    );

    const config = makeConfig();
    const result = await postStream(config, { body: JSON.stringify({}) });

    expect(result.decoder).toBeInstanceOf(TextDecoder);
    expect(result.buffer).toBe('');

    // Verify Accept header
    const callArgs3 = (global.fetch as jest.Mock).mock.calls[0];
    expect(callArgs3[1].headers.Accept).toBe('text/event-stream');
  });

  it('throws when response body is null', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      ({
        ok: true,
        status: 200,
        body: null,
      } as unknown) as Response,
    );

    const config = makeConfig();
    await expect(
      postStream(config, { body: JSON.stringify({}) }),
    ).rejects.toThrow('Response body is null');
  });

  it('throws when externally-provided AbortError is caught', async () => {
    const controller = new AbortController();

    global.fetch = jest.fn().mockImplementation(async (_url: string, options: { signal: AbortSignal }) => {
      await new Promise<void>((_resolve, reject) => {
        if (options.signal.aborted) {
          const err = new Error('aborted') as Error & { name?: string };
          err.name = 'AbortError';
          reject(err);
          return;
        }
        options.signal.addEventListener('abort', () => {
          const err = new Error('aborted') as Error & { name?: string };
          err.name = 'AbortError';
          reject(err);
        });
      });
      return {} as Response;
    });

    // Abort before calling postStream — the transport should catch this AbortError and re-throw.
    controller.abort();

    const config = makeConfig({ timeout: 5000, fetcher: global.fetch as unknown as typeof fetch });
    await expect(
      postStream(config, { body: JSON.stringify({}), abortSignal: controller.signal }),
    ).rejects.toThrow(/timed out/);
  });
});

// ─── readNextSseLine ─────────────────────────────────────────────────────────

describe('readNextSseLine', () => {
  it('returns null when body is null', async () => {
    const handle = ({
      response: ({ body: null } as unknown) as Response,
      decoder: new TextDecoder(),
      buffer: '',
      _messageQueue: [],
    } as unknown) as Awaited<ReturnType<typeof postStream>>;
    const result = await readNextSseLine(handle);
    expect(result).toBeNull();
  });

  it('parses a simple SSE data line', async () => {
    const chunk = 'data: {"id":"test","choices":[]}';
    const bodyStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(chunk + '\n\n'));
        controller.close();
      },
    });

    // Create a mock Response with the stream as body
    const mockResponse = ({
      body: bodyStream,
    } as unknown) as Response;

    const handle = {
      response: mockResponse,
      decoder: new TextDecoder(),
      buffer: '',
      _messageQueue: [],
    };

    const result = await readNextSseLine(handle);
    expect(result).toBe('{"id":"test","choices":[]}');
  });

  it('skips [DONE] lines and returns null after stream exhaustion', async () => {
    // Send both data lines in a single stream so the reader is not re-locked
    const bodyStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"id":"s1"}\n\ndata: [DONE]\n\n'));
        controller.close();
      },
    });

    const mockResponse = ({
      body: bodyStream,
    } as unknown) as Response;

    const handle = {
      response: mockResponse,
      decoder: new TextDecoder(),
      buffer: '',
      _messageQueue: [],
    };

    let result = await readNextSseLine(handle);
    expect(result).toBe('{"id":"s1"}');

    result = await readNextSseLine(handle);
    expect(result).toBeNull();
  });

  it('handles partial lines by buffering', async () => {
    // First chunk sends "data: {" (incomplete)
    const bodyStream = new ReadableStream({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"partial'));
        await new Promise(r => setTimeout(r, 10));
        // Second chunk completes it: true}\n\n"
        controller.enqueue(new TextEncoder().encode('true}\n\n'));
        controller.close();
      },
    });

    const mockResponse = ({
      body: bodyStream,
    } as unknown) as Response;

    const handle = {
      response: mockResponse,
      decoder: new TextDecoder(),
      buffer: '',
      _messageQueue: [],
    };

    const result = await readNextSseLine(handle);
    expect(result).toBe('{"partialtrue}');
  });
});
