/**
 * Tests for PKCE (Proof Key for Code Exchange) module
 * NOTE: These tests must run before any other test files that mock fs/crypto modules.
 */

// Ensure crypto module is never mocked by restoring it to actual

import crypto from 'crypto';
import { generatePKCE } from '../../auth/PKCEManager';
import type { PKCEResource } from '../../types';

describe('PKCEManager', () => {
  describe('generatePKCE', () => {
    it('should return a PKCEResource with verifier and challenge', async () => {
      const pkce = await generatePKCE();

      expect(pkce).toHaveProperty('verifier');
      expect(pkce).toHaveProperty('challenge');
      expect(typeof pkce.verifier).toBe('string');
      expect(typeof pkce.challenge).toBe('string');
    });

    it('should produce a verifier that is between 43 and 128 characters', async () => {
      for (let i = 0; i < 10; i++) {
        const pkce = await generatePKCE();
        expect(pkce.verifier.length).toBeGreaterThanOrEqual(43);
        expect(pkce.verifier.length).toBeLessThanOrEqual(128);
      }
    });

    it('should produce a verifier that uses only base64url characters', async () => {
      for (let i = 0; i < 10; i++) {
        const pkce = await generatePKCE();
        expect(pkce.verifier).toMatch(/^[a-zA-Z0-9\-_]+$/);
      }
    });

    it('should produce a challenge that uses only base64url characters', async () => {
      for (let i = 0; i < 10; i++) {
        const pkce = await generatePKCE();
        expect(pkce.challenge).toMatch(/^[a-zA-Z0-9\-_]+$/);
      }
    });

    it('should produce unique verifiers each time', async () => {
      const results = await Promise.all([generatePKCE(), generatePKCE(), generatePKCE(), generatePKCE()]);
      const verifiers = results.map(r => r.verifier);
      const uniqueVerifiers = new Set(verifiers);
      expect(uniqueVerifiers.size).toBe(4);
    });

    it('should produce unique challenges each time', async () => {
      const results = await Promise.all([generatePKCE(), generatePKCE(), generatePKCE(), generatePKCE()]);
      const challenges = results.map(r => r.challenge);
      const uniqueChallenges = new Set(challenges);
      expect(uniqueChallenges.size).toBe(4);
    });

    it('should produce a challenge that is the base64url encoding of SHA-256(verifier)', async () => {
      // Now generate PKCE and verify the relationship holds:
      // Since generatePKCE uses random bytes, we verify the relationship by checking that
      // for any generated pair, challenge = base64url(sha256(verifier))
      const pkce = await generatePKCE();

      const actualHash = crypto.createHash('sha256').update(pkce.verifier).digest('base64');
      const expectedFromActual = actualHash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      expect(pkce.challenge).toBe(expectedFromActual);
    });

    it('should return a properly typed PKCEResource', async () => {
      const pkce: PKCEResource = await generatePKCE();
      
      // TypeScript compile-time check - verifier and challenge must be strings
      const _v: string = pkce.verifier;
      const _c: string = pkce.challenge;
      expect(_v.length).toBeGreaterThan(0);
      expect(_c.length).toBeGreaterThan(0);
    });
  });
});