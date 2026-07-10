/**
 * Phase 5 Profile Management Integration Tests
 *
 * Tests profile operations:
 * - Update profile picture
 * - Remove profile picture
 * - Update profile name
 * - Update profile status
 *
 * NOTE: These tests require a connected WhatsApp instance.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { startTestServer, stopTestServer, createTestClient } from './helpers/server.js';
import { WebhookTestServer } from './helpers/webhook.js';
import { TEST_CONFIG } from './fixtures/data.js';

describe('Phase 5 Profile Management Tests', () => {
  let client: any;
  let webhookServer: WebhookTestServer;
  let testInstanceId: string;

  // Store original profile values for restoration
  let originalName: string | null = null;
  let originalStatus: string | null = null;
  let originalPicture: boolean | null = null;

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
    // Cleanup: Restore original profile if changed, then delete instance
    if (originalName !== null) {
      try {
        await client.patch(`/instances/${testInstanceId}/profile/name`, {
          name: originalName,
        });
      } catch {
        // Ignore restore failure
      }
    }

    if (originalStatus !== null) {
      try {
        await client.patch(`/instances/${testInstanceId}/profile/status`, {
          status: originalStatus,
        });
      } catch {
        // Ignore restore failure
      }
    }

    if (originalPicture === true) {
      try {
        // Try to restore picture if we removed it
        await client.post(`/instances/${testInstanceId}/profile/picture`, {
          url: 'https://picsum.photos/500',
        });
      } catch {
        // Ignore restore failure
      }
    }

    // Reset for next test
    originalName = null;
    originalStatus = null;
    originalPicture = null;

    try {
      await client.delete(`/instances/${testInstanceId}`);
    } catch {
      // Ignore if instance doesn't exist
    }
  });

  describe('Update Profile Picture', () => {
    it.skip('should update profile picture from URL', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/profile/picture`, {
        url: 'https://picsum.photos/500',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
    });

    it.skip('should reject invalid URL format', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/profile/picture`, {
        url: 'not-a-valid-url',
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/profile/picture`, {
        url: 'https://example.com/image.jpg',
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject missing URL in request body', async () => {
      const response = await client.post(`/instances/${testInstanceId}/profile/picture`, {});

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Remove Profile Picture', () => {
    it.skip('should remove profile picture', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First set a picture so we can remove it
      try {
        await client.post(`/instances/${testInstanceId}/profile/picture`, {
          url: 'https://picsum.photos/500',
        });
      } catch {
        // Ignore if setting fails
      }

      // Mark that we had a picture for restoration
      originalPicture = true;

      const response = await client.delete(`/instances/${testInstanceId}/profile/picture`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.delete(`/instances/${testInstanceId}/profile/picture`);

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Update Profile Name', () => {
    it.skip('should update profile name', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Store original name for restoration
      try {
        const currentProfile = await client.get(
          `/instances/${testInstanceId}/contacts/self@s.whatsapp.net`,
        );
        if (currentProfile.data.data?.name) {
          originalName = currentProfile.data.data.name;
        }
      } catch {
        // Ignore if getting current profile fails
      }

      const newName = `Test Bot ${Date.now()}`;
      const response = await client.patch(`/instances/${testInstanceId}/profile/name`, {
        name: newName,
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
    });

    it.skip('should reject empty name', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.patch(`/instances/${testInstanceId}/profile/name`, {
        name: '',
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject name exceeding max length', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.patch(`/instances/${testInstanceId}/profile/name`, {
        name: 'A'.repeat(26), // Max is 25
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.patch(`/instances/${testInstanceId}/profile/name`, {
        name: 'Test Name',
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject missing name in request body', async () => {
      const response = await client.patch(`/instances/${testInstanceId}/profile/name`, {});

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Update Profile Status', () => {
    it.skip('should update profile status (About)', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Store original status for restoration
      try {
        const currentProfile = await client.get(
          `/instances/${testInstanceId}/contacts/self@s.whatsapp.net`,
        );
        if (currentProfile.data.data?.status) {
          originalStatus = currentProfile.data.data.status;
        }
      } catch {
        // Ignore if getting current profile fails
      }

      const newStatus = `Testing Miaw API ${Date.now()}`;
      const response = await client.patch(`/instances/${testInstanceId}/profile/status`, {
        status: newStatus,
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
    });

    it.skip('should accept empty status', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Store original status
      try {
        const currentProfile = await client.get(
          `/instances/${testInstanceId}/contacts/self@s.whatsapp.net`,
        );
        if (currentProfile.data.data?.status) {
          originalStatus = currentProfile.data.data.status;
        }
      } catch {
        // Ignore if getting current profile fails
      }

      const response = await client.patch(`/instances/${testInstanceId}/profile/status`, {
        status: '',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it.skip('should reject status exceeding max length', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.patch(`/instances/${testInstanceId}/profile/status`, {
        status: 'A'.repeat(140), // Max is 139
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.patch(`/instances/${testInstanceId}/profile/status`, {
        status: 'Available',
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it.skip('should reject missing status in request body', async () => {
      const response = await client.patch(`/instances/${testInstanceId}/profile/status`, {});

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Combined Profile Updates', () => {
    it.skip('should update name and status in sequence', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Store original values
      try {
        const currentProfile = await client.get(
          `/instances/${testInstanceId}/contacts/self@s.whatsapp.net`,
        );
        if (currentProfile.data.data?.name) {
          originalName = currentProfile.data.data.name;
        }
        if (currentProfile.data.data?.status) {
          originalStatus = currentProfile.data.data.status;
        }
      } catch {
        // Ignore if getting current profile fails
      }

      const newName = `Sequential Test ${Date.now()}`;
      const nameResponse = await client.patch(`/instances/${testInstanceId}/profile/name`, {
        name: newName,
      });

      expect(nameResponse.status).toBe(200);
      expect(nameResponse.data.success).toBe(true);

      const newStatus = `Running automated tests ${Date.now()}`;
      const statusResponse2 = await client.patch(`/instances/${testInstanceId}/profile/status`, {
        status: newStatus,
      });

      expect(statusResponse2.status).toBe(200);
      expect(statusResponse2.data.success).toBe(true);
    });

    it.skip('should handle rapid profile updates', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Store original status
      try {
        const currentProfile = await client.get(
          `/instances/${testInstanceId}/contacts/self@s.whatsapp.net`,
        );
        if (currentProfile.data.data?.status) {
          originalStatus = currentProfile.data.data.status;
        }
      } catch {
        // Ignore if getting current profile fails
      }

      // Rapid updates
      const updates = ['Test 1', 'Test 2', 'Test 3'];
      for (const status of updates) {
        const response = await client.patch(`/instances/${testInstanceId}/profile/status`, {
          status: status,
        });

        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it.skip('should handle invalid instance ID', async () => {
      const response = await client.patch(`/instances/non-existent/profile/name`, {
        name: 'Test',
      });

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
    });

    it.skip('should handle malformed request', async () => {
      const response = await client.patch(`/instances/${testInstanceId}/profile/name`, {
        invalid: 'field',
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });
});
