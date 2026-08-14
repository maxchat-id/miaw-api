/**
 * Instance Management Integration Tests
 *
 * Tests instance CRUD operations:
 * - Create instance
 * - List instances
 * - Get instance details
 * - Delete instance
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startTestServer, stopTestServer, createTestClient } from './helpers/server.js';
import { HttpClient } from './helpers/http.js';
import { TEST_CONFIG } from './fixtures/data.js';

describe('Instance Management Tests', () => {
  let client: HttpClient;
  let testInstanceId: string;

  beforeAll(async () => {
    await startTestServer();
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  }, 10000);

  beforeEach(() => {
    client = createTestClient();
    testInstanceId = `test-${Date.now()}`;
  });

  afterEach(async () => {
    // Cleanup: Delete test instance if it exists
    try {
      await client.delete(`/instances/${testInstanceId}`);
    } catch {
      // Ignore if instance doesn't exist
    }
  });

  describe('POST /instances - Create Instance', () => {
    it('should create instance with minimal config (instanceId only)', async () => {
      const response = await client.post('/instances', {
        instanceId: testInstanceId,
      });

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data.instanceId).toBe(testInstanceId);
      expect(response.data.data.status).toBe('disconnected');
      expect(response.data.data.webhookEnabled).toBe(false);
      expect(response.data.data.createdAt).toBeDefined();
    });

    it('should create instance with webhook configuration', async () => {
      const response = await client.post('/instances', {
        instanceId: testInstanceId,
        webhookUrl: 'http://example.com/webhook',
        webhookEvents: ['message', 'qr', 'ready'],
      });

      expect(response.status).toBe(201);
      expect(response.data.data.webhookUrl).toBe('http://example.com/webhook');
      expect(response.data.data.webhookEvents).toEqual(['message', 'qr', 'ready']);
      expect(response.data.data.webhookEnabled).toBe(true);
    });

    it('should reject invalid instance ID (special characters)', async () => {
      const response = await client.post('/instances', {
        instanceId: 'invalid@id!',
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('INVALID_REQUEST');
    });

    it('should reject empty instance ID', async () => {
      const response = await client.post('/instances', {
        instanceId: '',
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it('should reject duplicate instance ID', async () => {
      // Create first instance
      await client.post('/instances', { instanceId: testInstanceId });

      // Try to create duplicate
      const response = await client.post('/instances', { instanceId: testInstanceId });

      expect(response.status).toBe(409);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('CONFLICT');
    });

    it('should reject invalid webhook URL', async () => {
      const response = await client.post('/instances', {
        instanceId: testInstanceId,
        webhookUrl: 'not-a-valid-url',
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it('should reject invalid webhook event', async () => {
      const response = await client.post('/instances', {
        instanceId: testInstanceId,
        webhookUrl: 'http://example.com/webhook',
        webhookEvents: ['invalid_event'],
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('GET /instances - List Instances', () => {
    it('should return empty array when no instances exist', async () => {
      const response = await client.get('/instances');

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(Array.isArray(response.data.data)).toBe(true);
    });

    it('should return all instances', async () => {
      // Create multiple instances
      await client.post('/instances', { instanceId: `${testInstanceId}-1` });
      await client.post('/instances', { instanceId: `${testInstanceId}-2` });

      const response = await client.get('/instances');

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.length).toBeGreaterThanOrEqual(2);

      // Cleanup
      await client.delete(`/instances/${testInstanceId}-1`);
      await client.delete(`/instances/${testInstanceId}-2`);
    });
  });

  describe('GET /instances/:id - Get Instance', () => {
    it('should return instance details for valid ID', async () => {
      // Create instance
      await client.post('/instances', { instanceId: testInstanceId });

      const response = await client.get(`/instances/${testInstanceId}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.instanceId).toBe(testInstanceId);
      expect(response.data.data.status).toBe('disconnected');
    });

    it('should return 404 for non-existent instance', async () => {
      const response = await client.get('/instances/non-existent');

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /instances/:id - Delete Instance', () => {
    it('should delete existing instance', async () => {
      // Create instance
      await client.post('/instances', { instanceId: testInstanceId });

      // Delete instance
      const response = await client.delete(`/instances/${testInstanceId}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.message).toBe('Instance deleted successfully');

      // Verify it's deleted
      const getResponse = await client.get(`/instances/${testInstanceId}`);
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 when deleting non-existent instance', async () => {
      const response = await client.delete('/instances/non-existent');

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Authentication', () => {
    it('should reject request without API key', async () => {
      const clientNoAuth = createTestClient().withoutAuth();

      const response = await clientNoAuth.get('/instances');

      expect(response.status).toBe(401);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject request with invalid API key', async () => {
      const clientInvalidKey = createTestClient().withApiKey('invalid-key');

      const response = await clientInvalidKey.get('/instances');

      expect(response.status).toBe(401);
      expect(response.data.success).toBe(false);
      expect(response.data.error.code).toBe('UNAUTHORIZED');
    });

    it('should accept request with valid API key in Authorization header', async () => {
      const response = await client.get('/instances');

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });
  });
});
