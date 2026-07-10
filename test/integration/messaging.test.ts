/**
 * Messaging Integration Tests
 *
 * Tests sending text messages:
 * - Send text message to phone number
 * - Send text message with quote/reply
 * - Handle validation errors
 *
 * NOTE: These tests require a connected WhatsApp instance.
 * Run connection.test.ts and pair via QR code first.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { startTestServer, stopTestServer, createTestClient } from './helpers/server.js';
import { HttpClient } from './helpers/http.js';
import { WebhookTestServer } from './helpers/webhook.js';
import { TEST_CONFIG } from './fixtures/data.js';

describe('Messaging Tests', () => {
  let client: HttpClient;
  let webhookServer: WebhookTestServer;
  let testInstanceId: string;
  let connectedInstanceId: string;

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

    // Create instance with webhook
    await client.post('/instances', {
      instanceId: testInstanceId,
      webhookUrl: webhookServer.getWebhookUrl(),
      webhookEvents: ['message'],
    });

    // Check if we have a connected instance for message tests
    // In real testing, you'd have a pre-connected instance
    connectedInstanceId = testInstanceId;
  });

  afterEach(async () => {
    // Cleanup: Delete test instance
    try {
      await client.delete(`/instances/${testInstanceId}`);
    } catch {
      // Ignore if instance doesn't exist
    }
  });

  describe('POST /instances/:id/send-text - Send Text Message', () => {
    it('should reject request for non-existent instance', async () => {
      const response = await client.post('/instances/non-existent/send-text', {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'Test message',
      });

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('NOT_FOUND');
    });

    it('should reject when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'Test message',
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(response.data.error.message).toContain('not connected');
    });

    it('should reject empty text message', async () => {
      const response = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: '',
      });

      // Schema validation should catch this
      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it('should reject missing text field', async () => {
      const response = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it('should reject missing to field', async () => {
      const response = await client.post(`/instances/${testInstanceId}/send-text`, {
        text: 'Test message',
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should send text message to phone number', async () => {
      // This test requires a connected instance
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping send test - instance not connected. Run connection tests first.');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'Test message from integration test',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.messageId).toBeDefined();
      expect(response.data.data.to).toBe(TEST_CONFIG.TEST_CONTACT_A);
      expect(response.data.data.timestamp).toBeDefined();
    });

    it.skip('should send text message with JID format', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping send test - instance not connected.');
        return;
      }

      const jid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;

      const response = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: jid,
        text: 'Test message with JID',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.messageId).toBeDefined();
    });

    it.skip('should send text message with quote/reply', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping send test - instance not connected.');
        return;
      }

      // First send a message to get a messageId
      const firstResponse = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'First message',
      });

      const messageId = firstResponse.data.data.messageId;

      // Now send a reply
      const replyResponse = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'Reply to first message',
        quoted: messageId,
      });

      expect(replyResponse.status).toBe(200);
      expect(replyResponse.data.success).toBe(true);
      expect(replyResponse.data.data.messageId).toBeDefined();
    });

    it.skip('should send very long text message', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping send test - instance not connected.');
        return;
      }

      const longText = 'A'.repeat(10000);

      const response = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: longText,
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.messageId).toBeDefined();
    });

    it.skip('should send multiple messages concurrently', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping send test - instance not connected.');
        return;
      }

      const messagePromises = Array.from({ length: 10 }, (_, i) =>
        client.post(`/instances/${testInstanceId}/send-text`, {
          to: TEST_CONFIG.TEST_CONTACT_A,
          text: `Concurrent message ${i + 1}`,
        }),
      );

      const responses = await Promise.all(messagePromises);

      const messageIds = responses.map((r) => r.data.data.messageId);
      const uniqueIds = new Set(messageIds);

      expect(responses).toHaveLength(10);
      expect(uniqueIds.size).toBe(10); // All message IDs should be unique
    });
  });

  describe('Message Webhook Events', () => {
    it.skip('should receive message webhook when message is received', async () => {
      // This test requires:
      // 1. Connected instance
      // 2. Sending a message to the test number from another phone
      // Manual verification needed

      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping webhook test - instance not connected.');
        return;
      }

      console.log('Send a message to the test number from another phone within 30 seconds...');

      const messageEvent = await webhookServer.waitForEvent('message', 30000);

      expect(messageEvent).not.toBeNull();
      expect(messageEvent?.event).toBe('message');
      expect(messageEvent?.instanceId).toBe(testInstanceId);
      expect(messageEvent?.data).toBeDefined();
    });
  });
});
