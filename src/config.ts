/**
 * IBM BOB Provider Configuration
 */

import { BobProviderConfig, BobModel } from './types';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG = {
  apiKey: '',
  apiBaseUrl: 'https://api.us-east.bob.ibm.com/inference/v1',
  model: 'premium',
  maxTokens: 16384,
  temperature: 0.7,
  topP: 1.0,
  frequencyPenalty: 0.0,
  presencePenalty: 0.0,
  timeout: 30000,
  auth: undefined,
} as const;

// ============================================================================
// Configuration Helpers
// ============================================================================

/**
 * Get API key from environment variable or config
 */
export function getApiKey(config?: Partial<BobProviderConfig>): string {
  return config?.apiKey || process.env.BOB_API_KEY || '';
}

/**
 * Get base URL from environment variable or config
 */
export function getApiBaseUrl(config?: Partial<BobProviderConfig>): string {
  return (
    config?.apiBaseUrl ||
    process.env.BOB_API_BASE_URL ||
    DEFAULT_CONFIG.apiBaseUrl
  );
}

/**
 * Get default model from environment variable or config
 */
export function getModel(config?: Partial<BobProviderConfig>): string {
  return config?.model || process.env.BOB_MODEL || DEFAULT_CONFIG.model;
}

/**
 * Get the full chat completions endpoint URL
 */
export function getChatCompletionsUrl(config?: Partial<BobProviderConfig>): string {
  const baseUrl = getApiBaseUrl(config).replace(/\/+$/, '');
  return `${baseUrl}/chat/completions`;
}

// ============================================================================
// OAuth Configuration Helpers
// ============================================================================

/**
 * Check if the configuration uses OAuth authentication.
 */
export function isOAuthConfig(config?: Partial<BobProviderConfig>): boolean {
  return !!config?.auth?.oauth;
}

/**
 * Get OAuth configuration from config or environment variables.
 */
export function getOAuthConfig(
  config?: Partial<BobProviderConfig>
): { issuerUrl?: string; clientId?: string; clientSecret?: string; callbackPath?: string; scope?: string[] } | undefined {
  const oauth = config?.auth?.oauth;
  
  if (!oauth) {
    return undefined;
  }

  // Fill in missing values from environment variables
  return {
    issuerUrl: oauth.issuerUrl || process.env.BOB_OAUTH_ISSUER_URL,
    clientId: oauth.clientId || process.env.BOB_OAUTH_CLIENT_ID,
    clientSecret: oauth.clientSecret || process.env.BOB_OAUTH_CLIENT_SECRET,
    callbackPath: oauth.callbackPath || process.env.BOB_OAUTH_CALLBACK_PATH || '/bob-shell-auth-callback',
    scope: oauth.scope || parseScopesFromEnv(),
  };
}

/**
 * Get token store backend from config or environment variable.
 */
export function getTokenStoreBackend(
  config?: Partial<BobProviderConfig>
): 'file' | 'keychain' {
  return config?.auth?.tokenStoreBackend || 
    (process.env.BOB_TOKEN_STORE_BACKEND as 'file' | 'keychain') || 
    'file';
}

/**
 * Parse scopes from environment variable (space-separated string) or use defaults.
 */
function parseScopesFromEnv(): string[] | undefined {
  const envScopes = process.env.BOB_OAUTH_SCOPES;
  if (!envScopes) {
    return undefined;
  }
  return envScopes.split(' ').filter((s) => s.length > 0);
}

// ============================================================================
// Configuration Validation
// ============================================================================

/**
 * Validate the provider configuration.
 * Either apiKey or OAuth config must be provided.
 */
export function validateConfig(
  config: Partial<BobProviderConfig>
): string[] {
  const errors: string[] = [];

  const oauthConfig = getOAuthConfig(config);
  const hasApiKey = !!getApiKey(config);
  const hasOAuth = !!(oauthConfig?.issuerUrl && oauthConfig?.clientId && oauthConfig?.callbackPath);

  // At least one auth method must be configured
  if (!hasApiKey && !hasOAuth) {
    errors.push(
      'No authentication method configured. Provide either an `apiKey` (or `BOB_API_KEY` env var), ' +
      'or configure OAuth via the `auth.oauth` config option or corresponding environment variables.'
    );
  }

  // Validate OAuth required fields if provided
  if (!hasApiKey && oauthConfig) {
    if (!oauthConfig.issuerUrl) {
      errors.push('OAuth `issuerUrl` is required when using OAuth authentication.');
    }
    if (!oauthConfig.clientId) {
      errors.push('OAuth `clientId` is required when using OAuth authentication.');
    }
    if (!oauthConfig.callbackPath) {
      errors.push('OAuth `callbackPath` is required when using OAuth authentication.');
    }
  }

  return errors;
}

