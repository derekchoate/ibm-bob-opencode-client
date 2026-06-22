/**
 * IBM BOB Provider — Factory Function (ProviderV3 Pattern)
 *
 * Implements the @ai-sdk/provider ProviderV3 interface pattern.
 * Returns a callable factory function with a `.languageModel` method.
 *
 * BobLanguageModel class is in model.ts.
 * BobAiProviderSettings interface is in types.ts.
 */

import type { ProviderV3 } from '@ai-sdk/provider';

import type { BobLanguageModel } from './model';

import type { BobAiProviderSettings } from './types';

import { ibmBob } from './model';

// ============================================================================
// Provider Interface (callable function + .languageModel property)
// ============================================================================

/**
 * IBM BOB provider interface extending ProviderV3.
 * Callable directly: const model = bob('model-id', settings)
 * Or via method:     const model = bob.languageModel('model-id', settings)
 */
export interface BobProvider extends ProviderV3 {
  (modelId: string, settings?: BobAiProviderSettings): BobLanguageModel;
  languageModel(
    modelId: string,
    settings?: BobAiProviderSettings,
  ): BobLanguageModel;
}

// ============================================================================
// Provider Settings — internal resolved config
// ============================================================================

/**
 * Internal provider options passed to createBob().
 * The factory resolves defaults and normalizes values.
 */
interface BobProviderOptions {
  /** Base URL for the IBM BOB API (normalized, no trailing slash) */
  baseUrl?: string;

  /** Static API key for legacy authentication mode */
  apiKey?: string;

  /** Extra headers to include on every request (lazy or static) */
  headers?: Record<string, string> | (() => Record<string, string>);
}

// ============================================================================
// Factory Function — createBobAiProvider()
// ============================================================================

/**
 * Create an IBM BOB provider instance.
 *
 * The returned provider is a callable function that creates language model instances,
 * plus has a `.languageModel` method for the same purpose.
 *
 * @example
 * ```ts
 * const bob = createBobAiProvider({ apiKey: 'sk-...', baseUrl: 'https://...' });
 *
 * // Call directly
 * const model1 = bob('ibm/granite-4-hybrid');
 *
 * // Or via .languageModel method
 * const model2 = bob.languageModel('ibm/granite-4-hybrid');
 * ```
 */
export function createBobAiProvider(
  options?: BobProviderOptions,
): BobProvider {

  /** Default base URL for IBM BOB API */
  const defaultBaseUrl = 'https://api.us-east.bob.ibm.com/inference/v1';

  // Create the model factory — per-call baseUrl overrides provider default
  const createChatModel = (
    modelId: string,
    settings: BobAiProviderSettings = {},
  ): BobLanguageModel => {

    return ibmBob(modelId, {
      ...settings,
      baseUrl: settings.baseUrl ?? options?.baseUrl ?? defaultBaseUrl,
    });
  };

  // The provider function — callable directly
  const provider = function (
    modelId: string,
    settings?: BobAiProviderSettings,
  ): BobLanguageModel {

    if (new.target) {
      throw new Error(
        'The IBM BOB provider factory function cannot be called with the "new" keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  // Attach .languageModel method for consistency with ProviderV3 pattern
  provider.languageModel = createChatModel;

  return provider as BobProvider;
}

// ============================================================================
// Default Provider Instance (no specific model)
// ============================================================================

/**
 * Default IBM BOB provider instance.
 * Use this to create language models without passing settings every time.
 */
export const bob = createBobAiProvider();