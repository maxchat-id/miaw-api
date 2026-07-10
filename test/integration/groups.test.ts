/**
 * Phase 4 Group Management Integration Tests
 *
 * Tests group operations:
 * - Create group
 * - Get group info
 * - Add/remove participants
 * - Promote/demote admin
 * - Update group (name, description, picture)
 * - Invite link management
 * - Leave group
 *
 * NOTE: These tests require a connected WhatsApp instance.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { startTestServer, stopTestServer, createTestClient } from './helpers/server.js';
import { WebhookTestServer } from './helpers/webhook.js';
import { TEST_CONFIG } from './fixtures/data.js';

describe('Phase 4 Group Management Tests', () => {
  let client: any;
  let webhookServer: WebhookTestServer;
  let testInstanceId: string;
  let testGroupJid: string | null = null;

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
    // Cleanup: Leave test group and delete instance
    if (testGroupJid) {
      try {
        await client.delete(
          `/instances/${testInstanceId}/groups/${encodeURIComponent(testGroupJid)}`,
        );
      } catch {
        // Ignore if already left or group doesn't exist
      }
      testGroupJid = null;
    }

    try {
      await client.delete(`/instances/${testInstanceId}`);
    } catch {
      // Ignore if instance doesn't exist
    }
  });

  describe('Create Group', () => {
    it.skip('should create a new group with participants', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/groups`, {
        name: `Test Group ${Date.now()}`,
        participants: [TEST_CONFIG.TEST_CONTACT_A],
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
      expect(response.data.data.groupJid).toBeDefined();
      expect(response.data.data.groupJid).toContain('@g.us');

      // Save for cleanup
      testGroupJid = response.data.data.groupJid;
    });

    it.skip('should reject group creation with empty name', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/groups`, {
        name: '',
        participants: [TEST_CONFIG.TEST_CONTACT_A],
      });

      // Schema validation should catch this
      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject group creation without participants', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/groups`, {
        name: `Test Group ${Date.now()}`,
        participants: [],
      });

      // Schema validation should catch this
      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/groups`, {
        name: `Test Group ${Date.now()}`,
        participants: [TEST_CONFIG.TEST_CONTACT_A],
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('Get Group Info', () => {
    it.skip('should return group metadata', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First create a group
      const createResponse = await client.post(`/instances/${testInstanceId}/groups`, {
        name: `Test Group ${Date.now()}`,
        participants: [TEST_CONFIG.TEST_CONTACT_A],
      });

      if (!createResponse.data.data.success) {
        console.log('Skipping test - failed to create group');
        return;
      }

      testGroupJid = createResponse.data.data.groupJid;

      const response = await client.get(
        `/instances/${testInstanceId}/groups/${encodeURIComponent(testGroupJid)}`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.id).toBe(testGroupJid);
      expect(response.data.data.name).toBeDefined();
      expect(response.data.data.participants).toBeDefined();
      expect(Array.isArray(response.data.data.participants)).toBe(true);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.get(`/instances/${testInstanceId}/groups/123456789@g.us`);

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should return error for invalid group JID', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.get(`/instances/${testInstanceId}/groups/invalid-group-jid`);

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Update Group', () => {
    it.skip('should update group name', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Create a group first
      const createResponse = await client.post(`/instances/${testInstanceId}/groups`, {
        name: `Test Group ${Date.now()}`,
        participants: [TEST_CONFIG.TEST_CONTACT_A],
      });

      if (!createResponse.data.data.success) {
        console.log('Skipping test - failed to create group');
        return;
      }

      testGroupJid = createResponse.data.data.groupJid;

      const response = await client.patch(
        `/instances/${testInstanceId}/groups/${encodeURIComponent(testGroupJid)}`,
        {
          name: `Updated Group ${Date.now()}`,
        },
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
    });

    it.skip('should update group description', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Use existing test group
      const groupJid = TEST_CONFIG.TEST_GROUP_JID || '123456789@g.us';

      const response = await client.patch(
        `/instances/${testInstanceId}/groups/${encodeURIComponent(groupJid)}`,
        {
          description: 'Test group description',
        },
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it.skip('should update both name and description', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Create a group first
      const createResponse = await client.post(`/instances/${testInstanceId}/groups`, {
        name: `Test Group ${Date.now()}`,
        participants: [TEST_CONFIG.TEST_CONTACT_A],
      });

      if (!createResponse.data.data.success) {
        console.log('Skipping test - failed to create group');
        return;
      }

      testGroupJid = createResponse.data.data.groupJid;

      const response = await client.patch(
        `/instances/${testInstanceId}/groups/${encodeURIComponent(testGroupJid)}`,
        {
          name: `Updated ${Date.now()}`,
          description: 'Updated description',
        },
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.patch(`/instances/${testInstanceId}/groups/123456789@g.us`, {
        name: 'New Name',
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Participant Management', () => {
    it.skip('should add participants to group', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Use existing test group
      const groupJid = TEST_CONFIG.TEST_GROUP_JID || '123456789@g.us';

      const response = await client.post(
        `/instances/${testInstanceId}/groups/${encodeURIComponent(groupJid)}/participants`,
        {
          participants: [TEST_CONFIG.TEST_CONTACT_B],
        },
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeDefined();
      expect(Array.isArray(response.data.data)).toBe(true);
    });

    it.skip('should remove participants from group', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Create a group first with participant
      const createResponse = await client.post(`/instances/${testInstanceId}/groups`, {
        name: `Test Group ${Date.now()}`,
        participants: [TEST_CONFIG.TEST_CONTACT_A, TEST_CONFIG.TEST_CONTACT_B],
      });

      if (!createResponse.data.data.success) {
        console.log('Skipping test - failed to create group');
        return;
      }

      testGroupJid = createResponse.data.data.groupJid;

      const response = await client.delete(
        `/instances/${testInstanceId}/groups/${encodeURIComponent(testGroupJid)}/participants`,
        {
          participants: [TEST_CONFIG.TEST_CONTACT_B],
        },
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeDefined();
      expect(Array.isArray(response.data.data)).toBe(true);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(
        `/instances/${testInstanceId}/groups/123456789@g.us/participants`,
        {
          participants: [TEST_CONFIG.TEST_CONTACT_A],
        },
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject empty participants array', async () => {
      const response = await client.post(
        `/instances/${testInstanceId}/groups/123456789@g.us/participants`,
        {
          participants: [],
        },
      );

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Admin Management', () => {
    it.skip('should promote participant to admin', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Use existing test group where bot is admin
      const groupJid = TEST_CONFIG.TEST_GROUP_JID || '123456789@g.us';

      const response = await client.post(
        `/instances/${testInstanceId}/groups/${encodeURIComponent(groupJid)}/admins`,
        {
          participants: [TEST_CONFIG.TEST_CONTACT_A],
        },
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeDefined();
      expect(Array.isArray(response.data.data)).toBe(true);
    });

    it.skip('should demote admin to participant', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Use existing test group where bot is admin
      const groupJid = TEST_CONFIG.TEST_GROUP_JID || '123456789@g.us';

      const response = await client.delete(
        `/instances/${testInstanceId}/groups/${encodeURIComponent(groupJid)}/admins`,
        {
          participants: [TEST_CONFIG.TEST_CONTACT_A],
        },
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeDefined();
      expect(Array.isArray(response.data.data)).toBe(true);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(
        `/instances/${testInstanceId}/groups/123456789@g.us/admins`,
        {
          participants: [TEST_CONFIG.TEST_CONTACT_A],
        },
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Group Picture', () => {
    it.skip('should update group picture from URL', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Create a group first
      const createResponse = await client.post(`/instances/${testInstanceId}/groups`, {
        name: `Test Group ${Date.now()}`,
        participants: [TEST_CONFIG.TEST_CONTACT_A],
      });

      if (!createResponse.data.data.success) {
        console.log('Skipping test - failed to create group');
        return;
      }

      testGroupJid = createResponse.data.data.groupJid;

      const response = await client.post(
        `/instances/${testInstanceId}/groups/${encodeURIComponent(testGroupJid)}/picture`,
        {
          url: 'https://picsum.photos/500',
        },
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
    });

    it.skip('should reject invalid URL', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(
        `/instances/${testInstanceId}/groups/123456789@g.us/picture`,
        {
          url: 'not-a-valid-url',
        },
      );

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(
        `/instances/${testInstanceId}/groups/123456789@g.us/picture`,
        {
          url: 'https://example.com/image.jpg',
        },
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Invite Link Management', () => {
    it.skip('should get group invite link', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Use existing test group
      const groupJid = TEST_CONFIG.TEST_GROUP_JID || '123456789@g.us';

      const response = await client.get(
        `/instances/${testInstanceId}/groups/${encodeURIComponent(groupJid)}/invite`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.url).toBeDefined();
      expect(typeof response.data.data.url).toBe('string');
    });

    it.skip('should revoke and generate new invite link', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Create a group first
      const createResponse = await client.post(`/instances/${testInstanceId}/groups`, {
        name: `Test Group ${Date.now()}`,
        participants: [TEST_CONFIG.TEST_CONTACT_A],
      });

      if (!createResponse.data.data.success) {
        console.log('Skipping test - failed to create group');
        return;
      }

      testGroupJid = createResponse.data.data.groupJid;

      const response = await client.post(
        `/instances/${testInstanceId}/groups/${encodeURIComponent(testGroupJid)}/revoke-invite`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.url).toBeDefined();
      expect(typeof response.data.data.url).toBe('string');
    });

    it.skip('should join group via invite code', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // This requires a valid invite code from another group
      const inviteCode = TEST_CONFIG.TEST_GROUP_INVITE || 'ABC123';

      const response = await client.post(`/instances/${testInstanceId}/groups/join/${inviteCode}`);

      // May fail if invite code is invalid, but endpoint should work
      expect([200, 400, 503]).toContain(response.status);
      expect(response.data.success).toBeDefined();
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.get(
        `/instances/${testInstanceId}/groups/123456789@g.us/invite`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Leave Group', () => {
    it.skip('should leave a group', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Create a group first
      const createResponse = await client.post(`/instances/${testInstanceId}/groups`, {
        name: `Test Group ${Date.now()}`,
        participants: [TEST_CONFIG.TEST_CONTACT_A],
      });

      if (!createResponse.data.data.success) {
        console.log('Skipping test - failed to create group');
        return;
      }

      testGroupJid = createResponse.data.data.groupJid;

      const response = await client.delete(
        `/instances/${testInstanceId}/groups/${encodeURIComponent(testGroupJid)}`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);

      // Group left, clear for cleanup
      testGroupJid = null;
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.delete(`/instances/${testInstanceId}/groups/123456789@g.us`);

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it.skip('should handle invalid group JID format', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.get(`/instances/${testInstanceId}/groups/invalid-jid-format`);

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should handle non-existent group', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.get(`/instances/${testInstanceId}/groups/999999999@g.us`);

      // Should return error or not found
      expect([400, 404, 500]).toContain(response.status);
    });
  });
});
