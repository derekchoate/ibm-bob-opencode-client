/**
 * PKCE (Proof Key for Code Exchange) Utility
 * 
 * Generates code verifier and challenge pairs per RFC 7636.
 */

import crypto from 'crypto';
import { PKCEResource } from '../types';

/**
 * Generate a cryptographically random string of the given byte length.
 */
function generateRandomString(byteLength: number): string {
  const randomBytes = new Uint8Array(byteLength);
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalObj = globalThis as any;
  if (typeof globalThis !== 'undefined' && globalObj?.crypto) {
    globalObj.crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < byteLength; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return base64UrlEncode(randomBytes);
}

/**
 * Encode a Uint8Array as base64url (no padding).
 */
function base64UrlEncode(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Compute the SHA-256 hash of a string and return it as a base64url-encoded string.
 */
async function sha256Challenge(verifier: string): Promise<string> {
  const hash = crypto.createHash('sha256').update(verifier).digest('base64');
  return base64UrlEncode(Buffer.from(hash, 'base64'));
}

/**
 * Generate a PKCE code verifier and challenge pair.
 * 
 * @returns PKCEResource containing the verifier and its base64url-encoded SHA-256 challenge
 */
export async function generatePKCE(): Promise<PKCEResource> {
  const verifier = generateRandomString(32); // 32 bytes = 43 chars in base64url
  const challenge = await sha256Challenge(verifier);

  return { verifier, challenge };
}