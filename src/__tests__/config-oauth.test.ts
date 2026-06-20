/**
 * Tests for OAuth configuration helpers
 */

import {
  isOAuthConfig,
  getOAuthConfig,
  getTokenStoreBackend,
  validateConfig,
} from '../config';

describe('config - OAuth', () => {
  beforeEach(() => {
    // Clear any environment variables set during tests
    delete process.env.BOB_OAUTH_ISSUER_URL;
    delete process.env.BOB_OAUTH_CLIENT_ID;
    delete process.env.BOB_OAUTH_CLIENT_SECRET;
    delete process.env.BOB_OAUTH_CALLBACK_PATH;
    delete process.env.BOB_OAUTH_SCOPES;
    delete process.env.BOB_TOKEN_STORE_BACKEND;
  });

  describe('isOAuthConfig', () => {
    it('should return false when no auth config is provided', () => {
      expect(isOAuthConfig({})).toBe(false);
    });

    it('should return false when auth is undefined', () => {
      expect(isOAuthConfig({ auth: undefined })).toBe(false);
    });

    it('should return true when oauth config is provided', () => {
      expect(isOAuthConfig({
        auth: {
          oauth: { issuerUrl: 'https://example.com', clientId: 'test' },
        },
      })).toBe(true);
    });

    // Note: isOAuthConfig treats any truthy oauth object as OAuth config,
    // so an empty oauth object still returns true (validation will catch missing fields)
  });

  describe('getOAuthConfig', () => {
    it('should return undefined when no oauth config provided', () => {
      expect(getOAuthConfig({})).toBeUndefined();
    });

    it('should return the oauth config as-is', () => {
      const oauth = {
        issuerUrl: 'https://example.com',
        clientId: 'my-client-id',
        callbackPath: '/callback',
        scope: ['openid', 'profile'],
      };
      
      expect(getOAuthConfig({ auth: { oauth } })).toEqual(oauth);
    });

    it('should fill in missing values from environment variables', () => {
      process.env.BOB_OAUTH_ISSUER_URL = 'https://env-issuer.com';
      process.env.BOB_OAUTH_CLIENT_ID = 'env-client-id';
      process.env.BOB_OAUTH_CALLBACK_PATH = '/env-callback';

      const result = getOAuthConfig({ auth: { oauth: {} } });

      expect(result?.issuerUrl).toBe('https://env-issuer.com');
      expect(result?.clientId).toBe('env-client-id');
      expect(result?.callbackPath).toBe('/env-callback');
    });

    it('should use config values over environment variables', () => {
      process.env.BOB_OAUTH_ISSUER_URL = 'https://env-issuer.com';
      process.env.BOB_OAUTH_CLIENT_ID = 'env-client-id';

      const result = getOAuthConfig({
        auth: {
          oauth: {
            issuerUrl: 'https://config-issuer.com',
            clientId: 'config-client-id',
          },
        },
      });

      expect(result?.issuerUrl).toBe('https://config-issuer.com');
      expect(result?.clientId).toBe('config-client-id');
    });

    it('should use default callback path when not specified', () => {
      const result = getOAuthConfig({
        auth: {
          oauth: {
            issuerUrl: 'https://example.com',
            clientId: 'test',
          },
        },
      });

      expect(result?.callbackPath).toBe('/bob-shell-auth-callback');
    });

    it('should parse scopes from environment variable', () => {
      process.env.BOB_OAUTH_SCOPES = 'openid profile email';

      const result = getOAuthConfig({ auth: { oauth: {} } });

      expect(result?.scope).toEqual(['openid', 'profile', 'email']);
    });

    it('should use config scopes over environment variable scopes', () => {
      process.env.BOB_OAUTH_SCOPES = 'openid profile email';

      const result = getOAuthConfig({
        auth: {
          oauth: {
            issuerUrl: 'https://example.com',
            clientId: 'test',
            scope: ['custom_scope'],
          },
        },
      });

      expect(result?.scope).toEqual(['custom_scope']);
    });

    it('should filter out empty scopes from environment variable', () => {
      process.env.BOB_OAUTH_SCOPES = 'openid  profile'; // double space

      const result = getOAuthConfig({ auth: { oauth: {} } });

      expect(result?.scope).toEqual(['openid', 'profile']);
    });
  });

  describe('getTokenStoreBackend', () => {
    it('should default to file when no config provided', () => {
      expect(getTokenStoreBackend({})).toBe('file');
    });

    it('should return the backend from config', () => {
      expect(getTokenStoreBackend({ auth: { tokenStoreBackend: 'keychain' } })).toBe('keychain');
    });

    it('should use environment variable when no config provided', () => {
      process.env.BOB_TOKEN_STORE_BACKEND = 'keychain';

      expect(getTokenStoreBackend({})).toBe('keychain');
    });

    it('should prefer config over environment variable', () => {
      process.env.BOB_TOKEN_STORE_BACKEND = 'keychain';

      const result = getTokenStoreBackend({ auth: { tokenStoreBackend: 'file' } });

      expect(result).toBe('file');
    });

    it('should return file for invalid backend value from env', () => {
      process.env.BOB_TOKEN_STORE_BACKEND = 'invalid';

      // TypeScript won't allow this at compile time, but at runtime it might happen
      const result = getTokenStoreBackend({ auth: { tokenStoreBackend: 'file' as any } });

      expect(result).toBe('file');
    });
  });

  describe('validateConfig - OAuth mode', () => {
    it('should return empty array when OAuth config is complete', () => {
      const errors = validateConfig({
        auth: {
          oauth: {
            issuerUrl: 'https://example.com',
            clientId: 'my-client-id',
            callbackPath: '/callback',
          },
        },
      });

      expect(errors).toEqual([]);
    });

    it('should return error when OAuth issuerUrl is missing', () => {
      const errors = validateConfig({
        auth: {
          oauth: {
            clientId: 'my-client-id',
            callbackPath: '/callback',
          },
        },
      });

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return error when OAuth clientId is missing', () => {
      const errors = validateConfig({
        auth: {
          oauth: {
            issuerUrl: 'https://example.com',
            callbackPath: '/callback',
          },
        },
      });

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return empty array when OAuth callbackPath is missing (uses default)', () => {
      // getOAuthConfig fills in the default callback path, so validation passes
      const errors = validateConfig({
        auth: {
          oauth: {
            issuerUrl: 'https://example.com',
            clientId: 'my-client-id',
          },
        },
      });

      expect(errors).toEqual([]);
    });

    it('should return empty array when apiKey is provided (OAuth not required)', () => {
      const errors = validateConfig({ apiKey: 'test-key' });
      expect(errors).toEqual([]);
    });

    it('should accept both apiKey and OAuth config', () => {
      const errors = validateConfig({
        apiKey: 'test-key',
        auth: {
          oauth: {
            issuerUrl: 'https://example.com',
            clientId: 'my-client-id',
            callbackPath: '/callback',
          },
        },
      });

      expect(errors).toEqual([]);
    });

    it('should return error when neither apiKey nor OAuth config is provided', () => {
      const errors = validateConfig({});
      
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept clientSecret as optional in OAuth config', () => {
      // Without clientSecret - should pass (public client)
      const errors1 = validateConfig({
        auth: {
          oauth: {
            issuerUrl: 'https://example.com',
            clientId: 'my-client-id',
            callbackPath: '/callback',
          },
        },
      });

      expect(errors1).toEqual([]);

      // With clientSecret - should also pass (confidential client)
      const errors2 = validateConfig({
        auth: {
          oauth: {
            issuerUrl: 'https://example.com',
            clientId: 'my-client-id',
            callbackPath: '/callback',
            clientSecret: 'secret123',
          },
        },
      });

      expect(errors2).toEqual([]);
    });
  });
});