/**
 * Phase 11 Advanced Messaging Integration Tests
 *
 * Tests:
 * - Remove reaction from message
 * - Delete message for self only (local deletion)
 * - Load more messages from chat history
 * - Direct media send endpoints (image, video, audio, document)
 *
 * NOTE: These tests require a connected WhatsApp instance.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { startTestServer, stopTestServer, createTestClient } from './helpers/server.js';
import { WebhookTestServer } from './helpers/webhook.js';
import { TEST_CONFIG } from './fixtures/data.js';

describe('Phase 11 Advanced Messaging Tests', () => {
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
      webhookEvents: ['message', 'message_reaction'],
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

  describe('Remove Reaction', () => {
    it.skip('should remove reaction from message', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First send a message
      const sendResponse = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'Remove reaction test',
      });

      const messageId = sendResponse.data.data.messageId;

      // Add a reaction first
      await client.post(`/instances/${testInstanceId}/messages/reaction`, {
        messageId,
        emoji: '👍',
      });

      // Wait for reaction to be processed
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Remove the reaction using the new endpoint
      const removeResponse = await client.delete(
        `/instances/${testInstanceId}/messages/${messageId}/reaction`,
      );

      expect(removeResponse.status).toBe(200);
      expect(removeResponse.data.success).toBe(true);
      expect(removeResponse.data.message).toContain('removed');
    });

    it.skip('should accept optional chatJid for faster lookup', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const sendResponse = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'Remove reaction with chatJid hint',
      });

      const messageId = sendResponse.data.data.messageId;
      const chatJid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;

      await client.post(`/instances/${testInstanceId}/messages/reaction`, {
        messageId,
        emoji: '❤️',
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const removeResponse = await client.delete(
        `/instances/${testInstanceId}/messages/${messageId}/reaction?chatJid=${encodeURIComponent(chatJid)}`,
      );

      expect(removeResponse.status).toBe(200);
      expect(removeResponse.data.success).toBe(true);
    });

    it.skip('should return 404 for non-existent message', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.delete(
        `/instances/${testInstanceId}/messages/non-existent-message-id/reaction`,
      );

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('NOT_FOUND');
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.delete(
        `/instances/${testInstanceId}/messages/fake-message-id/reaction`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('Delete Message For Me (Local Deletion)', () => {
    it.skip('should delete message locally only', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First send a message
      const sendResponse = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'Local delete test',
      });

      const messageId = sendResponse.data.data.messageId;

      // Wait for message to be stored
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Delete locally
      const deleteResponse = await client.delete(
        `/instances/${testInstanceId}/messages/${messageId}/local`,
      );

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.data.success).toBe(true);
      expect(deleteResponse.data.message).toContain('locally');
    });

    it.skip('should accept chatJid for faster lookup', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const sendResponse = await client.post(`/instances/${testInstanceId}/send-text`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        text: 'Local delete with chatJid',
      });

      const messageId = sendResponse.data.data.messageId;
      const chatJid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const deleteResponse = await client.delete(
        `/instances/${testInstanceId}/messages/${messageId}/local?chatJid=${encodeURIComponent(chatJid)}`,
      );

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.data.success).toBe(true);
    });

    it.skip('should accept deleteMedia=false to keep media files', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Send a media message
      const sendResponse = await client.post(`/instances/${testInstanceId}/send-media`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        media: 'https://picsum.photos/100/100',
      });

      const messageId = sendResponse.data.data.messageId;

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Delete locally but keep media
      const deleteResponse = await client.delete(
        `/instances/${testInstanceId}/messages/${messageId}/local?deleteMedia=false`,
      );

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.data.success).toBe(true);
    });

    it.skip('should return 404 for non-existent message', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.delete(
        `/instances/${testInstanceId}/messages/non-existent-message-id/local`,
      );

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('NOT_FOUND');
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.delete(
        `/instances/${testInstanceId}/messages/fake-message-id/local`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('Load More Messages', () => {
    it.skip('should load more messages from chat history', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const chatJid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;

      const response = await client.get(
        `/instances/${testInstanceId}/chats/${encodeURIComponent(chatJid)}/messages/load`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.messagesLoaded).toBeDefined();
      expect(typeof response.data.data.messagesLoaded).toBe('number');
      expect(response.data.data.hasMore).toBeDefined();
      expect(typeof response.data.data.hasMore).toBe('boolean');
    });

    it.skip('should accept count parameter', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const chatJid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;

      const response = await client.get(
        `/instances/${testInstanceId}/chats/${encodeURIComponent(chatJid)}/messages/load?count=10`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it.skip('should accept timeout parameter', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const chatJid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;

      const response = await client.get(
        `/instances/${testInstanceId}/chats/${encodeURIComponent(chatJid)}/messages/load?count=5&timeout=10000`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it.skip('should reject count > 50', async () => {
      const chatJid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;

      const response = await client.get(
        `/instances/${testInstanceId}/chats/${encodeURIComponent(chatJid)}/messages/load?count=100`,
      );

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject when instance is not connected', async () => {
      const chatJid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;

      const response = await client.get(
        `/instances/${testInstanceId}/chats/${encodeURIComponent(chatJid)}/messages/load`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it.skip('should return 404 for non-existent instance', async () => {
      const chatJid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;

      const response = await client.get(
        `/instances/non-existent-instance/chats/${encodeURIComponent(chatJid)}/messages/load`,
      );

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Send Image (Direct Endpoint)', () => {
    it.skip('should send image via dedicated endpoint', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/messages/image`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        image: 'https://picsum.photos/300/200',
        caption: 'Test image from direct endpoint',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.messageId).toBeDefined();
    });

    it.skip('should send image with viewOnce flag', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/messages/image`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        image: 'https://picsum.photos/300/200',
        viewOnce: true,
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/messages/image`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        image: 'https://example.com/image.jpg',
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject invalid image URL', async () => {
      const response = await client.post(`/instances/${testInstanceId}/messages/image`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        image: 'not-a-valid-url',
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Send Video (Direct Endpoint)', () => {
    it.skip('should send video via dedicated endpoint', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/messages/video`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        video: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
        caption: 'Test video',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.messageId).toBeDefined();
    });

    it.skip('should send video as GIF', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/messages/video`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        video: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
        gifPlayback: true,
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it.skip('should send video as PTV (video note)', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/messages/video`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        video: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
        ptv: true,
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/messages/video`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        video: 'https://example.com/video.mp4',
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Send Audio (Direct Endpoint)', () => {
    it.skip('should send audio via dedicated endpoint', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/messages/audio`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        audio: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.messageId).toBeDefined();
    });

    it.skip('should send audio as voice note (PTT)', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/messages/audio`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        audio: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        ptt: true,
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it.skip('should accept custom mimetype', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/messages/audio`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        audio: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        mimetype: 'audio/mpeg',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/messages/audio`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        audio: 'https://example.com/audio.mp3',
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Send Document (Direct Endpoint)', () => {
    it.skip('should send document via dedicated endpoint', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/messages/document`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        document: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        fileName: 'test-document.pdf',
        caption: 'Test PDF document',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.messageId).toBeDefined();
    });

    it.skip('should send document with custom mimetype', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/messages/document`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        document: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        fileName: 'document.pdf',
        mimetype: 'application/pdf',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/messages/document`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        document: 'https://example.com/doc.pdf',
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject invalid document URL', async () => {
      const response = await client.post(`/instances/${testInstanceId}/messages/document`, {
        to: TEST_CONFIG.TEST_CONTACT_A,
        document: 'not-a-valid-url',
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });
});
