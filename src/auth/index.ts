/**
 * IBM BOB Provider - OAuth2 Authentication Module
 * 
 * Provides seamless OAuth2 Authorization Code + PKCE authentication
 * with automatic token refresh and persistent storage.
 */

export { AuthProvider, createAuthProvider } from './AuthProvider';
export { TokenStore } from './TokenStore';
export { startCallbackServer } from './CallbackServer';
export { generatePKCE } from './PKCEManager';

export type { AuthProviderOptions, AuthState } from './AuthProvider';
export type { CallbackResult, CallbackError } from './CallbackServer';