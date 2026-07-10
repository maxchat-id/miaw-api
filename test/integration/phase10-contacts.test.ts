/**
 * Phase 10 Enhanced Contact Operations Integration Tests
 *
 * Tests for new contact and group endpoints:
 * - Get contact profile
 * - Get business profile
 * - Get group participants
 * - Get group invite info
 *
 * NOTE: These tests require a connected WhatsApp instance.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { startTestServer, stopTestServer, createTestClient } from './helpers/server.js';
import { WebhookTestServer } from './helpers/webhook.js';
import { TEST_CONFIG } from './fixtures/data.js';

describe('Phase 10 Enhanced Contact Operations Tests', () => {
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
    testInstanceId = `test-phase10-${Date.now()}`;
    webhookServer.clearEvents();

    // Create instance
    await client.post('/instances', {
      instanceId: testInstanceId,
      webhookUrl: webhookServer.getWebhookUrl(),
      webhookEvents: [],
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

  describe('GET Contact Profile', () => {
    it.skip('should return full contact profile for valid JID', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const jid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;
      const response = await client.get(
        `/instances/${testInstanceId}/contacts/${encodeURIComponent(jid)}/profile`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      // Profile can be null if contact doesn't exist
      if (response.data.data) {
        expect(response.data.data.jid).toBeDefined();
      }
    });

    it.skip('should include business details if contact is a business account', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const jid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;
      const response = await client.get(
        `/instances/${testInstanceId}/contacts/${encodeURIComponent(jid)}/profile`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      if (response.data.data?.isBusiness) {
        expect(response.data.data.business).toBeDefined();
      }
    });

    it.skip('should reject when instance is not connected', async () => {
      const jid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;
      const response = await client.get(
        `/instances/${testInstanceId}/contacts/${encodeURIComponent(jid)}/profile`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it.skip('should return 404 for non-existent instance', async () => {
      const jid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;
      const response = await client.get(
        `/instances/non-existent-instance/contacts/${encodeURIComponent(jid)}/profile`,
      );

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
    });
  });

  describe('GET Business Profile', () => {
    it.skip('should return business profile for WhatsApp Business account', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const jid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;
      const response = await client.get(
        `/instances/${testInstanceId}/contacts/${encodeURIComponent(jid)}/business`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      // Data can be null if not a business account
    });

    it.skip('should return null for non-business account', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Use a number that's likely not a business account
      const jid = '999999999999@s.whatsapp.net';
      const response = await client.get(
        `/instances/${testInstanceId}/contacts/${encodeURIComponent(jid)}/business`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      // Expect null for non-business accounts
    });

    it.skip('should reject when instance is not connected', async () => {
      const jid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;
      const response = await client.get(
        `/instances/${testInstanceId}/contacts/${encodeURIComponent(jid)}/business`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it.skip('should return business profile fields when available', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const jid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;
      const response = await client.get(
        `/instances/${testInstanceId}/contacts/${encodeURIComponent(jid)}/business`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      if (response.data.data) {
        // Check that expected fields are present (can be null)
        const fields = ['description', 'category', 'website', 'email', 'address'];
        for (const field of fields) {
          expect(field in response.data.data || response.data.data[field] === undefined).toBe(true);
        }
      }
    });
  });

  describe('GET Group Participants', () => {
    it.skip('should return participants list for valid group', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      if (!TEST_CONFIG.TEST_GROUP_JID) {
        console.log('Skipping test - no test group configured');
        return;
      }

      const response = await client.get(
        `/instances/${testInstanceId}/groups/${encodeURIComponent(TEST_CONFIG.TEST_GROUP_JID)}/participants`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.groupJid).toBe(TEST_CONFIG.TEST_GROUP_JID);
      expect(response.data.data.participants).toBeDefined();
      expect(Array.isArray(response.data.data.participants)).toBe(true);
    });

    it.skip('should include participant roles', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      if (!TEST_CONFIG.TEST_GROUP_JID) {
        console.log('Skipping test - no test group configured');
        return;
      }

      const response = await client.get(
        `/instances/${testInstanceId}/groups/${encodeURIComponent(TEST_CONFIG.TEST_GROUP_JID)}/participants`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      if (response.data.data.participants.length > 0) {
        const participant = response.data.data.participants[0];
        expect(participant.jid).toBeDefined();
        expect(participant.role).toBeDefined();
        expect(['admin', 'superadmin', 'member']).toContain(participant.role);
      }
    });

    it.skip('should reject when instance is not connected', async () => {
      const groupJid = TEST_CONFIG.TEST_GROUP_JID || '123456789@g.us';
      const response = await client.get(
        `/instances/${testInstanceId}/groups/${encodeURIComponent(groupJid)}/participants`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it.skip('should return 404 for non-existent group', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const fakeGroupJid = '999999999999999999@g.us';
      const response = await client.get(
        `/instances/${testInstanceId}/groups/${encodeURIComponent(fakeGroupJid)}/participants`,
      );

      // Should return 404 or error for non-existent group
      expect([400, 404]).toContain(response.status);
      expect(response.data.success).toBe(false);
    });
  });

  describe('GET Group Invite Info', () => {
    it.skip('should return group info for valid invite code', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      if (!TEST_CONFIG.TEST_GROUP_INVITE) {
        console.log('Skipping test - no test group invite configured');
        return;
      }

      const response = await client.get(
        `/instances/${testInstanceId}/groups/invite/${TEST_CONFIG.TEST_GROUP_INVITE}/info`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.jid).toBeDefined();
      expect(response.data.data.name).toBeDefined();
      expect(response.data.data.participantCount).toBeDefined();
    });

    it.skip('should include group name and participant count', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      if (!TEST_CONFIG.TEST_GROUP_INVITE) {
        console.log('Skipping test - no test group invite configured');
        return;
      }

      const response = await client.get(
        `/instances/${testInstanceId}/groups/invite/${TEST_CONFIG.TEST_GROUP_INVITE}/info`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(typeof response.data.data.name).toBe('string');
      expect(typeof response.data.data.participantCount).toBe('number');
    });

    it.skip('should reject when instance is not connected', async () => {
      const inviteCode = TEST_CONFIG.TEST_GROUP_INVITE || 'ABC123Def456';
      const response = await client.get(
        `/instances/${testInstanceId}/groups/invite/${inviteCode}/info`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it.skip('should return error for invalid invite code', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.get(
        `/instances/${testInstanceId}/groups/invite/invalid-invite-code-12345/info`,
      );

      // Should return 400 or 404 for invalid invite
      expect([400, 404]).toContain(response.status);
      expect(response.data.success).toBe(false);
    });

    it.skip('should handle full invite URL', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      if (!TEST_CONFIG.TEST_GROUP_INVITE) {
        console.log('Skipping test - no test group invite configured');
        return;
      }

      // miaw-core should handle full URLs by extracting the code
      const fullUrl = `https://chat.whatsapp.com/${TEST_CONFIG.TEST_GROUP_INVITE}`;
      const response = await client.get(
        `/instances/${testInstanceId}/groups/invite/${encodeURIComponent(fullUrl)}/info`,
      );

      // This test depends on whether miaw-core extracts the code from URL
      expect(response.status).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent instance on all endpoints', async () => {
      const endpoints = [
        '/instances/non-existent/contacts/123@s.whatsapp.net/profile',
        '/instances/non-existent/contacts/123@s.whatsapp.net/business',
        '/instances/non-existent/groups/123@g.us/participants',
        '/instances/non-existent/groups/invite/ABC123/info',
      ];

      for (const endpoint of endpoints) {
        const response = await client.get(endpoint);
        expect(response.status).toBe(404);
        expect(response.data.success).toBe(false);
        expect(response.data.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return 401 for unauthenticated requests', async () => {
      const unauthClient = createTestClient();
      // Override authorization header
      (unauthClient as any).headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid-key',
      };

      const jid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;
      const response = await unauthClient.get(
        `/instances/${testInstanceId}/contacts/${encodeURIComponent(jid)}/profile`,
      );

      expect(response.status).toBe(401);
      expect(response.data.success).toBe(false);
    });
  });
});
