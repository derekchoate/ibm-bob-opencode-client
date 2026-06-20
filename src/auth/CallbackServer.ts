/**
 * Local HTTP server that receives the OAuth2 authorization code callback.
 * 
 * Listens on a random available port at /bob-shell-auth-callback,
 * extracts the auth code from the query string, and resolves with it.
 */

import type { IncomingMessage, ServerResponse } from 'http';

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
  private server: any; // http.Server
  public actualPort = 0;
  private resultResolver!: (value: CallbackResult) => void;
  private errorPromiseReject!: (reason: CallbackError) => void;
  private readyResolver!: () => void;
  private isStopped = false;
  private hasResolved = false;

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

    this.server = require('http').createServer((req: IncomingMessage, res: ServerResponse) => {
      this.handleRequest(req, res, callbackPath);
    });

    this.server.listen(port, '127.0.0.1', () => {
      const address = this.server!.address();
      if (address && typeof address === 'object') {
        this.actualPort = address.port;
      }
      this.readyResolver();
    });
  }

  /** Wait for the server to be ready (useful when port=0) */
  async waitForReady(): Promise<void> {
    return this.onReady;
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse, callbackPath: string): void {
    if (this.isStopped) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const url = new URL(req.url!, `http://127.0.0.1:${this.actualPort}`);

    if (url.pathname !== callbackPath || req.method !== 'GET') {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state') || undefined;
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description') || undefined;

    // Stop listening before responding to avoid race conditions
    this.isStopped = true;
    this.stop();

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body><h1>Authorization Failed</h1><p>${this.escapeHtml(errorDescription || error)}</p><p>You may close this window.</p></body></html>`);
      return;
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body><h1>Invalid Callback</h1><p>Missing authorization code.</p><p>You may close this window.</p></body></html>`);
      return;
    }

    // Success response
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<html><body><h1>Authorization Successful</h1><p>You have been authenticated. You may close this window.</p></body></html>`);
    this.resultResolver({ code: code!, state });
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#039;');
  }

  stop(): void {
    if (this.server) {
      this.server.close();
    }
  }
}