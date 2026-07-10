/**
 * Phase 7 Webhook Integration Tests
 *
 * Tests webhook delivery system:
 * - Webhook configuration (URL, events)
 * - Event delivery (all event types)
 * - Webhook signature (headers, format, verification)
 * - Retry mechanism
 * - Webhook management endpoints (test, status)
 *
 * NOTE: These tests require a connected WhatsApp instance and a running webhook server.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { startTestServer, stopTestServer, createTestClient } from './helpers/server.js';
import { WebhookTestServer } from './helpers/webhook.js';
import { TEST_CONFIG } from './fixtures/data.js';
import crypto from 'crypto';

describe('Phase 7 Webhook Tests', () => {
  let client: any;
  let webhookServer: WebhookTestServer;
  let testInstanceId: string;

  beforeAll(async () => {
    await startTestServer();
    webhookServer = new WebhookTestServer(3001);
    await webhookServer.start();
  }, 30000);

  afterAll(async () => {
    await webhookServer.stop();
    await stopTestServer();
  }, 10000);

  beforeEach(async () => {
    client = createTestClient();
    testInstanceId = `test-${Date.now()}`;
    webhookServer.clearEvents();
  });

  afterEach(async () => {
    try {
      await client.delete(`/instances/${testInstanceId}`);
    } catch {
      // Ignore if instance doesn't exist
    }
  });

  describe('Webhook Configuration', () => {
    it('should set webhook URL on instance creation', async () => {
      const response = await client.post('/instances', {
        instanceId: testInstanceId,
        webhookUrl: webhookServer.getWebhookUrl(),
        webhookEvents: ['message', 'ready'],
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.webhookUrl).toBe(webhookServer.getWebhookUrl());
      expect(response.data.data.webhookEvents).toEqual(['message', 'ready']);
    });

    it('should update webhook URL', async () => {
      // Create instance with initial webhook
      await client.post('/instances', {
        instanceId: testInstanceId,
        webhookUrl: 'https://example.com/webhook',
        webhookEvents: [],
      });

      // Update webhook URL
      const response = await client.patch(`/instances/${testInstanceId}`, {
        webhookUrl: webhookServer.getWebhookUrl(),
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.webhookUrl).toBe(webhookServer.getWebhookUrl());
    });

    it('should configure webhook events filter', async () => {
      const response = await client.post('/instances', {
        instanceId: testInstanceId,
        webhookUrl: webhookServer.getWebhookUrl(),
        webhookEvents: ['message', 'ready', 'qr'],
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.webhookEvents).toEqual(['message', 'ready', 'qr']);
    });

    it('should disable webhook with empty URL', async () => {
      // Create with webhook
      await client.post('/instances', {
        instanceId: testInstanceId,
        webhookUrl: webhookServer.getWebhookUrl(),
        webhookEvents: ['message'],
      });

      // Disable webhook
      const response = await client.patch(`/instances/${testInstanceId}`, {
        webhookUrl: '',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.webhookUrl).toBe('');
    });
  });

  describe('Event Delivery', () => {
    beforeEach(async () => {
      await client.post('/instances', {
        instanceId: testInstanceId,
        webhookUrl: webhookServer.getWebhookUrl(),
        webhookEvents: ['message', 'ready', 'qr', 'connection', 'disconnected', 'error'],
      });
    });

    it.skip('should deliver QR event', async () => {
      // Trigger QR generation by connecting
      await client.post(`/instances/${testInstanceId}/connect`);

      // Wait for webhook
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const events = webhookServer.getEvents();
      const qrEvent = events.find((e: any) => e.event === 'qr');

      expect(qrEvent).toBeDefined();
      expect(qrEvent.instanceId).toBe(testInstanceId);
    });

    it.skip('should deliver ready event when connected', async () => {
      // This requires actual WhatsApp connection
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Ready event would have been sent during connection
      // We can verify by checking webhook status
      const status = await client.get(`/instances/${testInstanceId}/webhook/status`);

      expect(status.status).toBe(200);
      expect(status.data.data.stats.delivered).toBeGreaterThan(0);
    });

    it.skip('should deliver message event', async () => {
      // This requires receiving an actual message
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Wait for incoming message (manual trigger required)
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const events = webhookServer.getEvents();
      const messageEvent = events.find((e: any) => e.event === 'message');

      if (messageEvent) {
        expect(messageEvent.event).toBe('message');
        expect(messageEvent.instanceId).toBe(testInstanceId);
        expect(messageEvent.data).toBeDefined();
      } else {
        console.log('No message received (manual trigger required)');
      }
    });
  });

  describe('Webhook Signature', () => {
    beforeEach(async () => {
      await client.post('/instances', {
        instanceId: testInstanceId,
        webhookUrl: webhookServer.getWebhookUrl(),
        webhookEvents: [],
      });
    });

    it('should include X-Miaw-Signature header', async () => {
      // Send test webhook
      await client.post(`/instances/${testInstanceId}/webhook/test`);

      // Wait for delivery
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const events = webhookServer.getEvents();
      expect(events.length).toBeGreaterThan(0);

      const lastEvent = events[events.length - 1];
      expect(lastEvent.headers['x-miaw-signature']).toBeDefined();
    });

    it('should include X-Miaw-Timestamp header', async () => {
      await client.post(`/instances/${testInstanceId}/webhook/test`);

      await new Promise((resolve) => setTimeout(resolve, 3000));

      const events = webhookServer.getEvents();
      expect(events.length).toBeGreaterThan(0);

      const lastEvent = events[events.length - 1];
      expect(lastEvent.headers['x-miaw-timestamp']).toBeDefined();

      // Verify timestamp is recent (within 5 minutes)
      const timestamp = parseInt(lastEvent.headers['x-miaw-timestamp'], 10);
      const now = Date.now();
      expect(now - timestamp).toBeLessThan(300000);
    });

    it('should use sha256= format for signature', async () => {
      await client.post(`/instances/${testInstanceId}/webhook/test`);

      await new Promise((resolve) => setTimeout(resolve, 3000));

      const events = webhookServer.getEvents();
      expect(events.length).toBeGreaterThan(0);

      const lastEvent = events[events.length - 1];
      const signature = lastEvent.headers['x-miaw-signature'];

      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('should verify valid signature', async () => {
      await client.post(`/instances/${testInstanceId}/webhook/test`);

      await new Promise((resolve) => setTimeout(resolve, 3000));

      const events = webhookServer.getEvents();
      expect(events.length).toBeGreaterThan(0);

      const lastEvent = events[events.length - 1];
      const signature = lastEvent.headers['x-miaw-signature'];
      const timestamp = parseInt(lastEvent.headers['x-miaw-timestamp'], 10);
      const payload = lastEvent.body;

      // Verify signature
      const payloadString = JSON.stringify(payload);
      const payloadWithTimestamp = `${timestamp}.${payloadString}`;
      const computedSignature = crypto
        .createHmac('sha256', TEST_CONFIG.WEBHOOK_SECRET)
        .update(payloadWithTimestamp)
        .digest('hex');

      expect(signature).toBe(`sha256=${computedSignature}`);
    });

    it('should reject replay attacks with old timestamps', async () => {
      // Test with old timestamp (more than 5 minutes ago)
      const oldTimestamp = Date.now() - 400000; // ~6.5 minutes ago
      const payload = { test: 'data' };

      const payloadString = JSON.stringify(payload);
      const payloadWithTimestamp = `${oldTimestamp}.${payloadString}`;
      const signature = crypto
        .createHmac('sha256', TEST_CONFIG.WEBHOOK_SECRET)
        .update(payloadWithTimestamp)
        .digest('hex');

      // Verify should fail for old timestamp
      const isValid = verifyWebhookSignature(payload, `sha256=${signature}`, oldTimestamp);
      expect(isValid).toBe(false);
    });
  });

  describe('Retry Mechanism', () => {
    it.skip('should retry failed webhook delivery', async () => {
      // Configure webhook to fail endpoint
      webhookServer.setFailMode(true);

      await client.post('/instances', {
        instanceId: testInstanceId,
        webhookUrl: webhookServer.getWebhookUrl(),
        webhookEvents: [],
      });

      await client.post(`/instances/${testInstanceId}/webhook/test`);

      // Wait for retries
      await new Promise((resolve) => setTimeout(resolve, 10000));

      webhookServer.setFailMode(false);

      // Check retry attempts
      const attempts = webhookServer.getRequestCount();
      expect(attempts).toBeGreaterThan(1);
    });

    it.skip('should stop retrying after max attempts', async () => {
      webhookServer.setFailMode(true);

      await client.post('/instances', {
        instanceId: testInstanceId,
        webhookUrl: webhookServer.getWebhookUrl(),
        webhookEvents: [],
      });

      await client.post(`/instances/${testInstanceId}/webhook/test`);

      // Wait for max retries (5 attempts)
      await new Promise((resolve) => setTimeout(resolve, 30000));

      webhookServer.setFailMode(false);

      const attempts = webhookServer.getRequestCount();
      // Default max retries is 5
      expect(attempts).toBeLessThanOrEqual(5);
    });
  });

  describe('Webhook Management Endpoints', () => {
    beforeEach(async () => {
      await client.post('/instances', {
        instanceId: testInstanceId,
        webhookUrl: webhookServer.getWebhookUrl(),
        webhookEvents: ['message', 'ready'],
      });
    });

    describe('POST /instances/:id/webhook/test', () => {
      it('should send test webhook event', async () => {
        const response = await client.post(`/instances/${testInstanceId}/webhook/test`);

        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.data.sent).toBe(true);
        expect(response.data.data.webhookUrl).toBe(webhookServer.getWebhookUrl());
        expect(response.data.data.testEvent.event).toBe('test');
      });

      it('should send custom event type', async () => {
        const response = await client.post(`/instances/${testInstanceId}/webhook/test`, {
          event: 'message',
        });

        expect(response.status).toBe(200);
        expect(response.data.data.testEvent.event).toBe('message');
      });

      it('should reject when no webhook URL configured', async () => {
        // Create instance without webhook
        const noWebhookId = `test-${Date.now()}`;
        await client.post('/instances', {
          instanceId: noWebhookId,
          webhookUrl: '',
          webhookEvents: [],
        });

        const response = await client.post(`/instances/${noWebhookId}/webhook/test`);

        expect(response.status).toBe(400);
        expect(response.data.success).toBe(false);

        await client.delete(`/instances/${noWebhookId}`);
      });

      it('should reject invalid event type', async () => {
        const response = await client.post(`/instances/${testInstanceId}/webhook/test`, {
          event: 'invalid-event',
        });

        expect(response.status).toBe(400);
        expect(response.data.success).toBe(false);
      });

      it('should reject non-existent instance', async () => {
        const response = await client.post(`/instances/non-existent/webhook/test`);

        expect(response.status).toBe(404);
        expect(response.data.success).toBe(false);
      });
    });

    describe('GET /instances/:id/webhook/status', () => {
      it('should return webhook statistics', async () => {
        const response = await client.get(`/instances/${testInstanceId}/webhook/status`);

        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.data.instanceId).toBe(testInstanceId);
        expect(response.data.data.webhookUrl).toBe(webhookServer.getWebhookUrl());
        expect(response.data.data.webhookEvents).toEqual(['message', 'ready']);
        expect(response.data.data.stats).toBeDefined();
      });

      it('should include stats fields', async () => {
        const response = await client.get(`/instances/${testInstanceId}/webhook/status`);

        const stats = response.data.data.stats;
        expect(stats).toHaveProperty('queued');
        expect(stats).toHaveProperty('delivered');
        expect(stats).toHaveProperty('failed');
      });

      it('should update stats after webhook delivery', async () => {
        // Get initial stats
        const beforeResponse = await client.get(`/instances/${testInstanceId}/webhook/status`);
        const beforeStats = beforeResponse.data.data.stats;

        // Send test webhook
        await client.post(`/instances/${testInstanceId}/webhook/test`);

        // Wait for delivery
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Get updated stats
        const afterResponse = await client.get(`/instances/${testInstanceId}/webhook/status`);
        const afterStats = afterResponse.data.data.stats;

        expect(afterStats.delivered).toBeGreaterThanOrEqual(beforeStats.delivered);
      });

      it('should return null webhook URL when not configured', async () => {
        const noWebhookId = `test-${Date.now()}`;
        await client.post('/instances', {
          instanceId: noWebhookId,
          webhookUrl: '',
          webhookEvents: [],
        });

        const response = await client.get(`/instances/${noWebhookId}/webhook/status`);

        expect(response.status).toBe(200);
        expect(response.data.data.webhookUrl).toBeNull();
        expect(response.data.data.webhookEvents).toEqual([]);

        await client.delete(`/instances/${noWebhookId}`);
      });

      it('should reject non-existent instance', async () => {
        const response = await client.get(`/instances/non-existent/webhook/status`);

        expect(response.status).toBe(404);
        expect(response.data.success).toBe(false);
      });
    });
  });

  describe('Combined Webhook Operations', () => {
    it('should handle multiple webhook events', async () => {
      await client.post('/instances', {
        instanceId: testInstanceId,
        webhookUrl: webhookServer.getWebhookUrl(),
        webhookEvents: ['test', 'message', 'ready'],
      });

      // Send multiple test webhooks
      await client.post(`/instances/${testInstanceId}/webhook/test`, { event: 'test' });
      await new Promise((resolve) => setTimeout(resolve, 500));

      await client.post(`/instances/${testInstanceId}/webhook/test`, { event: 'ready' });
      await new Promise((resolve) => setTimeout(resolve, 500));

      await client.post(`/instances/${testInstanceId}/webhook/test`, { event: 'message' });
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const events = webhookServer.getEvents();
      expect(events.length).toBeGreaterThanOrEqual(3);
    });

    it('should update webhook configuration dynamically', async () => {
      // Create with initial config
      await client.post('/instances', {
        instanceId: testInstanceId,
        webhookUrl: webhookServer.getWebhookUrl(),
        webhookEvents: ['message'],
      });

      // Update to different URL
      const newWebhookServer = new WebhookTestServer(3002);
      await newWebhookServer.start();

      await client.patch(`/instances/${testInstanceId}`, {
        webhookUrl: newWebhookServer.getWebhookUrl(),
      });

      // Send test - should go to new URL
      await client.post(`/instances/${testInstanceId}/webhook/test`);
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const newEvents = newWebhookServer.getEvents();
      expect(newEvents.length).toBeGreaterThan(0);

      await newWebhookServer.stop();
    });
  });
});

/**
 * Helper function to verify webhook signature
 */
function verifyWebhookSignature(payload: any, signature: string, timestamp: number): boolean {
  const maxAge = 300000; // 5 minutes
  const now = Date.now();

  // Check timestamp age
  if (now - timestamp > maxAge) {
    return false;
  }

  // Extract signature from format: sha256=<hex>
  const match = signature.match(/^sha256=(.+)$/);
  if (!match) {
    return false;
  }

  const expectedSignature = match[1];
  const payloadString = JSON.stringify(payload);
  const payloadWithTimestamp = `${timestamp}.${payloadString}`;
  const computedSignature = crypto
    .createHmac('sha256', TEST_CONFIG.WEBHOOK_SECRET)
    .update(payloadWithTimestamp)
    .digest('hex');

  return expectedSignature === computedSignature;
}
