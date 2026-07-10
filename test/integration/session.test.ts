/**
 * Session & Lifecycle Integration Tests (Phase 14)
 *
 * Tests session lifecycle and stats endpoints:
 * - POST /instances/:id/logout - Logout and clear session
 * - POST /instances/:id/dispose - Dispose and cleanup resources
 * - DELETE /instances/:id/session - Clear session files
 * - GET /instances/:id/stats/messages - Get message counts
 * - GET /instances/:id/stats/labels - Get labels store info
 *
 * NOTE: Some tests require a connected WhatsApp instance.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { startTestServer, stopTestServer, createTestClient } from './helpers/server.js';
import { HttpClient } from './helpers/http.js';
import { WebhookTestServer } from './helpers/webhook.js';

describe('Session Lifecycle Tests', () => {
  let client: HttpClient;
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
    testInstanceId = `test-session-${Date.now()}`;
    webhookServer.clearEvents();

    // Create instance with webhook
    await client.post('/instances', {
      instanceId: testInstanceId,
      webhookUrl: webhookServer.getWebhookUrl(),
      webhookEvents: ['qr', 'ready', 'connection', 'disconnected'],
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

  describe('POST /instances/:id/logout - Logout', () => {
    it('should return 404 for non-existent instance', async () => {
      const response = await client.post('/instances/non-existent/logout');

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('NOT_FOUND');
    });

    it('should handle logout for disconnected instance', async () => {
      // Logout should work even for disconnected instance
      const response = await client.post(`/instances/${testInstanceId}/logout`);

      // May return 200 (graceful) or 503 (if logout requires connection)
      // Accept both as valid behaviors
      expect([200, 503]).toContain(response.status);
    });

    it.skip('should logout connected instance and clear session', async () => {
      // This test requires a connected instance
      // First verify connected
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);
      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/logout`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.message).toContain('Logged out');

      // Verify status changed to disconnected
      const statusAfter = await client.get(`/instances/${testInstanceId}/status`);
      expect(statusAfter.data.data.status).toBe('disconnected');
    });
  });

  describe('POST /instances/:id/dispose - Dispose', () => {
    it('should return 404 for non-existent instance', async () => {
      const response = await client.post('/instances/non-existent/dispose');

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('NOT_FOUND');
    });

    it('should dispose disconnected instance', async () => {
      const response = await client.post(`/instances/${testInstanceId}/dispose`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.message).toContain('disposed');
    });

    it.skip('should dispose connected instance and cleanup resources', async () => {
      // This test requires a connected instance
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);
      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/dispose`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.message).toContain('disposed');

      // Verify status changed to disconnected
      const statusAfter = await client.get(`/instances/${testInstanceId}/status`);
      expect(statusAfter.data.data.status).toBe('disconnected');
    });
  });

  describe('DELETE /instances/:id/session - Clear Session', () => {
    it('should return 404 for non-existent instance', async () => {
      const response = await client.delete('/instances/non-existent/session');

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('NOT_FOUND');
    });

    it('should clear session for instance', async () => {
      const response = await client.delete(`/instances/${testInstanceId}/session`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeDefined();
      expect(typeof response.data.data.cleared).toBe('boolean');
    });

    it('should handle clearing already empty session', async () => {
      // Clear twice should be idempotent
      await client.delete(`/instances/${testInstanceId}/session`);
      const response = await client.delete(`/instances/${testInstanceId}/session`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });
  });

  describe('GET /instances/:id/stats/messages - Message Counts', () => {
    it('should return 404 for non-existent instance', async () => {
      const response = await client.get('/instances/non-existent/stats/messages');

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('NOT_FOUND');
    });

    it('should return empty counts for new instance', async () => {
      const response = await client.get(`/instances/${testInstanceId}/stats/messages`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeDefined();
      expect(response.data.data.counts).toBeDefined();
      expect(typeof response.data.data.totalChats).toBe('number');
      expect(typeof response.data.data.totalMessages).toBe('number');
      expect(response.data.data.totalChats).toBe(0);
      expect(response.data.data.totalMessages).toBe(0);
    });

    it.skip('should return message counts for connected instance', async () => {
      // This test requires a connected instance with messages
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);
      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping - instance not connected');
        return;
      }

      const response = await client.get(`/instances/${testInstanceId}/stats/messages`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.counts).toBeDefined();
      expect(typeof response.data.data.totalChats).toBe('number');
      expect(typeof response.data.data.totalMessages).toBe('number');
      // Connected instance may have message history
      expect(response.data.data.totalChats).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /instances/:id/stats/labels - Labels Store Info', () => {
    it('should return 404 for non-existent instance', async () => {
      const response = await client.get('/instances/non-existent/stats/labels');

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('NOT_FOUND');
    });

    it('should return labels store info for new instance', async () => {
      const response = await client.get(`/instances/${testInstanceId}/stats/labels`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeDefined();
      expect(typeof response.data.data.size).toBe('number');
      expect(typeof response.data.data.eventCount).toBe('number');
      // lastSyncTime can be null or a date string
      expect(
        response.data.data.lastSyncTime === null ||
          typeof response.data.data.lastSyncTime === 'string',
      ).toBe(true);
    });

    it('should return zero counts for disconnected instance', async () => {
      const response = await client.get(`/instances/${testInstanceId}/stats/labels`);

      expect(response.status).toBe(200);
      expect(response.data.data.size).toBe(0);
      expect(response.data.data.eventCount).toBe(0);
    });

    it.skip('should return labels info for connected business account', async () => {
      // This test requires a connected WhatsApp Business instance
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);
      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping - instance not connected');
        return;
      }

      const response = await client.get(`/instances/${testInstanceId}/stats/labels`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.size).toBeGreaterThanOrEqual(0);
      // Business accounts have default labels
    });
  });

  describe('Authentication', () => {
    it('should reject logout request without API key', async () => {
      const noAuthClient = client.withoutAuth();
      const response = await noAuthClient.post(`/instances/${testInstanceId}/logout`);

      expect(response.status).toBe(401);
    });

    it('should reject dispose request without API key', async () => {
      const noAuthClient = client.withoutAuth();
      const response = await noAuthClient.post(`/instances/${testInstanceId}/dispose`);

      expect(response.status).toBe(401);
    });

    it('should reject clear session request without API key', async () => {
      const noAuthClient = client.withoutAuth();
      const response = await noAuthClient.delete(`/instances/${testInstanceId}/session`);

      expect(response.status).toBe(401);
    });

    it('should reject stats/messages request without API key', async () => {
      const noAuthClient = client.withoutAuth();
      const response = await noAuthClient.get(`/instances/${testInstanceId}/stats/messages`);

      expect(response.status).toBe(401);
    });

    it('should reject stats/labels request without API key', async () => {
      const noAuthClient = client.withoutAuth();
      const response = await noAuthClient.get(`/instances/${testInstanceId}/stats/labels`);

      expect(response.status).toBe(401);
    });
  });
});
