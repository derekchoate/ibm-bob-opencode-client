/**
 * Token Store - Persists OAuth tokens to disk or OS keychain
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { StoredTokens, TokenStoreBackend } from '../types';

// Default storage directory and file
const STORAGE_DIR = '.config/ibm-bob';
const TOKENS_FILE = 'tokens.json';

/**
 * Get the full path to the tokens file.
 */
function getTokensFilePath(): string {
  const home = require('os').homedir();
  return path.join(home, STORAGE_DIR, TOKENS_FILE);
}

/**
 * Simple encryption helper using AES-256-CBC.
 * Used to encrypt tokens before writing to disk.
 */
const ENCRYPTION_KEY_ENV = 'IBM_BOB_ENCRYPTION_KEY';

function getEncryptionKey(): string | null {
  return process.env[ENCRYPTION_KEY_ENV] || null;
}

/**
 * Encrypt a plaintext string. Returns hex-encoded ciphertext + IV.
 */
function encrypt(plaintext: string, key: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt a hex-encoded ciphertext + IV.
 */
function decrypt(ciphertextWithIv: string, key: string): string {
  const parts = ciphertextWithIv.split(':');
  const ivHex = parts[0];
  const encrypted = parts.slice(1).join(':');
  if (!ivHex || !encrypted) {
    throw new Error('Invalid encrypted data format');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Store that manages token persistence.
 */
export class TokenStore {
  private backend: TokenStoreBackend;
  private encryptionKey: string | null;

  constructor(backend: TokenStoreBackend = 'file') {
    this.backend = backend;
    this.encryptionKey = getEncryptionKey();
  }

  /**
   * Load stored tokens from the storage backend.
   */
  load(): StoredTokens | null {
    if (this.backend === 'keychain') {
      return this.loadFromKeychainSync();
    }
    return this.loadFromFile();
  }

  /**
   * Save tokens to the storage backend.
   */
  save(tokens: StoredTokens): void {
    if (this.backend === 'keychain') {
      this.saveToKeychain(tokens);
    } else {
      this.saveToFile(tokens);
    }
  }

  /**
   * Delete stored tokens from the storage backend.
   */
  delete(): void {
    if (this.backend === 'keychain') {
      this.deleteFromKeychainSync();
    } else {
      this.deleteFromFile();
    }
  }

  // -------------------------------------------------------------------------
  // File-based Storage
  // -------------------------------------------------------------------------

  private loadFromFile(): StoredTokens | null {
    try {
      const filePath = getTokensFilePath();

      if (!fs.existsSync(filePath)) {
        return null;
      }

      let raw = fs.readFileSync(filePath, 'utf8');

      // Decrypt if encryption key is set
      if (this.encryptionKey) {
        raw = decrypt(raw, this.encryptionKey);
      }

      return JSON.parse(raw) as StoredTokens;
    } catch {
      return null;
    }
  }

  private saveToFile(tokens: StoredTokens): void {
    try {
      const filePath = getTokensFilePath();
      const dir = path.dirname(filePath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }

      let data = JSON.stringify(tokens, null, 2);

      // Encrypt if encryption key is set
      if (this.encryptionKey) {
        data = encrypt(data, this.encryptionKey);
      }

      fs.writeFileSync(filePath, data, { mode: 0o600 });
    } catch (error) {
      console.warn('[IBM BOB Provider] Failed to save tokens to file:', error);
    }
  }

  private deleteFromFile(): void {
    try {
      const filePath = getTokensFilePath();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Silent fail on delete
    }
  }

  // -------------------------------------------------------------------------
  // Keychain Storage (via optional keytar package)
  // -------------------------------------------------------------------------

  private loadFromKeychainSync(): StoredTokens | null {
    try {
      const keytar = require('keytar');
      const password = keytar.getPassword('ibm-bob-provider', 'tokens');

      if (!password) {
        return null;
      }

      return JSON.parse(password.toString('utf8')) as StoredTokens;
    } catch (error) {
      // keytar not available or error reading keychain
      console.warn('[IBM BOB Provider] Failed to read from OS keychain, falling back to file storage:', error);
      return this.loadFromFile();
    }
  }

  private saveToKeychain(tokens: StoredTokens): void {
    try {
      const keytar = require('keytar');
      const data = JSON.stringify(tokens);
      keytar.setPassword('ibm-bob-provider', 'tokens', data);
    } catch (error) {
      // keytar not available or error writing to keychain — fall back to file
      console.warn('[IBM BOB Provider] Failed to save to OS keychain, falling back to file storage:', error);
      this.saveToFile(tokens);
    }
  }

  private deleteFromKeychainSync(): void {
    try {
      const keytar = require('keytar');
      keytar.deletePassword('ibm-bob-provider', 'tokens');
    } catch {
      // Silent fail on delete from keychain
    } finally {
      // Always also delete file copy as cleanup
      this.deleteFromFile();
    }
  }
}