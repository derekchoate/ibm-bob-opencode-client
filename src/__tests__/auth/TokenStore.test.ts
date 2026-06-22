/**
 * Tests for TokenStore module
 */

import type { StoredTokens } from '../../types';

// Mock fs before importing TokenStore
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockUnlinkSync = jest.fn();

 
jest.mock('fs', () => ({
   
  existsSync: (...args: any[]) => mockExistsSync(...args),
   
  readFileSync: (...args: any[]) => mockReadFileSync(...args),
   
  writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
   
  mkdirSync: (...args: any[]) => mockMkdirSync(...args),
   
  unlinkSync: (...args: any[]) => mockUnlinkSync(...args),
}));

jest.mock('os', () => ({
  homedir: () => '/tmp/test-home',
}));

// Mock keytar so it's never actually loaded
jest.mock('keytar', () => ({
  getPassword: jest.fn().mockReturnValue(null),
  setPassword: jest.fn(),
  deletePassword: jest.fn(),
}), { virtual: true });

describe('TokenStore', () => {
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    mockExistsSync.mockReturnValue(false);
    delete process.env.IBM_BOB_ENCRYPTION_KEY;
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    delete process.env.IBM_BOB_ENCRYPTION_KEY;
  });

  // Import TokenStore after mocking
  const { TokenStore } = require('../../auth/TokenStore');

  describe('constructor', () => {
    it('should create a default store', () => {
      const store = new TokenStore();
      expect(store).toBeDefined();
    });
  });

  describe('load (file backend)', () => {
    it('should return null when no tokens file exists', () => {
      mockExistsSync.mockReturnValue(false);
      const store = new TokenStore();
      const result = store.load();
      expect(result).toBeNull();
    });

    it('should load and parse valid tokens from file', () => {
      const tokens: StoredTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 60000,
        createdAt: Date.now(),
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(tokens));

      const store = new TokenStore();
      const result = store.load();

      expect(result).toEqual(tokens);
    });

    it('should return null when file exists but is unreadable', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => { throw new Error('read error'); });

      const store = new TokenStore();
      const result = store.load();

      expect(result).toBeNull();
    });

    it('should return null when file contains invalid JSON', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('not valid json');

      const store = new TokenStore();
      const result = store.load();

      expect(result).toBeNull();
    });
  });

  describe('save (file backend)', () => {
    it('should write tokens to file as JSON', () => {
      mockExistsSync.mockReturnValue(false);

      const store = new TokenStore();
      store.save({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 60000,
        createdAt: Date.now(),
      });

      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('should create the directory if it does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const store = new TokenStore();
      store.save({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 60000,
        createdAt: Date.now(),
      });

      expect(mockMkdirSync).toHaveBeenCalled();
    });
  });

  describe('delete (file backend)', () => {
    it('should delete the tokens file if it exists', () => {
      mockExistsSync.mockReturnValue(true);

      const store = new TokenStore();
      store.delete();

      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it('should silently fail if file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const store = new TokenStore();
      store.delete();

      // Should not throw - unlinkSync should NOT be called since existsSync returns false
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });
  });
});