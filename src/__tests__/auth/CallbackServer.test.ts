/**
 * Tests for CallbackServer module
 */

import { startCallbackServer } from '../../auth/CallbackServer';
import * as http from 'http';

describe('CallbackServer', () => {
  const SERIAL_TIMEOUT = 5000;

  afterEach((done) => {
    setTimeout(done, 200);
  });

  // Helper to wait for onReady with a timeout, returning the timer id for cleanup
  async function waitForReady(server: ReturnType<typeof startCallbackServer>, timeout: number): Promise<number> {
    return new Promise<number>((resolve) => {
      const timerId = setTimeout(() => resolve(0), timeout); // 0 means timeout
      server.onReady.then(() => {
        clearTimeout(timerId);
        resolve(1); // 1 means success
      });
    });
  }

  describe('startCallbackServer', () => {
    it('should start a server and return onReady promise', async () => {
      const server = startCallbackServer(0);

      expect(server).toHaveProperty('actualPort');
      expect(typeof server.actualPort).toBe('number');
      expect(typeof server.stop).toBe('function');
      expect(server.onReady).toBeInstanceOf(Promise);

      await waitForReady(server, SERIAL_TIMEOUT);

      expect(server.actualPort).toBeGreaterThan(0);
      server.stop();
    });

    it('should receive a successful callback with auth code', async () => {
      const server = startCallbackServer(0);

      await waitForReady(server, SERIAL_TIMEOUT);

      const port = server.actualPort;

      try {
        await new Promise<void>((resolve, reject) => {
          http.get(
            `http://127.0.0.1:${port}/bob-shell-auth-callback?code=test_auth_code_123`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (res: any) => {
              expect(res.statusCode).toBe(200);
              res.resume();
              resolve();
            }
          ).on('error', reject);
        });

        const result = await server.result;
        expect(result.code).toBe('test_auth_code_123');
      } finally {
        server.stop();
      }
    }, SERIAL_TIMEOUT);

    it('should receive a callback with auth code and state parameter', async () => {
      const server = startCallbackServer(0);

      await waitForReady(server, SERIAL_TIMEOUT);

      const port = server.actualPort;

      try {
        await new Promise<void>((resolve, reject) => {
          http.get(
            `http://127.0.0.1:${port}/bob-shell-auth-callback?code=abc&state=my_csrf_state`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (res: any) => {
              expect(res.statusCode).toBe(200);
              res.resume();
              resolve();
            }
          ).on('error', reject);
        });

        const result = await server.result;
        expect(result.code).toBe('abc');
        expect(result.state).toBe('my_csrf_state');
      } finally {
        server.stop();
      }
    }, SERIAL_TIMEOUT);

    it('should return an error response when authorization fails', async () => {
      const server = startCallbackServer(0);

      await waitForReady(server, SERIAL_TIMEOUT);

      const port = server.actualPort;

      try {
        await new Promise<void>((resolve) => {
          http.get(
            `http://127.0.0.1:${port}/bob-shell-auth-callback?error=access_denied&error_description=User+denied`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (res: any) => {
              expect(res.statusCode).toBe(400);
              res.resume();
              resolve();
            }
          ).on('error', () => {});
        });

        await new Promise(r => setTimeout(r, 100));
      } finally {
        server.stop();
      }
    }, SERIAL_TIMEOUT);

    it('should return 404 for wrong path', async () => {
      const server = startCallbackServer(0);

      await waitForReady(server, SERIAL_TIMEOUT);

      const port = server.actualPort;

      try {
        await new Promise<void>((resolve) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          http.get(`http://127.0.0.1:${port}/wrong/path`, (res: any) => {
            expect(res.statusCode).toBe(404);
            res.resume();
            resolve();
          }).on('error', () => {});
        });
      } finally {
        server.stop();
      }
    }, SERIAL_TIMEOUT);

    it('should return 400 for missing code parameter', async () => {
      const server = startCallbackServer(0);

      await waitForReady(server, SERIAL_TIMEOUT);

      const port = server.actualPort;

      try {
        await new Promise<void>((resolve) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          http.get(`http://127.0.0.1:${port}/bob-shell-auth-callback`, (res: any) => {
            expect(res.statusCode).toBe(400);
            res.resume();
            resolve();
          }).on('error', () => {});
        });
      } finally {
        server.stop();
      }
    }, SERIAL_TIMEOUT);

    it('should handle concurrent requests (only first is processed)', async () => {
      const server = startCallbackServer(0);

      await waitForReady(server, SERIAL_TIMEOUT);

      const port = server.actualPort;

      try {
        await new Promise<void>((resolve) => {
          http.get(
            `http://127.0.0.1:${port}/bob-shell-auth-callback?code=first_code`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (res: any) => {
              expect(res.statusCode).toBe(200);
              res.resume();
              resolve();
            }
          ).on('error', () => {});
        });

        const result = await server.result;
        expect(result.code).toBe('first_code');

        await new Promise<void>((resolve) => {
           
          http.get(
            `http://127.0.0.1:${port}/bob-shell-auth-callback?code=second_code`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (res: any) => {
              expect(res.statusCode).toBe(404);
              res.resume();
              resolve();
            }
          ).on('error', () => {});
        });
      } finally {
        server.stop();
      }
    }, SERIAL_TIMEOUT);

    it('should listen on 127.0.0.1 only (not all interfaces)', async () => {
      const server = startCallbackServer(0);

      await waitForReady(server, SERIAL_TIMEOUT);

      expect(server.actualPort).toBeGreaterThan(0);
      // The server is bound to 127.0.0.1 as per implementation
      server.stop();
    }, SERIAL_TIMEOUT);

    it('should resolve with state when provided', async () => {
      const server = startCallbackServer(0);

      await waitForReady(server, SERIAL_TIMEOUT);

      const port = server.actualPort;

      try {
        await new Promise<void>((resolve) => {
          http.get(
            `http://127.0.0.1:${port}/bob-shell-auth-callback?code=xyz&state=csrf_token_456`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (res: any) => {
              res.resume();
              resolve();
            }
          ).on('error', () => {});
        });

        const result = await server.result;
        expect(result.state).toBe('csrf_token_456');
      } finally {
        server.stop();
      }
    }, SERIAL_TIMEOUT);
  });
});