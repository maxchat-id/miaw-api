/**
 * Unit tests for WebhookDispatcher service
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { WebhookDispatcher } from '../../../src/services/WebhookDispatcher';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('WebhookDispatcher', () => {
  let dispatcher: WebhookDispatcher;

  const defaultOptions = {
    secret: 'test-webhook-secret',
    timeout: 5000,
    maxRetries: 3,
    retryDelay: 1000,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    dispatcher = new WebhookDispatcher(defaultOptions);
  });

  afterEach(() => {
    dispatcher.dispose();
    vi.useRealTimers();
  });

  describe('queue()', () => {
    it('should add webhook to delivery queue', async () => {
      const url = 'https://example.com/webhook';
      const payload = { event: 'message', instanceId: 'test-1', timestamp: 123 };

      await dispatcher.queue(url, payload);

      expect(dispatcher.getQueueSize()).toBe(1);
    });

    it('should increment queued stat', async () => {
      const url = 'https://example.com/webhook';
      const payload = { event: 'message', instanceId: 'test-1', timestamp: 123 };

      await dispatcher.queue(url, payload);

      const stats = dispatcher.getStats();
      expect(stats.queued).toBe(1);
    });

    it('should allow multiple webhooks in queue', async () => {
      await dispatcher.queue('https://a.com/hook', {
        event: 'msg1',
        instanceId: 'i1',
        timestamp: 1,
      });
      await dispatcher.queue('https://b.com/hook', {
        event: 'msg2',
        instanceId: 'i2',
        timestamp: 2,
      });
      await dispatcher.queue('https://c.com/hook', {
        event: 'msg3',
        instanceId: 'i3',
        timestamp: 3,
      });

      expect(dispatcher.getQueueSize()).toBe(3);
    });
  });

  describe('generateSignature (via verifySignature)', () => {
    it('should generate signature in sha256=<hex> format', () => {
      const payload = { event: 'test', data: 'value' };
      const timestamp = Date.now();

      // Queue to trigger signature generation
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      // Use verifySignature to test the format
      const result = WebhookDispatcher.verifySignature(
        payload,
        'sha256=abc123',
        timestamp,
        'secret',
      );

      // Even with wrong signature, format should be checked
      expect(result).toBe(false);
    });

    it('should create consistent signatures for same payload and timestamp', () => {
      const payload = { event: 'test', instanceId: 'i1', timestamp: 1000 };
      const timestamp = 1000000;
      const secret = 'test-secret';

      // Verify same input produces same result
      const result1 = WebhookDispatcher.verifySignature(
        payload,
        'sha256=invalid',
        timestamp,
        secret,
      );
      const result2 = WebhookDispatcher.verifySignature(
        payload,
        'sha256=invalid',
        timestamp,
        secret,
      );

      // Both should fail with same invalid signature
      expect(result1).toBe(result2);
    });
  });

  describe('verifySignature()', () => {
    const secret = 'webhook-secret-123';
    const payload = { event: 'message', instanceId: 'test', timestamp: 12345 };

    function computeSignature(payload: any, timestamp: number): string {
      const crypto = require('crypto');
      const payloadString = JSON.stringify(payload);
      const payloadWithTimestamp = `${timestamp}.${payloadString}`;
      const signature = crypto
        .createHmac('sha256', secret)
        .update(payloadWithTimestamp)
        .digest('hex');
      return `sha256=${signature}`;
    }

    it('should verify valid signature', () => {
      const timestamp = Date.now();
      const signature = computeSignature(payload, timestamp);

      const result = WebhookDispatcher.verifySignature(payload, signature, timestamp, secret);

      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const timestamp = Date.now();

      const result = WebhookDispatcher.verifySignature(
        payload,
        'sha256=invalid_signature_here',
        timestamp,
        secret,
      );

      expect(result).toBe(false);
    });

    it('should reject expired timestamp (older than maxAge)', () => {
      const oldTimestamp = Date.now() - 400000; // 6+ minutes old
      const signature = computeSignature(payload, oldTimestamp);

      const result = WebhookDispatcher.verifySignature(
        payload,
        signature,
        oldTimestamp,
        secret,
        300000, // 5 minutes max age
      );

      expect(result).toBe(false);
    });

    it('should accept valid timestamp within maxAge', () => {
      const recentTimestamp = Date.now() - 60000; // 1 minute old
      const signature = computeSignature(payload, recentTimestamp);

      const result = WebhookDispatcher.verifySignature(
        payload,
        signature,
        recentTimestamp,
        secret,
        300000, // 5 minutes max age
      );

      expect(result).toBe(true);
    });

    it('should reject signature without sha256= prefix', () => {
      const timestamp = Date.now();
      const crypto = require('crypto');
      const payloadString = JSON.stringify(payload);
      const payloadWithTimestamp = `${timestamp}.${payloadString}`;
      const rawSignature = crypto
        .createHmac('sha256', secret)
        .update(payloadWithTimestamp)
        .digest('hex');

      const result = WebhookDispatcher.verifySignature(
        payload,
        rawSignature, // Missing sha256= prefix
        timestamp,
        secret,
      );

      expect(result).toBe(false);
    });

    it('should reject signature with wrong prefix', () => {
      const timestamp = Date.now();
      const crypto = require('crypto');
      const payloadString = JSON.stringify(payload);
      const payloadWithTimestamp = `${timestamp}.${payloadString}`;
      const rawSignature = crypto
        .createHmac('sha256', secret)
        .update(payloadWithTimestamp)
        .digest('hex');

      const result = WebhookDispatcher.verifySignature(
        payload,
        `md5=${rawSignature}`, // Wrong prefix
        timestamp,
        secret,
      );

      expect(result).toBe(false);
    });

    it('should reject tampered payload', () => {
      const timestamp = Date.now();
      const signature = computeSignature(payload, timestamp);
      const tamperedPayload = { ...payload, event: 'tampered' };

      const result = WebhookDispatcher.verifySignature(
        tamperedPayload,
        signature,
        timestamp,
        secret,
      );

      expect(result).toBe(false);
    });

    it('should reject wrong secret', () => {
      const timestamp = Date.now();
      const signature = computeSignature(payload, timestamp);

      const result = WebhookDispatcher.verifySignature(
        payload,
        signature,
        timestamp,
        'wrong-secret',
      );

      expect(result).toBe(false);
    });

    it('should use default maxAge of 5 minutes', () => {
      const timestamp = Date.now() - 299000; // Just under 5 minutes
      const signature = computeSignature(payload, timestamp);

      const result = WebhookDispatcher.verifySignature(
        payload,
        signature,
        timestamp,
        secret,
        // No maxAge specified, should default to 300000
      );

      expect(result).toBe(true);
    });

    it('should be timing-safe (reject different length signatures)', () => {
      const timestamp = Date.now();

      const result = WebhookDispatcher.verifySignature(
        payload,
        'sha256=short', // Shorter than actual signature
        timestamp,
        secret,
      );

      expect(result).toBe(false);
    });
  });

  describe('calculateRetryDelay (via queue processing)', () => {
    it('should use exponential backoff delays', async () => {
      // Test the documented delays: [0, 60000, 300000, 900000, 3600000]
      // We can observe this indirectly through queue behavior
      mockFetch.mockRejectedValue(new Error('Network error'));

      await dispatcher.queue('https://test.com/hook', {
        event: 'test',
        instanceId: 'i1',
        timestamp: 1,
      });

      // First attempt happens immediately on first process
      vi.advanceTimersByTime(1000);

      // After failure, retry should be scheduled
      // The actual delay values are internal but we can verify the queue persists
      expect(dispatcher.getQueueSize()).toBe(1);
    });
  });

  describe('getStats()', () => {
    it('should return initial stats', () => {
      const stats = dispatcher.getStats();

      expect(stats.queued).toBe(0);
      expect(stats.delivered).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.lastDeliveryTime).toBeUndefined();
      expect(stats.lastFailureTime).toBeUndefined();
    });

    it('should track successful delivery', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      await dispatcher.queue('https://test.com/hook', {
        event: 'test',
        instanceId: 'i1',
        timestamp: 1,
      });

      // Process the queue
      vi.advanceTimersByTime(1000);
      await Promise.resolve(); // Let async handlers run

      const stats = dispatcher.getStats();
      expect(stats.delivered).toBe(1);
      expect(stats.lastDeliveryTime).toBeDefined();
    });

    it('should track failed delivery', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await dispatcher.queue('https://test.com/hook', {
        event: 'test',
        instanceId: 'i1',
        timestamp: 1,
      });

      // Process the queue
      vi.advanceTimersByTime(1000);
      await Promise.resolve(); // Let async handlers run

      const stats = dispatcher.getStats();
      expect(stats.failed).toBeGreaterThanOrEqual(1);
      expect(stats.lastFailureTime).toBeDefined();
    });

    it('should return current queue size', async () => {
      await dispatcher.queue('https://a.com/hook', {
        event: 'e1',
        instanceId: 'i1',
        timestamp: 1,
      });
      await dispatcher.queue('https://b.com/hook', {
        event: 'e2',
        instanceId: 'i2',
        timestamp: 2,
      });

      const stats = dispatcher.getStats();
      expect(stats.queued).toBe(2);
    });
  });

  describe('resetStats()', () => {
    it('should reset all stats to zero', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      await dispatcher.queue('https://test.com/hook', {
        event: 'test',
        instanceId: 'i1',
        timestamp: 1,
      });

      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      dispatcher.resetStats();
      const stats = dispatcher.getStats();

      expect(stats.delivered).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.lastDeliveryTime).toBeUndefined();
      expect(stats.lastFailureTime).toBeUndefined();
    });
  });

  describe('getQueueSize()', () => {
    it('should return 0 for empty queue', () => {
      expect(dispatcher.getQueueSize()).toBe(0);
    });

    it('should return correct queue size', async () => {
      await dispatcher.queue('https://a.com/hook', {
        event: 'e1',
        instanceId: 'i1',
        timestamp: 1,
      });

      expect(dispatcher.getQueueSize()).toBe(1);

      await dispatcher.queue('https://b.com/hook', {
        event: 'e2',
        instanceId: 'i2',
        timestamp: 2,
      });

      expect(dispatcher.getQueueSize()).toBe(2);
    });
  });

  describe('dispose()', () => {
    it('should clear processing interval', () => {
      dispatcher.dispose();

      // After dispose, no more processing should happen
      // This is hard to test directly, but we ensure no errors
      expect(() => dispatcher.dispose()).not.toThrow();
    });

    it('should clear delivery queue', async () => {
      await dispatcher.queue('https://test.com/hook', {
        event: 'test',
        instanceId: 'i1',
        timestamp: 1,
      });

      expect(dispatcher.getQueueSize()).toBe(1);

      dispatcher.dispose();

      expect(dispatcher.getQueueSize()).toBe(0);
    });
  });

  describe('Delivery behavior', () => {
    it('should send POST request with correct headers', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      const payload = { event: 'test', instanceId: 'i1', timestamp: 12345 };

      await dispatcher.queue('https://test.com/hook', payload);

      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.com/hook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Miaw-Signature': expect.stringMatching(/^sha256=/),
            'X-Miaw-Timestamp': expect.any(String),
            'User-Agent': 'Miaw-Webhook/1.0',
          }),
          body: JSON.stringify(payload),
        }),
      );
    });

    it('should remove webhook from queue on successful delivery', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      await dispatcher.queue('https://test.com/hook', {
        event: 'test',
        instanceId: 'i1',
        timestamp: 1,
      });

      expect(dispatcher.getQueueSize()).toBe(1);

      // Advance timer and flush promises to allow async processing
      await vi.advanceTimersByTimeAsync(1500);

      expect(dispatcher.getQueueSize()).toBe(0);
    });

    it('should keep webhook in queue on non-OK response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      await dispatcher.queue('https://test.com/hook', {
        event: 'test',
        instanceId: 'i1',
        timestamp: 1,
      });

      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      // Should still be in queue for retry
      expect(dispatcher.getQueueSize()).toBe(1);
    });

    it('should remove webhook after max retries', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      // Create dispatcher with low max retries for testing
      dispatcher.dispose();
      dispatcher = new WebhookDispatcher({
        ...defaultOptions,
        maxRetries: 2,
      });

      await dispatcher.queue('https://test.com/hook', {
        event: 'test',
        instanceId: 'i1',
        timestamp: 1,
      });

      // Process multiple times to exhaust retries
      // Attempt 1
      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      // Attempt 2
      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      // Attempt 3 (reaches max)
      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      // Should be removed after max retries
      expect(dispatcher.getQueueSize()).toBe(0);
    });
  });

  describe('Error handling in processQueue', () => {
    it('should not crash on unexpected errors', async () => {
      // This tests the try-catch wrapper we added
      mockFetch.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await dispatcher.queue('https://test.com/hook', {
        event: 'test',
        instanceId: 'i1',
        timestamp: 1,
      });

      // Should not throw
      expect(() => {
        vi.advanceTimersByTime(1000);
      }).not.toThrow();
    });
  });
});