/**
 * Create a resolved configuration from multiple sources.
 * Priority: passed config > environment variables > defaults
 */
export function resolveConfig(
  override?: Partial<BobProviderConfig>
) {
  const merged = { ...DEFAULT_CONFIG, ...override };

  return {
    apiKey: getApiKey(merged),
    apiBaseUrl: getApiBaseUrl(merged),
    model: getModel(merged),
    maxTokens: override?.maxTokens ?? DEFAULT_CONFIG.maxTokens,
    temperature: override?.temperature ?? DEFAULT_CONFIG.temperature,
    topP: override?.topP ?? DEFAULT_CONFIG.topP,
    frequencyPenalty:
      override?.frequencyPenalty ?? DEFAULT_CONFIG.frequencyPenalty,
    presencePenalty: override?.presencePenalty ?? DEFAULT_CONFIG.presencePenalty,
    timeout: override?.timeout ?? DEFAULT_CONFIG.timeout,
    auth: (merged as any).auth,
  };
}

// ============================================================================
// Available Models (static defaults - used as fallback)
// ============================================================================

/**
 * Default available IBM BOB models (fallback when API discovery fails)
 */
export const AVAILABLE_MODELS: BobModel[] = [
  {
    id: 'premium',
    name: 'IBM BOB Premium Model',
    description: 'IBM BOB Premium model with enhanced capabilities',
    maxTokens: 16384,
    contextWindow: 32768,
  },
];

/**
 * Cache for dynamically discovered models
 */
let cachedModels: BobModel[] | null = null;
let cacheTimestamp: number | null = null;
const MODEL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get a model by its ID
 */
export function getModelById(modelId: string) {
  return [...AVAILABLE_MODELS, ...(cachedModels ?? [])].find((m) => m.id === modelId);
}

// ============================================================================
// Dynamic Model Discovery
// ============================================================================

/**
 * Response from the OpenAI-compatible /models endpoint
 */
export interface ModelsEndpointResponse {
  data: Array<{
    id: string;
    object?: string;
    created?: number;
    owned_by?: string;
    permissions?: string[];
  }>;
}

/**
 * Fetch available models from the IBM BOB API's /models endpoint.
 * Uses a cache to avoid excessive API calls (5-minute TTL).
 * 
 * @param config - Partial configuration containing apiKey and apiBaseUrl
 * @returns Array of discovered BobModel objects, falls back to static list on failure
 */
export async function fetchAvailableModels(
  config?: Partial<BobProviderConfig>
): Promise<BobModel[]> {
  // Return cached models if still valid
  const now = Date.now();
  if (cachedModels && cacheTimestamp && (now - cacheTimestamp) < MODEL_CACHE_TTL) {
    return cachedModels;
  }

  try {
    const baseUrl = getApiBaseUrl(config).replace(/\/+$/, '');
    const modelsUrl = `${baseUrl}/models`;

    const response = await fetch(modelsUrl, {
      headers: {
        Authorization: `Bearer ${getApiKey(config)}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: HTTP ${response.status}`);
    }

    const data: ModelsEndpointResponse = await response.json();

    // Transform API response into BobModel format
    cachedModels = data.data.map((m) => ({
      id: m.id,
      name: m.id,
      description: `Model owned by ${m.owned_by || 'unknown'}`,
    }));

    cacheTimestamp = now;
    return cachedModels;
  } catch (error) {
    console.warn(
      '[IBM BOB Provider] Failed to discover models dynamically, using static fallback:',
      error
    );
    // Return static fallback on failure
    return AVAILABLE_MODELS;
  }
}

/**
 * Clear the model discovery cache. Call this when configuration changes.
 */
export function clearModelCache(): void {
  cachedModels = null;
  cacheTimestamp = null;
}