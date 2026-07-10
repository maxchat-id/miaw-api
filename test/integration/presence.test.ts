/**
 * Phase 6 Presence & UX Integration Tests
 *
 * Tests presence and UX features:
 * - Set presence (available/unavailable)
 * - Send typing indicator
 * - Send recording indicator
 * - Stop typing/recording
 * - Mark message as read
 * - Subscribe to presence updates
 *
 * NOTE: These tests require a connected WhatsApp instance and a test contact.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { startTestServer, stopTestServer, createTestClient } from './helpers/server.js';
import { WebhookTestServer } from './helpers/webhook.js';
import { TEST_CONFIG } from './fixtures/data.js';

describe('Phase 6 Presence & UX Tests', () => {
  let client: any;
  let webhookServer: WebhookTestServer;
  let testInstanceId: string;
  let testContactJid: string;

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
    testContactJid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;
    webhookServer.clearEvents();

    // Create instance
    await client.post('/instances', {
      instanceId: testInstanceId,
      webhookUrl: webhookServer.getWebhookUrl(),
      webhookEvents: [],
    });
  });

  afterEach(async () => {
    try {
      await client.delete(`/instances/${testInstanceId}`);
    } catch {
      // Ignore if instance doesn't exist
    }
  });

  describe('Set Presence', () => {
    it.skip('should set presence to available (online)', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/presence`, {
        status: 'available',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
    });

    it.skip('should set presence to unavailable (offline)', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/presence`, {
        status: 'unavailable',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
    });

    it.skip('should reject invalid presence status', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/presence`, {
        status: 'invalid',
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/presence`, {
        status: 'available',
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject missing status in request body', async () => {
      const response = await client.post(`/instances/${testInstanceId}/presence`, {});

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Send Typing Indicator', () => {
    it.skip('should send typing indicator to contact', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/typing/${testContactJid}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/typing/${testContactJid}`);

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should handle invalid JID format', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/typing/invalid-jid`);

      // Should either work or return error, depending on baileys behavior
      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('Send Recording Indicator', () => {
    it.skip('should send recording indicator to contact', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(
        `/instances/${testInstanceId}/recording/${testContactJid}`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(
        `/instances/${testInstanceId}/recording/${testContactJid}`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should handle invalid JID format', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/recording/invalid-jid`);

      // Should either work or return error, depending on baileys behavior
      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('Stop Typing/Recording Indicator', () => {
    it.skip('should stop typing indicator', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First send typing indicator
      await client.post(`/instances/${testInstanceId}/typing/${testContactJid}`);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Then stop it
      const response = await client.post(
        `/instances/${testInstanceId}/stop-typing/${testContactJid}`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
    });

    it.skip('should stop recording indicator', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First send recording indicator
      await client.post(`/instances/${testInstanceId}/recording/${testContactJid}`);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Then stop it
      const response = await client.post(
        `/instances/${testInstanceId}/stop-typing/${testContactJid}`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(
        `/instances/${testInstanceId}/stop-typing/${testContactJid}`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Mark Message as Read', () => {
    it.skip('should mark message as read', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Create a minimal message object for testing
      const testMessageId = `test-message-${Date.now()}`;
      const response = await client.post(`/instances/${testInstanceId}/read`, {
        messageId: testMessageId,
        fromJid: testContactJid,
      });

      // Baileys may return success or error depending on if message exists
      expect([200, 400, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.data.success).toBe(true);
      }
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/read`, {
        messageId: 'test-message-id',
        fromJid: testContactJid,
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject missing messageId', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/read`, {
        fromJid: testContactJid,
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject missing fromJid', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/read`, {
        messageId: 'test-message-id',
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Subscribe to Presence', () => {
    it.skip('should subscribe to presence updates for a contact', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(
        `/instances/${testInstanceId}/subscribe/${testContactJid}`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(
        `/instances/${testInstanceId}/subscribe/${testContactJid}`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should handle invalid JID format', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/subscribe/invalid-jid`);

      // Should either work or return error, depending on baileys behavior
      expect([200, 400, 500]).toContain(response.status);
    });

    it.skip('should allow subscribing to multiple contacts', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const contactB = `${TEST_CONFIG.TEST_CONTACT_B}@s.whatsapp.net`;

      // Subscribe to first contact
      const response1 = await client.post(
        `/instances/${testInstanceId}/subscribe/${testContactJid}`,
      );
      expect(response1.status).toBe(200);

      // Subscribe to second contact
      const response2 = await client.post(`/instances/${testInstanceId}/subscribe/${contactB}`);
      expect(response2.status).toBe(200);
    });
  });

  describe('Combined Presence Operations', () => {
    it.skip('should send typing and then stop', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Send typing
      const typingResponse = await client.post(
        `/instances/${testInstanceId}/typing/${testContactJid}`,
      );
      expect(typingResponse.status).toBe(200);

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Stop typing
      const stopResponse = await client.post(
        `/instances/${testInstanceId}/stop-typing/${testContactJid}`,
      );
      expect(stopResponse.status).toBe(200);
    });

    it.skip('should toggle presence between available and unavailable', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Set available
      const availableResponse = await client.post(`/instances/${testInstanceId}/presence`, {
        status: 'available',
      });
      expect(availableResponse.status).toBe(200);

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Set unavailable
      const unavailableResponse = await client.post(`/instances/${testInstanceId}/presence`, {
        status: 'unavailable',
      });
      expect(unavailableResponse.status).toBe(200);

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Set available again
      const availableAgainResponse = await client.post(`/instances/${testInstanceId}/presence`, {
        status: 'available',
      });
      expect(availableAgainResponse.status).toBe(200);
    });

    it.skip('should handle rapid presence changes', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const statuses = ['available', 'unavailable', 'available', 'unavailable'];

      for (const status of statuses) {
        const response = await client.post(`/instances/${testInstanceId}/presence`, {
          status,
        });
        expect(response.status).toBe(200);
      }
    });
  });

  describe('Error Handling', () => {
    it.skip('should handle invalid instance ID', async () => {
      const response = await client.post(`/instances/non-existent/presence`, {
        status: 'available',
      });

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
    });

    it.skip('should handle malformed request', async () => {
      const response = await client.post(`/instances/${testInstanceId}/presence`, {
        invalid: 'field',
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });
});
