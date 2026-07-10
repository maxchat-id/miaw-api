/**
 * Phase 3 Contacts & Validation Integration Tests
 *
 * Tests contact operations and number validation:
 * - Check phone number
 * - Batch check numbers
 * - Get contact info
 * - Get profile picture
 *
 * NOTE: These tests require a connected WhatsApp instance.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { startTestServer, stopTestServer, createTestClient } from './helpers/server.js';
import { WebhookTestServer } from './helpers/webhook.js';
import { TEST_CONFIG } from './fixtures/data.js';

describe('Phase 3 Contacts & Validation Tests', () => {
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
    // Cleanup: Delete test instance
    try {
      await client.delete(`/instances/${testInstanceId}`);
    } catch {
      // Ignore if instance doesn't exist
    }
  });

  describe('Check Phone Number', () => {
    it.skip('should return exists=true for valid WhatsApp number', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/check-number`, {
        phone: TEST_CONFIG.TEST_CONTACT_A,
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.exists).toBeDefined();
      expect(typeof response.data.data.exists).toBe('boolean');
    });

    it.skip('should return exists=false for invalid WhatsApp number', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/check-number`, {
        phone: '999999999999', // Invalid number
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.exists).toBe(false);
    });

    it.skip('should return JID when number exists', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/check-number`, {
        phone: TEST_CONFIG.TEST_CONTACT_A,
      });

      if (response.data.data.exists) {
        expect(response.data.data.jid).toBeDefined();
        expect(response.data.data.jid).toContain('@s.whatsapp.net');
      }
    });

    it.skip('should reject check when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/check-number`, {
        phone: TEST_CONFIG.TEST_CONTACT_A,
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it.skip('should reject invalid phone format', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/check-number`, {
        phone: 'invalid-phone-with-letters',
      });

      // Schema validation should catch this
      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject phone number that is too short', async () => {
      const response = await client.post(`/instances/${testInstanceId}/check-number`, {
        phone: '12345', // Too short
      });

      // Schema validation should catch this
      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Batch Check Numbers', () => {
    it.skip('should check multiple numbers in one request', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/check-batch`, {
        phones: [
          TEST_CONFIG.TEST_CONTACT_A,
          TEST_CONFIG.TEST_CONTACT_B,
          '999999999999', // Invalid
        ],
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveLength(3);
      expect(response.data.data[0].phone).toBeDefined();
      expect(response.data.data[0].exists).toBeDefined();
    });

    it.skip('should reject empty array', async () => {
      const response = await client.post(`/instances/${testInstanceId}/check-batch`, {
        phones: [],
      });

      // Schema validation should catch this
      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject more than 50 numbers', async () => {
      const tooManyPhones = Array.from({ length: 51 }, (_, i) => `62812345678${i}`);

      const response = await client.post(`/instances/${testInstanceId}/check-batch`, {
        phones: tooManyPhones,
      });

      // Schema validation should catch this
      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/check-batch`, {
        phones: [TEST_CONFIG.TEST_CONTACT_A],
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should handle mix of valid and invalid numbers', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/check-batch`, {
        phones: [TEST_CONFIG.TEST_CONTACT_A, '999999999999', TEST_CONFIG.TEST_CONTACT_B],
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveLength(3);

      // At least one should exist (real contacts)
      const validContacts = response.data.data.filter((r: any) => r.exists);
      expect(validContacts.length).toBeGreaterThan(0);
    });
  });

  describe('Get Contact Info', () => {
    it.skip('should return contact info for valid JID', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First check number to get JID
      const checkResponse = await client.post(`/instances/${testInstanceId}/check-number`, {
        phone: TEST_CONFIG.TEST_CONTACT_A,
      });

      if (!checkResponse.data.data.exists) {
        console.log('Skipping test - no valid contact');
        return;
      }

      const jid = checkResponse.data.data.jid;
      const response = await client.get(`/instances/${testInstanceId}/contacts/${jid}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.jid).toBe(jid);
      expect(response.data.data.name).toBeDefined();
    });

    it.skip('should return contact info with phone number', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Use phone directly (should auto-convert to JID)
      const phoneJid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;
      const response = await client.get(
        `/instances/${testInstanceId}/contacts/${encodeURIComponent(phoneJid)}`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.get(
        `/instances/${testInstanceId}/contacts/6281234567890@s.whatsapp.net`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Get Profile Picture', () => {
    it.skip('should return picture URL for contact with picture', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Use test contact
      const jid = `${TEST_CONFIG.TEST_CONTACT_A}@s.whatsapp.net`;
      const response = await client.get(
        `/instances/${testInstanceId}/contacts/${encodeURIComponent(jid)}/picture`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.url).toBeDefined();
      // URL can be null if no picture set
      expect(typeof response.data.data.url).toBe('string');
    });

    it.skip('should return null URL for contact without picture', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Use a number that might not have picture
      const jid = '999999999999@s.whatsapp.net';
      const response = await client.get(
        `/instances/${testInstanceId}/contacts/${encodeURIComponent(jid)}/picture`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      // Should handle gracefully (either null or empty)
      expect(response.data.data).toBeDefined();
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.get(
        `/instances/${testInstanceId}/contacts/6281234567890@s.whatsapp.net/picture`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should handle group JID for profile picture', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Use a test group JID if available
      const groupJid = TEST_CONFIG.TEST_GROUP_JID || '123456789@g.us';
      const response = await client.get(
        `/instances/${testInstanceId}/contacts/${encodeURIComponent(groupJid)}/picture`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeDefined();
    });
  });

  describe('Number Format Handling', () => {
    it.skip('should handle phone number with various formats', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Test with different formats (API should normalize)
      const formats = [
        TEST_CONFIG.TEST_CONTACT_A,
        `62${TEST_CONFIG.TEST_CONTACT_A.substring(2)}`, // Without +
      ];

      for (const phone of formats) {
        const response = await client.post(`/instances/${testInstanceId}/check-number`, {
          phone,
        });

        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
      }
    });

    it.skip('should normalize phone number correctly', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/check-number`, {
        phone: TEST_CONFIG.TEST_CONTACT_A,
      });

      if (response.data.data.exists) {
        // JID should be in correct format
        expect(response.data.data.jid).toMatch(/@s\.whatsapp\.net$/);
      }
    });
  });

  describe('Add/Edit Contact', () => {
    it.skip('should add a new contact', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/contacts`, {
        phone: TEST_CONFIG.TEST_CONTACT_A,
        name: 'Test Contact',
        firstName: 'Test',
        lastName: 'Contact',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
      expect(response.data.data.phone).toBe(TEST_CONFIG.TEST_CONTACT_A);
      expect(response.data.data.name).toBe('Test Contact');
    });

    it.skip('should edit an existing contact', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First add
      await client.post(`/instances/${testInstanceId}/contacts`, {
        phone: TEST_CONFIG.TEST_CONTACT_A,
        name: 'Original Name',
      });

      // Then edit
      const response = await client.post(`/instances/${testInstanceId}/contacts`, {
        phone: TEST_CONFIG.TEST_CONTACT_A,
        name: 'Updated Name',
        firstName: 'Updated',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.name).toBe('Updated Name');
    });

    it.skip('should reject add contact when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/contacts`, {
        phone: TEST_CONFIG.TEST_CONTACT_A,
        name: 'Test Contact',
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it.skip('should reject invalid phone format', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/contacts`, {
        phone: 'invalid-phone',
        name: 'Test Contact',
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject missing required fields', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Missing name
      const response = await client.post(`/instances/${testInstanceId}/contacts`, {
        phone: TEST_CONFIG.TEST_CONTACT_A,
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Remove Contact', () => {
    it.skip('should remove a contact', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First add the contact
      await client.post(`/instances/${testInstanceId}/contacts`, {
        phone: TEST_CONFIG.TEST_CONTACT_A,
        name: 'Contact To Remove',
      });

      // Then remove
      const response = await client.delete(
        `/instances/${testInstanceId}/contacts/${TEST_CONFIG.TEST_CONTACT_A}`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
      expect(response.data.data.phone).toBe(TEST_CONFIG.TEST_CONTACT_A);
    });

    it.skip('should reject remove when instance is not connected', async () => {
      const response = await client.delete(
        `/instances/${testInstanceId}/contacts/${TEST_CONFIG.TEST_CONTACT_A}`,
      );

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('SERVICE_UNAVAILABLE');
    });
  });
});
