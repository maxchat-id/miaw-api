/**
 * Unit tests for Auth Middleware
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAuthMiddleware } from '../../../src/middleware/auth';
import { UnauthorizedError } from '../../../src/utils/errorHandler';

// Mock the config module
vi.mock('../../../src/config', () => ({
  config: {
    apiKey: 'test-api-key-12345',
  },
}));

describe('Auth Middleware', () => {
  let authMiddleware: ReturnType<typeof createAuthMiddleware>;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    authMiddleware = createAuthMiddleware();

    mockRequest = {
      headers: {},
      ip: '127.0.0.1',
      method: 'GET',
      url: '/test',
      log: {
        warn: vi.fn(),
      },
    };

    mockReply = {};
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('API key extraction', () => {
    it('should accept valid API key from Authorization Bearer header', async () => {
      mockRequest.headers = {
        authorization: 'Bearer test-api-key-12345',
      };

      await expect(authMiddleware(mockRequest, mockReply)).resolves.toBeUndefined();
    });

    it('should accept valid API key from X-API-Key header', async () => {
      mockRequest.headers = {
        'x-api-key': 'test-api-key-12345',
      };

      await expect(authMiddleware(mockRequest, mockReply)).resolves.toBeUndefined();
    });

    it('should prefer Authorization header over X-API-Key', async () => {
      mockRequest.headers = {
        authorization: 'Bearer test-api-key-12345',
        'x-api-key': 'wrong-key',
      };

      // Should succeed because Authorization header has correct key
      await expect(authMiddleware(mockRequest, mockReply)).resolves.toBeUndefined();
    });

    it('should fall back to X-API-Key when Authorization header is missing', async () => {
      mockRequest.headers = {
        'x-api-key': 'test-api-key-12345',
      };

      await expect(authMiddleware(mockRequest, mockReply)).resolves.toBeUndefined();
    });

    it('should handle Authorization header without Bearer prefix', async () => {
      mockRequest.headers = {
        authorization: 'test-api-key-12345', // Missing "Bearer "
      };

      // Without Bearer prefix, it won't extract the key, falling back to x-api-key
      await expect(authMiddleware(mockRequest, mockReply)).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('Missing API key', () => {
    it('should throw UnauthorizedError when no headers provided', async () => {
      mockRequest.headers = {};

      await expect(authMiddleware(mockRequest, mockReply)).rejects.toThrow(UnauthorizedError);
      await expect(authMiddleware(mockRequest, mockReply)).rejects.toThrow('Missing API key');
    });

    it('should log audit event for missing API key', async () => {
      mockRequest.headers = {};

      try {
        await authMiddleware(mockRequest, mockReply);
      } catch {
        // Expected to throw
      }

      expect(mockRequest.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'auth_failure',
          reason: 'missing_api_key',
          ip: '127.0.0.1',
          method: 'GET',
          url: '/test',
        }),
        expect.stringContaining('Missing API key'),
      );
    });
  });

  describe('Invalid API key', () => {
    it('should throw UnauthorizedError for wrong API key', async () => {
      mockRequest.headers = {
        authorization: 'Bearer wrong-api-key',
      };

      await expect(authMiddleware(mockRequest, mockReply)).rejects.toThrow(UnauthorizedError);
      await expect(authMiddleware(mockRequest, mockReply)).rejects.toThrow('Invalid API key');
    });

    it('should throw UnauthorizedError for empty API key', async () => {
      mockRequest.headers = {
        authorization: 'Bearer ',
      };

      await expect(authMiddleware(mockRequest, mockReply)).rejects.toThrow(UnauthorizedError);
    });

    it('should log audit event for invalid API key', async () => {
      mockRequest.headers = {
        authorization: 'Bearer wrong-key',
      };

      try {
        await authMiddleware(mockRequest, mockReply);
      } catch {
        // Expected to throw
      }

      expect(mockRequest.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'auth_failure',
          reason: 'invalid_api_key',
          ip: '127.0.0.1',
          method: 'GET',
          url: '/test',
        }),
        expect.stringContaining('Invalid API key'),
      );
    });

    it('should NOT log the invalid key value itself', async () => {
      const sensitiveKey = 'sensitive-api-key-12345';
      mockRequest.headers = {
        authorization: `Bearer ${sensitiveKey}`,
      };

      try {
        await authMiddleware(mockRequest, mockReply);
      } catch {
        // Expected to throw
      }

      // Verify the sensitive key is not in any log call
      const warnCall = mockRequest.log.warn.mock.calls[0];
      const loggedObject = warnCall[0];
      const loggedMessage = warnCall[1];

      expect(JSON.stringify(loggedObject)).not.toContain(sensitiveKey);
      expect(loggedMessage).not.toContain(sensitiveKey);
    });
  });

  describe('Timing-safe comparison', () => {
    it('should reject keys of different lengths', async () => {
      mockRequest.headers = {
        authorization: 'Bearer short',
      };

      await expect(authMiddleware(mockRequest, mockReply)).rejects.toThrow(UnauthorizedError);
    });

    it('should reject keys with same length but different content', async () => {
      // Same length as 'test-api-key-12345' (18 chars)
      mockRequest.headers = {
        authorization: 'Bearer test-api-key-99999',
      };

      await expect(authMiddleware(mockRequest, mockReply)).rejects.toThrow(UnauthorizedError);
    });

    it('should accept exact match', async () => {
      mockRequest.headers = {
        authorization: 'Bearer test-api-key-12345',
      };

      await expect(authMiddleware(mockRequest, mockReply)).resolves.toBeUndefined();
    });
  });

  describe('Request context', () => {
    it('should include client IP in audit logs', async () => {
      mockRequest.headers = {};
      mockRequest.ip = '192.168.1.100';

      try {
        await authMiddleware(mockRequest, mockReply);
      } catch {
        // Expected to throw
      }

      expect(mockRequest.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '192.168.1.100',
        }),
        expect.any(String),
      );
    });

    it('should include request method in audit logs', async () => {
      mockRequest.headers = {};
      mockRequest.method = 'POST';

      try {
        await authMiddleware(mockRequest, mockReply);
      } catch {
        // Expected to throw
      }

      expect(mockRequest.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
        }),
        expect.any(String),
      );
    });

    it('should include request URL in audit logs', async () => {
      mockRequest.headers = {};
      mockRequest.url = '/api/instances/123';

      try {
        await authMiddleware(mockRequest, mockReply);
      } catch {
        // Expected to throw
      }

      expect(mockRequest.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/instances/123',
        }),
        expect.any(String),
      );
    });
  });

  describe('Factory function', () => {
    it('should return a middleware function', () => {
      const middleware = createAuthMiddleware();

      expect(typeof middleware).toBe('function');
    });

    it('should create independent middleware instances', () => {
      const middleware1 = createAuthMiddleware();
      const middleware2 = createAuthMiddleware();

      expect(middleware1).not.toBe(middleware2);
    });
  });
});
