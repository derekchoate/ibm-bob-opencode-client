/**
 * Local HTTP server that receives the OAuth2 authorization code callback.
 *
 * Listens on a random available port at /bob-shell-auth-callback,
 * extracts the auth code from the query string, and resolves with it.
 */

import type { IncomingMessage, ServerResponse } from 'http';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/**
 * Result of a successful authorization callback.
 */
export interface CallbackResult {
  /** The authorization code exchanged for tokens */
  code: string;

  /** State parameter if provided (for CSRF validation) */
  state?: string;
}

/**
 * Error returned if the callback fails.
 */
export interface CallbackError {
  error: string;

  errorDescription?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Starts a local HTTP server that listens for the OAuth2 callback.
 *
 * @param port - Port to listen on (0 = random available port)
 * @returns Object with server instance, actualPort, and promise that resolves when callback is received
 */
export function startCallbackServer(port: number): {
  /** The actual port being listened on (useful when port=0 for random) */
  actualPort: number;

  /** Promise that resolves when the authorization code is received */
  result: Promise<CallbackResult>;

  /** Stop the server */
  stop: () => void;

  /** Promise that resolves when the server is ready to accept connections */
  onReady: Promise<void>;
} {
  return new CallbackServerImpl(port);
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class CallbackServerImpl {

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private server: any; // http.Server
  public actualPort = 0;
  private resultResolver!: (value: CallbackResult) => void;
  private errorPromiseReject!: (reason: CallbackError) => void;
  private readyResolver!: () => void;
  private isStopped = false;

  readonly result: Promise<CallbackResult>;
  readonly onError: Promise<never>;
  readonly onReady: Promise<void>;

  constructor(port: number) {

    this.onReady = new Promise((resolve) => {
      this.readyResolver = resolve;
    });

    this.result = new Promise((resolve, reject) => {
      this.resultResolver = resolve;
      this.errorPromiseReject = reject;
    });

    this.onError = new Promise(() => { /* rejected via errorPromiseReject */ });

    const callbackPath = '/bob-shell-auth-callback';

    this.server = require('http').createServer(
      (req: IncomingMessage, res: ServerResponse) => {
        this.handleRequest(req, res, callbackPath);
      },
    );

    this.server.listen(port, '127.0.0.1', () => {
      const address = this.server!.address();
      if (address && typeof address === 'object') {
        this.actualPort = address.port;
      }
      this.readyResolver();
    });
  }

  // =========================================================================
  // Public Methods
  // =========================================================================

  /** Wait for the server to be ready (useful when port=0) */
  async waitForReady(): Promise<void> {
    return this.onReady;
  }

  /** Stop the server from accepting new connections. */
  stop(): void {
    if (this.server) {
      this.server.close();
    }
  }

  // =========================================================================
  // Request Handler
  // =========================================================================

  private handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    _callbackPath: string,
  ): void {

    if (this.isStopped) {
      this.sendNotFound(res);
      return;
    }

    const parsedUrl = new URL(req.url!, `http://127.0.0.1:${this.actualPort}`);

    // Note: callbackPath is preserved for future configurable path support
    if (!isAuthorizedRequest(parsedUrl, req.method)) {
      this.sendNotFound(res);
      return;
    }

    const code = parsedUrl.searchParams.get('code');
    const error = parsedUrl.searchParams.get('error');

    // Stop listening before responding to avoid race conditions
    this.isStopped = true;
    this.stop();

    if (error) {
      this.handleAuthError(res, parsedUrl);
      return;
    }

    if (!code) {
      this.handleMissingCode(res);
      return;
    }

    // Success response
    this.handleSuccess(res, code, parsedUrl.searchParams.get('state') || undefined);
  }

  // =========================================================================
  // Response Handlers
  // =========================================================================

  private sendNotFound(res: ServerResponse): void {
    res.writeHead(404);
    res.end('Not Found');
  }

  private handleAuthError(
    res: ServerResponse,
    parsedUrl: URL,
  ): void {

    const errorDescription = parsedUrl.searchParams.get('error_description') || undefined;

    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      `<html><body>` +
      `<h1>Authorization Failed</h1>` +
      `<p>${this.escapeHtml(errorDescription || String(parsedUrl.searchParams.get('error') ?? ''))}</p>` +
      `<p>You may close this window.</p>` +
      `</body></html>`,
    );
  }

  private handleMissingCode(res: ServerResponse): void {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      `<html><body>` +
      `<h1>Invalid Callback</h1>` +
      `<p>Missing authorization code.</p>` +
      `<p>You may close this window.</p>` +
      `</body></html>`,
    );
  }

  private handleSuccess(
    res: ServerResponse,
    code: string,
    state: string | undefined,
  ): void {

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      `<html><body>` +
      `<h1>Authorization Successful</h1>` +
      `<p>You have been authenticated. You may close this window.</p>` +
      `</body></html>`,
    );

    this.resultResolver({ code, state });
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#039;');
  }
}

// ===========================================================================
// Request Validation Helpers
// ===========================================================================

/** Check if the incoming request is an authorized GET to the callback path. */
function isAuthorizedRequest(
  url: URL,
  method: string | undefined,
): boolean {

  return url.pathname === '/bob-shell-auth-callback' && method === 'GET';
}