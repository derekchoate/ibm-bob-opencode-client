/**
 * IBM BOB Provider Configuration
 */

import { BobProviderConfig } from './types';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<BobProviderConfig> = {
  apiKey: '',
  apiBaseUrl: 'https://bob-api.ibm.com/v1',
  model: 'ibm-bob-default',
  maxTokens: 4096,
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

/**
 * Default available IBM BOB models
 */
export const AVAILABLE_MODELS = [
  {
    id: 'ibm-bob-default',
    name: 'IBM BOB Default',
    description: 'Default IBM BOB model for general purposes',
    maxTokens: 4096,
    contextWindow: 8192,
  },
  {
    id: 'ibm-bob-large',
    name: 'IBM BOB Large',
    description: 'Larger IBM BOB model with enhanced capabilities',
    maxTokens: 8192,
    contextWindow: 16384,
  },
];

/**
 * Get a model by its ID
 */
export function getModelById(modelId: string) {
  return AVAILABLE_MODELS.find((m) => m.id === modelId);
}