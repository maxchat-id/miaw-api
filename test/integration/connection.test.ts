/**
 * Connection Integration Tests
 *
 * Tests instance connection lifecycle:
 * - Connect to WhatsApp
 * - Disconnect from WhatsApp
 * - Restart connection
 * - Get connection status
 *
 * NOTE: These tests require a real WhatsApp connection.
 * Run setup.test.ts first to pair via QR code.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { startTestServer, stopTestServer, createTestClient } from './helpers/server.js';
import { HttpClient } from './helpers/http.js';
import { WebhookTestServer } from './helpers/webhook.js';

describe('Connection Tests', () => {
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
    testInstanceId = `test-${Date.now()}`;
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

  describe('POST /instances/:id/connect - Connect', () => {
    it('should initiate connection and return connecting status', async () => {
      const response = await client.post(`/instances/${testInstanceId}/connect`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.status).toBe('connecting');
    });

    it('should return 404 for non-existent instance', async () => {
      const response = await client.post('/instances/non-existent/connect');

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('NOT_FOUND');
    });

    it.skip('should receive QR webhook event when connection requires QR', async () => {
      // This test requires manual QR scanning
      const response = await client.post(`/instances/${testInstanceId}/connect`);

      // Wait for QR event
      const qrEvent = await webhookServer.waitForEvent('qr', 30000);

      expect(qrEvent).not.toBeNull();
      expect(qrEvent?.event).toBe('qr');
      expect(qrEvent?.instanceId).toBe(testInstanceId);
      expect(qrEvent?.data.qr).toBeDefined();
    });

    it.skip('should receive ready webhook event after successful connection', async () => {
      // This test requires manual QR scanning and waiting for connection
      await client.post(`/instances/${testInstanceId}/connect`);

      // Wait for ready event (may take up to 2 minutes with QR scan)
      const readyEvent = await webhookServer.waitForEvent('ready', 120000);

      expect(readyEvent).not.toBeNull();
      expect(readyEvent?.event).toBe('ready');
      expect(readyEvent?.instanceId).toBe(testInstanceId);
    });
  });

  describe('DELETE /instances/:id/disconnect - Disconnect', () => {
    it('should disconnect connected instance', async () => {
      // Note: This test requires a connected instance
      // Skip if not connected
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping disconnect test - instance not connected');
        return;
      }

      const response = await client.delete(`/instances/${testInstanceId}/disconnect`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.message).toBe('Instance disconnected successfully');

      // Verify status changed
      const statusAfter = await client.get(`/instances/${testInstanceId}/status`);
      expect(statusAfter.data.data.status).toBe('disconnected');
    });

    it('should return 200 for already disconnected instance (idempotent)', async () => {
      const response = await client.delete(`/instances/${testInstanceId}/disconnect`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should return 404 for non-existent instance', async () => {
      const response = await client.delete('/instances/non-existent/disconnect');

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /instances/:id/restart - Restart', () => {
    it('should restart disconnected instance', async () => {
      const response = await client.post(`/instances/${testInstanceId}/restart`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.message).toBe('Instance restarted successfully');
    });

    it('should return 404 for non-existent instance', async () => {
      const response = await client.post('/instances/non-existent/restart');

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /instances/:id/status - Get Status', () => {
    it('should return disconnected status for new instance', async () => {
      const response = await client.get(`/instances/${testInstanceId}/status`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.instanceId).toBe(testInstanceId);
      expect(response.data.data.status).toBe('disconnected');
      // Neither field is declared nullable in the response schema, so an
      // unconnected instance omits them rather than sending null.
      expect(response.data.data.phoneNumber).toBeUndefined();
      expect(response.data.data.connectedAt).toBeUndefined();
    });

    it('should return status with metadata for connected instance', async () => {
      // This test requires a connected instance
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping connected status test - instance not connected');
        return;
      }

      expect(statusResponse.data.data.status).toBe('connected');
      expect(statusResponse.data.data.phoneNumber).toBeDefined();
      expect(statusResponse.data.data.connectedAt).toBeDefined();
    });

    it('should return 404 for non-existent instance', async () => {
      const response = await client.get('/instances/non-existent/status');

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Connection Webhook Events', () => {
    it.skip('should fire connection webhook event on status change', async () => {
      await client.post(`/instances/${testInstanceId}/connect`);

      const connectionEvent = await webhookServer.waitForEvent('connection', 10000);

      expect(connectionEvent).not.toBeNull();
      expect(connectionEvent?.event).toBe('connection');
      expect(connectionEvent?.data.state).toBeDefined();
    });

    it.skip('should fire disconnected webhook event on disconnect', async () => {
      // First connect (requires QR scan)
      await client.post(`/instances/${testInstanceId}/connect`);
      await webhookServer.waitForEvent('ready', 120000);

      // Then disconnect
      webhookServer.clearEvents();
      await client.delete(`/instances/${testInstanceId}/disconnect`);

      const disconnectedEvent = await webhookServer.waitForEvent('disconnected', 5000);

      expect(disconnectedEvent).not.toBeNull();
      expect(disconnectedEvent?.event).toBe('disconnected');
    });
  });
});
