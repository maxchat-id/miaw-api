/**
 * Phase 2 Messaging Integration Tests
 *
 * Tests media messaging, edit, delete, reaction, forward:
 * - Send media (image, video, audio, document)
 * - Edit message
 * - Delete message
 * - React to message
 * - Forward message
 *
 * NOTE: These tests require a connected WhatsApp instance.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { startTestServer, stopTestServer, createTestClient } from './helpers/server.js';
import { WebhookTestServer } from './helpers/webhook.js';
import { TEST_CONFIG } from './fixtures/data.js';

describe('Phase 2 Messaging Tests', () => {
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

    // Create instance with webhook
    await client.post('/instances', {
      instanceId: testInstanceId,
      webhookUrl: webhookServer.getWebhookUrl(),
      webhookEvents: ['message', 'message_edit', 'message_delete', 'message_reaction'],
    });
  });

  afterEach(async () => {
    // Cleanup: Delete test instance
    try {
      await client.delete(`/instances/${testInstanceId}`);
    } catch {
      // Ignore if instance doesn't exist
    }
  });

  describe('Send Media Messages', () => {
    it.skip('should send image from URL', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/send-media`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        media: 'https://picsum.photos/300/200',
        caption: 'Test image from API',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.messageId).toBeDefined();
    });

    it.skip('should send image with view-once flag', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/send-media`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        media: 'https://picsum.photos/300/200',
        viewOnce: true,
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/send-media`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        media: 'https://example.com/image.jpg',
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it.skip('should reject invalid media URL', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/send-media`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        media: 'not-a-valid-url',
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Edit Message', () => {
    it.skip('should edit own text message', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First send a message
      const sendResponse = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'Original message',
      });

      const messageId = sendResponse.data.data.messageId;

      // Edit the message
      const editResponse = await client.patch(`/instances/${testInstanceId}/messages/edit`, {
        messageId,
        text: 'Edited message',
      });

      expect(editResponse.status).toBe(200);
      expect(editResponse.data.success).toBe(true);
      expect(editResponse.data.data.messageId).toBe(messageId);
    });

    it.skip('should reject edit when instance is not connected', async () => {
      const response = await client.patch(`/instances/${testInstanceId}/messages/edit`, {
        messageId: 'fake-message-id',
        text: 'Edited text',
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject empty text', async () => {
      const response = await client.patch(`/instances/${testInstanceId}/messages/edit`, {
        messageId: 'fake-message-id',
        text: '',
      });

      // Schema validation should catch this
      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Delete Message', () => {
    it.skip('should delete message for everyone', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First send a message
      const sendResponse = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'Message to delete',
      });

      const messageId = sendResponse.data.data.messageId;

      // Delete the message
      const deleteResponse = await client.delete(
        `/instances/${testInstanceId}/messages/${messageId}`,
      );

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.data.success).toBe(true);
      expect(deleteResponse.data.message).toContain('deleted');
    });

    it.skip('should delete message for me only', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First send a message
      const sendResponse = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'Message to delete for me',
      });

      const messageId = sendResponse.data.data.messageId;

      // Delete for me only
      const deleteResponse = await client.delete(
        `/instances/${testInstanceId}/messages/${messageId}?forMe=true`,
      );

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.data.success).toBe(true);
      expect(deleteResponse.data.message).toContain('for me');
    });

    it.skip('should reject delete when instance is not connected', async () => {
      const response = await client.delete(`/instances/${testInstanceId}/messages/fake-message-id`);

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });
  });

  describe('React to Message', () => {
    it.skip('should add emoji reaction to message', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First send a message
      const sendResponse = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'React to this message',
      });

      const messageId = sendResponse.data.data.messageId;

      // React with emoji
      const reactionResponse = await client.post(`/instances/${testInstanceId}/messages/reaction`, {
        messageId,
        emoji: '👍',
      });

      expect(reactionResponse.status).toBe(200);
      expect(reactionResponse.data.success).toBe(true);
      expect(reactionResponse.data.data.emoji).toBe('👍');
    });

    it.skip('should remove reaction with empty emoji', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First send and react
      const sendResponse = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'Remove reaction from this',
      });

      const messageId = sendResponse.data.data.messageId;

      await client.post(`/instances/${testInstanceId}/messages/reaction`, {
        messageId,
        emoji: '❤️',
      });

      // Remove reaction
      const reactionResponse = await client.post(`/instances/${testInstanceId}/messages/reaction`, {
        messageId,
        emoji: '',
      });

      expect(reactionResponse.status).toBe(200);
      expect(reactionResponse.data.success).toBe(true);
    });

    it.skip('should reject reaction when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/messages/reaction`, {
        messageId: 'fake-message-id',
        emoji: '👍',
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Forward Message', () => {
    it.skip('should forward message to single recipient', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First send a message
      const sendResponse = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'Forward this message',
      });

      const messageId = sendResponse.data.data.messageId;

      // Forward to another contact
      const forwardResponse = await client.post(`/instances/${testInstanceId}/messages/forward`, {
        messageId,
        to: [TEST_CONFIG.TEST_CONTACT_B],
      });

      expect(forwardResponse.status).toBe(200);
      expect(forwardResponse.data.success).toBe(true);
      expect(forwardResponse.data.data.forwarded).toHaveLength(1);
      expect(forwardResponse.data.data.forwarded[0].messageId).toBeDefined();
    });

    it.skip('should forward message to multiple recipients', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First send a message
      const sendResponse = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'Forward to multiple',
      });

      const messageId = sendResponse.data.data.messageId;

      // Forward to multiple recipients
      const forwardResponse = await client.post(`/instances/${testInstanceId}/messages/forward`, {
        messageId,
        to: [TEST_CONFIG.TEST_CONTACT_A, TEST_CONFIG.TEST_CONTACT_B],
      });

      expect(forwardResponse.status).toBe(200);
      expect(forwardResponse.data.success).toBe(true);
      expect(forwardResponse.data.data.forwarded).toHaveLength(2);
    });

    it.skip('should reject forward when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/messages/forward`, {
        messageId: 'fake-message-id',
        to: [TEST_CONFIG.TEST_CONTACT_A],
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject empty recipients array', async () => {
      const response = await client.post(`/instances/${testInstanceId}/messages/forward`, {
        messageId: 'fake-message-id',
        to: [],
      });

      // Schema validation should catch this
      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject more than 50 recipients', async () => {
      const tooManyRecipients = Array.from({ length: 51 }, (_, i) => `62812345678${i}`);

      const response = await client.post(`/instances/${testInstanceId}/messages/forward`, {
        messageId: 'fake-message-id',
        to: tooManyRecipients,
      });

      // Schema validation should catch this
      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Webhook Events', () => {
    it.skip('should receive message_edit webhook event', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      webhookServer.clearEvents();

      // Send and edit message
      const sendResponse = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'Edit me',
      });

      await client.patch(`/instances/${testInstanceId}/messages/edit`, {
        messageId: sendResponse.data.data.messageId,
        text: 'Edited',
      });

      // Wait for webhook event
      const editEvent = await webhookServer.waitForEvent('message_edit', 10000);

      expect(editEvent).not.toBeNull();
      expect(editEvent?.event).toBe('message_edit');
    });

    it.skip('should receive message_delete webhook event', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      webhookServer.clearEvents();

      // Send and delete message
      const sendResponse = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'Delete me',
      });

      await client.delete(
        `/instances/${testInstanceId}/messages/${sendResponse.data.data.messageId}`,
      );

      // Wait for webhook event
      const deleteEvent = await webhookServer.waitForEvent('message_delete', 10000);

      expect(deleteEvent).not.toBeNull();
      expect(deleteEvent?.event).toBe('message_delete');
    });

    it.skip('should receive message_reaction webhook event', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      webhookServer.clearEvents();

      // Send and react to message
      const sendResponse = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'React to me',
      });

      await client.post(`/instances/${testInstanceId}/messages/reaction`, {
        messageId: sendResponse.data.data.messageId,
        emoji: '👍',
      });

      // Wait for webhook event
      const reactionEvent = await webhookServer.waitForEvent('message_reaction', 10000);

      expect(reactionEvent).not.toBeNull();
      expect(reactionEvent?.event).toBe('message_reaction');
    });
  });

  describe('Download Media', () => {
    it.skip('should download media from image message', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Send an image first
      const sendResponse = await client.post(`/instances/${testInstanceId}/send-media`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        media: 'https://picsum.photos/100/100',
        caption: 'Test download',
      });

      expect(sendResponse.status).toBe(200);
      const messageId = sendResponse.data.data.messageId;

      // Wait a bit for message to be stored
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Download the media
      const downloadResponse = await client.get(
        `/instances/${testInstanceId}/messages/${messageId}/media`,
        { responseType: 'arraybuffer' },
      );

      // Should get binary data back
      expect(downloadResponse.status).toBe(200);
      expect(downloadResponse.headers['content-type']).toBeDefined();
    });

    it.skip('should return 404 for non-existent message', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.get(
        `/instances/${testInstanceId}/messages/non-existent-message-id/media`,
      );

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('NOT_FOUND');
    });

    it.skip('should return 400 for text message (not media)', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Send a text message
      const sendResponse = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'This is not a media message',
      });

      const messageId = sendResponse.data.data.messageId;

      // Wait for message to be stored
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Try to download media from text message
      const response = await client.get(`/instances/${testInstanceId}/messages/${messageId}/media`);

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
      expect(response.data.error.message).toContain('not a media message');
    });

    it.skip('should reject download when instance is not connected', async () => {
      const response = await client.get(
        `/instances/${testInstanceId}/messages/fake-message-id/media`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it.skip('should accept optional chatJid query parameter for faster lookup', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Send an image
      const sendResponse = await client.post(`/instances/${testInstanceId}/send-media`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        media: 'https://picsum.photos/100/100',
      });

      const messageId = sendResponse.data.data.messageId;
      const chatJid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;

      // Wait for message to be stored
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Download with chatJid hint
      const downloadResponse = await client.get(
        `/instances/${testInstanceId}/messages/${messageId}/media?chatJid=${encodeURIComponent(chatJid)}`,
        { responseType: 'arraybuffer' },
      );

      expect(downloadResponse.status).toBe(200);
    });
  });
});
