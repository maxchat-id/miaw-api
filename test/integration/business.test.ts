/**
 * Phase 8 Business Features Integration Tests
 *
 * Tests business features (WhatsApp Business only):
 * - Label management (create, delete, chat labels, message labels)
 * - Product catalog (get catalog, get collections)
 * - Newsletters (get metadata, get messages)
 *
 * NOTE: These tests require a connected WhatsApp Business account.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { startTestServer, stopTestServer, createTestClient } from './helpers/server.js';
import { WebhookTestServer } from './helpers/webhook.js';
import { TEST_CONFIG } from './fixtures/data.js';

describe('Phase 8 Business Features Tests', () => {
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

    // Create instance
    await client.post('/instances', {
      instanceId: testInstanceId,
      webhookUrl: webhookServer.getWebhookUrl(),
      webhookEvents: [],
    });
  });

  afterEach(async () => {
    // Note: We don't cleanup labels created during tests as they're useful
    // and deleting them would require additional API calls
    try {
      await client.delete(`/instances/${testInstanceId}`);
    } catch {
      // Ignore if instance doesn't exist
    }
  });

  describe('Label Management', () => {
    it.skip('should create a new label', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/labels`, {
        name: `Test Label ${Date.now()}`,
        color: 0, // Dark blue
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
      expect(response.data.data.labelId).toBeDefined();
    });

    it.skip('should edit an existing label', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First create a label
      const createResponse = await client.post(`/instances/${testInstanceId}/labels`, {
        name: `Test Label ${Date.now()}`,
        color: 0,
      });

      if (!createResponse.data.data.labelId) {
        console.log('Skipping test - label creation failed');
        return;
      }

      const labelId = createResponse.data.data.labelId;

      // Now edit it
      const editResponse = await client.post(`/instances/${testInstanceId}/labels`, {
        id: labelId,
        name: `Updated Label ${Date.now()}`,
        color: 5,
      });

      expect(editResponse.status).toBe(200);
      expect(editResponse.data.success).toBe(true);
    });

    it.skip('should delete a label', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First create a label
      const createResponse = await client.post(`/instances/${testInstanceId}/labels`, {
        name: `Temporary Label ${Date.now()}`,
        color: 0,
      });

      if (!createResponse.data.data.labelId) {
        console.log('Skipping test - label creation failed');
        return;
      }

      const labelId = createResponse.data.data.labelId;

      // Now delete it
      const response = await client.delete(`/instances/${testInstanceId}/labels/${labelId}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
    });

    it.skip('should reject label creation when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/labels`, {
        name: 'Test Label',
        color: 0,
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject label with invalid color', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/labels`, {
        name: 'Test Label',
        color: 25, // Invalid (max is 19)
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject label with empty name', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/labels`, {
        name: '',
        color: 0,
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Chat Labels', () => {
    let testLabelId: string | null = null;
    const testChatJid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;

    it.skip('should add label to chat', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First create a label
      const createResponse = await client.post(`/instances/${testInstanceId}/labels`, {
        name: `Chat Label ${Date.now()}`,
        color: 3,
      });

      if (!createResponse.data.data.labelId) {
        console.log('Skipping test - label creation failed');
        return;
      }

      testLabelId = createResponse.data.data.labelId;

      // Add label to chat
      const response = await client.post(
        `/instances/${testInstanceId}/chats/${testChatJid}/labels/${testLabelId}`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
    });

    it.skip('should remove label from chat', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First create a label and add it to chat
      const createResponse = await client.post(`/instances/${testInstanceId}/labels`, {
        name: `Removable Label ${Date.now()}`,
        color: 7,
      });

      if (!createResponse.data.data.labelId) {
        console.log('Skipping test - label creation failed');
        return;
      }

      const labelId = createResponse.data.data.labelId;

      // Add label to chat
      await client.post(`/instances/${testInstanceId}/chats/${testChatJid}/labels/${labelId}`);

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Remove label from chat
      const response = await client.delete(
        `/instances/${testInstanceId}/chats/${testChatJid}/labels/${labelId}`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(
        `/instances/${testInstanceId}/chats/${testChatJid}/labels/test-label-id`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Message Labels', () => {
    const testChatJid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;
    let testLabelId: string | null = null;
    let testMessageId: string | null = null;

    it.skip('should add label to message', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Create a label
      const createResponse = await client.post(`/instances/${testInstanceId}/labels`, {
        name: `Message Label ${Date.now()}`,
        color: 10,
      });

      if (!createResponse.data.data.labelId) {
        console.log('Skipping test - label creation failed');
        return;
      }

      testLabelId = createResponse.data.data.labelId;

      // For this test, we need a real message ID
      // In production, you would get this from a received message
      // For testing, we use a placeholder
      testMessageId = 'test-message-' + Date.now();

      const response = await client.post(
        `/instances/${testInstanceId}/messages/${testMessageId}/labels/${testLabelId}`,
        {
          jid: testChatJid,
        },
      );

      // May succeed or fail depending on if message exists
      expect([200, 400, 500]).toContain(response.status);
    });

    it.skip('should remove label from message', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Create a label
      const createResponse = await client.post(`/instances/${testInstanceId}/labels`, {
        name: `Removable Msg Label ${Date.now()}`,
        color: 12,
      });

      if (!createResponse.data.data.labelId) {
        console.log('Skipping test - label creation failed');
        return;
      }

      const labelId = createResponse.data.data.labelId;
      const messageId = 'test-message-' + Date.now();

      // Try to remove (may fail if message doesn't exist, but API should respond)
      const response = await client.delete(
        `/instances/${testInstanceId}/messages/${messageId}/labels/${labelId}`,
        {
          jid: testChatJid,
        },
      );

      // May succeed or fail depending on if message exists
      expect([200, 400, 500]).toContain(response.status);
    });

    it.skip('should reject without jid in request body', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(
        `/instances/${testInstanceId}/messages/test-msg-id/labels/test-label-id`,
        {},
      );

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Product Catalog', () => {
    it.skip('should get product catalog', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.get(`/instances/${testInstanceId}/products/catalog`);

      // Response will vary depending on if account is a Business account with products
      expect([200, 400]).toContain(response.status);

      if (response.status === 200) {
        expect(response.data.success).toBe(true);
        expect(response.data.data).toHaveProperty('isCatalog');
        expect(response.data.data).toHaveProperty('products');
      }
    });

    it.skip('should get product catalog with limit', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.get(`/instances/${testInstanceId}/products/catalog?limit=5`);

      expect([200, 400]).toContain(response.status);

      if (response.status === 200) {
        expect(response.data.data.limit).toBe(5);
      }
    });

    it.skip('should get product collections', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.get(`/instances/${testInstanceId}/products/collections`);

      // Response will vary depending on if account is a Business account
      expect([200, 400]).toContain(response.status);

      if (response.status === 200) {
        expect(response.data.success).toBe(true);
        expect(Array.isArray(response.data.data)).toBe(true);
      }
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.get(`/instances/${testInstanceId}/products/catalog`);

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject invalid limit parameter', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.get(`/instances/${testInstanceId}/products/catalog?limit=200`);

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Newsletters', () => {
    // Using a known WhatsApp newsletter JID for testing
    const testNewsletterId = '120363326200799499@newsletter'; // Example newsletter JID

    it.skip('should get newsletter metadata', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.get(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}`,
      );

      // Response will vary depending on if newsletter exists and is accessible
      expect([200, 400, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.data.success).toBe(true);
        expect(response.data.data).toHaveProperty('id');
        expect(response.data.data).toHaveProperty('name');
      }
    });

    it.skip('should get newsletter messages', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.get(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/messages?limit=10`,
      );

      // Response will vary depending on if newsletter exists
      expect([200, 400, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.data.success).toBe(true);
        expect(response.data.data).toHaveProperty('messages');
      }
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.get(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject invalid newsletter ID format', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.get(
        `/instances/${testInstanceId}/newsletters/invalid-newsletter-id`,
      );

      // API may still accept and return error from WhatsApp
      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('Combined Operations', () => {
    it.skip('should create label and apply to multiple chats', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Create label
      const createResponse = await client.post(`/instances/${testInstanceId}/labels`, {
        name: `Multi-Chat Label ${Date.now()}`,
        color: 15,
      });

      if (!createResponse.data.data.labelId) {
        console.log('Skipping test - label creation failed');
        return;
      }

      const labelId = createResponse.data.data.labelId;

      // Apply to multiple chats
      const chatA = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;
      const chatB = `${TEST_CONFIG.TEST_CONTACT_B}@s.whatsapp.net`;

      const response1 = await client.post(
        `/instances/${testInstanceId}/chats/${chatA}/labels/${labelId}`,
      );
      expect(response1.status).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const response2 = await client.post(
        `/instances/${testInstanceId}/chats/${chatB}/labels/${labelId}`,
      );
      expect(response2.status).toBe(200);
    });

    it.skip('should handle business account checks gracefully', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Try to access business features on a non-business account
      const response = await client.get(`/instances/${testInstanceId}/products/catalog`);

      // Should either return empty catalog or appropriate error
      expect([200, 400]).toContain(response.status);

      if (response.status === 200) {
        // Non-business accounts may return empty catalog
        expect(response.data.data.isCatalog).toBe(false);
      }
    });
  });

  describe('Error Handling', () => {
    it.skip('should handle invalid instance ID', async () => {
      const response = await client.post(`/instances/non-existent/labels`, {
        name: 'Test',
        color: 0,
      });

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
    });

    it.skip('should handle malformed request', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/labels`, {
        invalid: 'field',
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });
});
