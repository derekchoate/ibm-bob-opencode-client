/**
 * Tests for configuration module
 */

import {
  resolveConfig,
  validateConfig,
  getApiKey,
  getApiBaseUrl,
  getModel,
  getChatCompletionsUrl,
  AVAILABLE_MODELS,
  getModelById,
} from '../config';

describe('config', () => {
  describe('getApiKey', () => {
    it('should return empty string when no apiKey is provided', () => {
      expect(getApiKey()).toBe('');
    });

    it('should return the provided apiKey', () => {
      expect(getApiKey({ apiKey: 'test-key' })).toBe('test-key');
    });
  });

  describe('getApiBaseUrl', () => {
    it('should return default base URL when no config provided', () => {
      expect(getApiBaseUrl()).toBe('https://api.us-east.bob.ibm.com/inference/v1');
    });

    it('should return the provided apiBaseUrl', () => {
      expect(getApiBaseUrl({ apiBaseUrl: 'https://custom.url/v1' })).toBe('https://custom.url/v1');
    });
  });

  describe('getModel', () => {
    it('should return default model when no config provided', () => {
      expect(getModel()).toBe('premium');
    });

    it('should return the provided model', () => {
      expect(getModel({ model: 'ibm-bob-large' })).toBe('ibm-bob-large');
    });
  });

  describe('getChatCompletionsUrl', () => {
    it('should return default chat completions URL', () => {
      expect(getChatCompletionsUrl()).toBe('https://api.us-east.bob.ibm.com/inference/v1/chat/completions');
    });

    it('should handle base URLs with trailing slashes', () => {
      expect(getChatCompletionsUrl({ apiBaseUrl: 'https://api.us-east.bob.ibm.com/inference/v1/' }))
        .toBe('https://api.us-east.bob.ibm.com/inference/v1/chat/completions');
    });
  });

  describe('validateConfig', () => {
    it('should return empty array when apiKey is provided', () => {
      const errors = validateConfig({ apiKey: 'test-key' });
      expect(errors).toEqual([]);
    });

    it('should return error when apiKey is missing', () => {
      const errors = validateConfig({});
      expect(errors.length).toBeGreaterThan(0);
      // Error message should mention apikey or OAuth as options
      expect(errors[0].toLowerCase()).toContain('apikey');
    });
  });

  describe('resolveConfig', () => {
    it('should return config with defaults', () => {
      const config = resolveConfig({ apiKey: 'test-key' });
      expect(config.apiKey).toBe('test-key');
      expect(config.model).toBe('premium');
      expect(config.temperature).toBe(0.7);
      expect(config.maxTokens).toBe(16384);
    });

    it('should override defaults with provided values', () => {
      const config = resolveConfig({
        apiKey: 'my-key',
        model: 'ibm-bob-large',
        temperature: 0.9,
        maxTokens: 2048,
      });
      expect(config.apiKey).toBe('my-key');
      expect(config.model).toBe('ibm-bob-large');
      expect(config.temperature).toBe(0.9);
      expect(config.maxTokens).toBe(2048);
    });
  });

  describe('AVAILABLE_MODELS', () => {
    it('should have at least one model', () => {
      expect(AVAILABLE_MODELS.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getModelById', () => {
    it('should find a model by id', () => {
      const model = getModelById('premium');
      expect(model).toBeDefined();
      expect(model?.id).toBe('premium');
    });

    it('should return undefined for unknown model id', () => {
      const model = getModelById('unknown-model');
      expect(model).toBeUndefined();
    });
  });
});