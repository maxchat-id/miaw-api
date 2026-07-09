/**
 * Unit tests for Configuration module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original env vars
const originalEnv = { ...process.env };

// Helper to reset modules and env
function resetModules() {
  vi.resetModules();
}

describe('Config', () => {
  beforeEach(() => {
    // Reset env vars to original state
    process.env = { ...originalEnv };
    // Clear all env vars we might set
    delete process.env.PORT;
    delete process.env.HOST;
    delete process.env.API_KEY;
    delete process.env.WEBHOOK_SECRET;
    delete process.env.CORS_ORIGIN;
    delete process.env.SESSION_PATH;
    delete process.env.WEBHOOK_TIMEOUT_MS;
    delete process.env.WEBHOOK_MAX_RETRIES;
    delete process.env.WEBHOOK_RETRY_DELAY_MS;
    delete process.env.LOG_LEVEL;
    delete process.env.NODE_ENV;
    resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    resetModules();
  });

  describe('Default values', () => {
    it('should use default port 3000', async () => {
      const { config } = await import('../../../src/config');
      expect(config.port).toBe(3000);
    });

    it('should use default host 0.0.0.0', async () => {
      const { config } = await import('../../../src/config');
      expect(config.host).toBe('0.0.0.0');
    });

    it('should use default API key', async () => {
      const { config } = await import('../../../src/config');
      expect(config.apiKey).toBe('miaw-api-key');
    });

    it('should use default webhook secret', async () => {
      const { config } = await import('../../../src/config');
      expect(config.webhookSecret).toBe('webhook-secret');
    });

    it('should use default CORS origin "*"', async () => {
      const { config } = await import('../../../src/config');
      expect(config.corsOrigin).toBe('*');
    });

    it('should use default session path "./sessions"', async () => {
      const { config } = await import('../../../src/config');
      expect(config.sessionPath).toBe('./sessions');
    });

    it('should use default webhook timeout 10000ms', async () => {
      const { config } = await import('../../../src/config');
      expect(config.webhookTimeout).toBe(10000);
    });

    it('should use default webhook max retries 6', async () => {
      const { config } = await import('../../../src/config');
      expect(config.webhookMaxRetries).toBe(6);
    });

    it('should use default webhook retry delay 60000ms', async () => {
      const { config } = await import('../../../src/config');
      expect(config.webhookRetryDelay).toBe(60000);
    });

    it('should use default log level "info"', async () => {
      const { config } = await import('../../../src/config');
      expect(config.logLevel).toBe('info');
    });
  });

  describe('Environment variable overrides', () => {
    it('should override port from PORT', async () => {
      process.env.PORT = '8080';
      const { config } = await import('../../../src/config');
      expect(config.port).toBe(8080);
    });

    it('should override host from HOST', async () => {
      process.env.HOST = 'localhost';
      const { config } = await import('../../../src/config');
      expect(config.host).toBe('localhost');
    });

    it('should override API key from API_KEY', async () => {
      process.env.API_KEY = 'custom-api-key';
      const { config } = await import('../../../src/config');
      expect(config.apiKey).toBe('custom-api-key');
    });

    it('should override webhook secret from WEBHOOK_SECRET', async () => {
      process.env.WEBHOOK_SECRET = 'custom-secret';
      const { config } = await import('../../../src/config');
      expect(config.webhookSecret).toBe('custom-secret');
    });

    it('should override CORS origin from CORS_ORIGIN', async () => {
      process.env.CORS_ORIGIN = 'https://example.com';
      const { config } = await import('../../../src/config');
      expect(config.corsOrigin).toBe('https://example.com');
    });

    it('should override session path from SESSION_PATH', async () => {
      process.env.SESSION_PATH = '/data/sessions';
      const { config } = await import('../../../src/config');
      expect(config.sessionPath).toBe('/data/sessions');
    });

    it('should override webhook timeout from WEBHOOK_TIMEOUT_MS', async () => {
      process.env.WEBHOOK_TIMEOUT_MS = '5000';
      const { config } = await import('../../../src/config');
      expect(config.webhookTimeout).toBe(5000);
    });

    it('should override max retries from WEBHOOK_MAX_RETRIES', async () => {
      process.env.WEBHOOK_MAX_RETRIES = '3';
      const { config } = await import('../../../src/config');
      expect(config.webhookMaxRetries).toBe(3);
    });

    it('should override retry delay from WEBHOOK_RETRY_DELAY_MS', async () => {
      process.env.WEBHOOK_RETRY_DELAY_MS = '30000';
      const { config } = await import('../../../src/config');
      expect(config.webhookRetryDelay).toBe(30000);
    });

    it('should override log level from LOG_LEVEL', async () => {
      process.env.LOG_LEVEL = 'debug';
      const { config } = await import('../../../src/config');
      expect(config.logLevel).toBe('debug');
    });
  });

  describe('Type coercion', () => {
    it('should convert port string to number', async () => {
      process.env.PORT = '3001';
      const { config } = await import('../../../src/config');
      expect(typeof config.port).toBe('number');
      expect(config.port).toBe(3001);
    });

    it('should convert webhook timeout string to number', async () => {
      process.env.WEBHOOK_TIMEOUT_MS = '15000';
      const { config } = await import('../../../src/config');
      expect(typeof config.webhookTimeout).toBe('number');
      expect(config.webhookTimeout).toBe(15000);
    });

    it('should convert max retries string to number', async () => {
      process.env.WEBHOOK_MAX_RETRIES = '10';
      const { config } = await import('../../../src/config');
      expect(typeof config.webhookMaxRetries).toBe('number');
      expect(config.webhookMaxRetries).toBe(10);
    });

    it('should convert retry delay string to number', async () => {
      process.env.WEBHOOK_RETRY_DELAY_MS = '120000';
      const { config } = await import('../../../src/config');
      expect(typeof config.webhookRetryDelay).toBe('number');
      expect(config.webhookRetryDelay).toBe(120000);
    });
  });

  describe('Validation warnings', () => {
    it('should warn about default API key', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await import('../../../src/config');

      expect(warnSpy).toHaveBeenCalled();
      const warningCalls = warnSpy.mock.calls.flat().join(' ');
      expect(warningCalls).toContain('API key');
      expect(warningCalls).toContain('API_KEY');
    });

    it('should warn about default webhook secret', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await import('../../../src/config');

      expect(warnSpy).toHaveBeenCalled();
      const warningCalls = warnSpy.mock.calls.flat().join(' ');
      expect(warningCalls).toContain('webhook secret');
      expect(warningCalls).toContain('WEBHOOK_SECRET');
    });

    it('should NOT warn when custom API key is set', async () => {
      process.env.API_KEY = 'custom-production-key';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await import('../../../src/config');

      const warningCalls = warnSpy.mock.calls.flat().join(' ');
      expect(warningCalls).not.toContain('API key');
    });

    it('should NOT warn when custom webhook secret is set', async () => {
      process.env.WEBHOOK_SECRET = 'custom-production-secret';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await import('../../../src/config');

      const warningCalls = warnSpy.mock.calls.flat().join(' ');
      expect(warningCalls).not.toContain('webhook secret');
    });

    it('should warn about wildcard CORS in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.API_KEY = 'prod-key';
      process.env.WEBHOOK_SECRET = 'prod-secret';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await import('../../../src/config');

      const warningCalls = warnSpy.mock.calls.flat().join(' ');
      expect(warningCalls).toContain('CORS');
      expect(warningCalls).toContain('*');
    });

    it('should NOT warn about CORS when restricted origin is set', async () => {
      process.env.NODE_ENV = 'production';
      process.env.API_KEY = 'prod-key';
      process.env.WEBHOOK_SECRET = 'prod-secret';
      process.env.CORS_ORIGIN = 'https://app.example.com';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await import('../../../src/config');

      const warningCalls = warnSpy.mock.calls.flat().join(' ');
      expect(warningCalls).not.toContain('CORS');
    });

    it('should warn about invalid port and default to 3000', async () => {
      process.env.PORT = '99999'; // Invalid port > 65535
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { config } = await import('../../../src/config');

      expect(config.port).toBe(3000);
      const warningCalls = warnSpy.mock.calls.flat().join(' ');
      expect(warningCalls).toContain('Invalid port');
    });

    it('should warn about port less than 1', async () => {
      process.env.PORT = '0';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { config } = await import('../../../src/config');

      expect(config.port).toBe(3000);
      const warningCalls = warnSpy.mock.calls.flat().join(' ');
      expect(warningCalls).toContain('Invalid port');
    });
  });

  describe('Config interface', () => {
    it('should have all required properties', async () => {
      const { config } = await import('../../../src/config');

      expect(config).toHaveProperty('port');
      expect(config).toHaveProperty('host');
      expect(config).toHaveProperty('apiKey');
      expect(config).toHaveProperty('webhookSecret');
      expect(config).toHaveProperty('corsOrigin');
      expect(config).toHaveProperty('sessionPath');
      expect(config).toHaveProperty('webhookTimeout');
      expect(config).toHaveProperty('webhookMaxRetries');
      expect(config).toHaveProperty('webhookRetryDelay');
      expect(config).toHaveProperty('logLevel');
    });
  });
});
