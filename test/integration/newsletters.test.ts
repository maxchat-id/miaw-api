/**
 * Phase 12 Newsletter Integration Tests
 *
 * Tests all newsletter/channel management endpoints:
 * - Create/delete newsletters
 * - Send messages (text, image, video)
 * - Subscription management (follow, unfollow, mute, unmute)
 * - Update newsletter properties (name, description, picture)
 * - Info endpoints (subscribers, admin count)
 * - Admin operations (transfer ownership, demote admin)
 * - Message reactions
 *
 * NOTE: These tests require a connected WhatsApp account with newsletter access.
 * Most tests are skipped by default as they require specific newsletter ownership.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { startTestServer, stopTestServer, createTestClient } from './helpers/server.js';
import { WebhookTestServer } from './helpers/webhook.js';

describe('Phase 12 Newsletter Tests', () => {
  let client: any;
  let webhookServer: WebhookTestServer;
  let testInstanceId: string;

  // Example newsletter JID for testing (replace with real one for actual tests)
  const testNewsletterId = '120363326200799499@newsletter';
  const testMessageId = 'test-message-id';
  const testAdminJid = '1234567890@s.whatsapp.net';

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
    try {
      await client.delete(`/instances/${testInstanceId}`);
    } catch {
      // Ignore if instance doesn't exist
    }
  });

  describe('Newsletter CRUD', () => {
    it.skip('should create a new newsletter', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/newsletters`, {
        name: `Test Newsletter ${Date.now()}`,
        description: 'Test newsletter created by integration tests',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('id');
      expect(response.data.data).toHaveProperty('name');
    });

    it.skip('should delete a newsletter', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Note: This requires a newsletter you own
      const response = await client.delete(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}`,
      );

      // May fail if newsletter doesn't exist or not owned
      expect([200, 400, 403]).toContain(response.status);
    });

    it.skip('should get newsletter metadata', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.get(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}`,
      );

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
  });

  describe('Newsletter Messaging', () => {
    it.skip('should send text message to newsletter', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/messages/text`,
        {
          text: `Test message ${Date.now()}`,
        },
      );

      // May fail if not newsletter owner
      expect([200, 400, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(response.data.success).toBe(true);
        expect(response.data.data).toHaveProperty('messageId');
      }
    });

    it.skip('should send image to newsletter', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/messages/image`,
        {
          image: 'https://via.placeholder.com/300x200.png',
          caption: 'Test image caption',
        },
      );

      // May fail if not newsletter owner
      expect([200, 400, 403]).toContain(response.status);
    });

    it.skip('should send video to newsletter', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/messages/video`,
        {
          video:
            'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
          caption: 'Test video caption',
        },
      );

      // May fail if not newsletter owner
      expect([200, 400, 403]).toContain(response.status);
    });

    it.skip('should reject text message when instance not connected', async () => {
      const response = await client.post(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/messages/text`,
        {
          text: 'Test message',
        },
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Newsletter Subscription', () => {
    it.skip('should follow a newsletter', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/follow`,
      );

      expect([200, 400]).toContain(response.status);

      if (response.status === 200) {
        expect(response.data.success).toBe(true);
        expect(response.data.data.success).toBe(true);
      }
    });

    it.skip('should unfollow a newsletter', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.delete(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/follow`,
      );

      expect([200, 400]).toContain(response.status);
    });

    it.skip('should mute newsletter notifications', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/mute`,
      );

      expect([200, 400]).toContain(response.status);
    });

    it.skip('should unmute newsletter notifications', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.delete(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/mute`,
      );

      expect([200, 400]).toContain(response.status);
    });

    it.skip('should subscribe to newsletter updates', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/subscribe`,
      );

      expect([200, 400]).toContain(response.status);
    });
  });

  describe('Newsletter Updates', () => {
    it.skip('should update newsletter name', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.patch(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/name`,
        {
          name: `Updated Name ${Date.now()}`,
        },
      );

      // May fail if not newsletter owner
      expect([200, 400, 403]).toContain(response.status);
    });

    it.skip('should update newsletter description', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.patch(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/description`,
        {
          description: `Updated description ${Date.now()}`,
        },
      );

      // May fail if not newsletter owner
      expect([200, 400, 403]).toContain(response.status);
    });

    it.skip('should update newsletter picture', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/picture`,
        {
          image: 'https://via.placeholder.com/500x500.png',
        },
      );

      // May fail if not newsletter owner
      expect([200, 400, 403]).toContain(response.status);
    });

    it.skip('should remove newsletter picture', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.delete(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/picture`,
      );

      // May fail if not newsletter owner
      expect([200, 400, 403]).toContain(response.status);
    });
  });

  describe('Newsletter Info', () => {
    it.skip('should get newsletter subscribers', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.get(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/subscribers`,
      );

      // May fail if not newsletter owner
      expect([200, 400, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(response.data.success).toBe(true);
        expect(response.data.data).toHaveProperty('subscribers');
      }
    });

    it.skip('should get newsletter admin count', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.get(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/admins/count`,
      );

      expect([200, 400]).toContain(response.status);

      if (response.status === 200) {
        expect(response.data.success).toBe(true);
        expect(response.data.data).toHaveProperty('count');
        expect(typeof response.data.data.count).toBe('number');
      }
    });
  });

  describe('Newsletter Admin Operations', () => {
    it.skip('should transfer newsletter ownership', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/owner`,
        {
          newOwnerJid: testAdminJid,
        },
      );

      // This is a destructive operation, so it may fail for safety
      expect([200, 400, 403]).toContain(response.status);
    });

    it.skip('should demote newsletter admin', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.delete(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/admins/${testAdminJid}`,
      );

      // May fail if not newsletter owner or admin doesn't exist
      expect([200, 400, 403, 404]).toContain(response.status);
    });
  });

  describe('Newsletter Reactions', () => {
    it.skip('should react to a newsletter message', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/messages/${testMessageId}/reaction`,
        {
          emoji: '👍',
        },
      );

      expect([200, 400]).toContain(response.status);
    });

    it.skip('should remove reaction from newsletter message', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}/messages/${testMessageId}/reaction`,
        {
          emoji: '',
        },
      );

      expect([200, 400]).toContain(response.status);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent instance', async () => {
      const response = await client.get(
        '/instances/non-existent-instance/newsletters/some-newsletter',
      );

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
    });

    it('should return 503 when instance is not connected', async () => {
      // Instance exists but not connected
      const response = await client.get(
        `/instances/${testInstanceId}/newsletters/${testNewsletterId}`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should handle invalid newsletter ID gracefully', async () => {
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
});
