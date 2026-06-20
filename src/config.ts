/**
 * IBM BOB Provider Configuration
 */

import { BobProviderConfig, BobModel } from './types';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<BobProviderConfig> = {
  apiKey: '',
  apiBaseUrl: 'https://bob-api.ibm.com/inference/v1',
  model: 'premium',
  maxTokens: 16384,
  temperature: 0.7,
  topP: 1.0,
  frequencyPenalty: 0.0,
  presencePenalty: 0.0,
  timeout: 30000,
};

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
// Configuration Validation
// ============================================================================

/**
 * Validate the provider configuration
 */
export function validateConfig(
  config: Partial<BobProviderConfig>
): string[] {
  const errors: string[] = [];

  // API Key is required
  const apiKey = getApiKey(config);
  if (!apiKey) {
    errors.push(
      'IBM BOB API key is missing. Set it via the `apiKey` config option or `BOB_API_KEY` environment variable.'
    );
  }

  return errors;
}

/**
 * Create a resolved configuration from multiple sources
 * Priority: passed config > environment variables > defaults
 */
export function resolveConfig(
  override?: Partial<BobProviderConfig>
): Required<BobProviderConfig> {
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
  };
}

// ============================================================================
// Available Models
// ============================================================================

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
  return [...AVAILABLE_MODELS, ...cachedModels ?? []].find((m) => m.id === modelId);
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
