/**
 * Phase 13 Product Management Integration Tests
 *
 * Tests product catalog management (WhatsApp Business only):
 * - Create product (POST /products)
 * - Update product (PATCH /products/:productId)
 * - Delete products (DELETE /products)
 * - Get chats by label (GET /labels/:labelId/chats)
 *
 * NOTE: These tests require a connected WhatsApp Business account.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { startTestServer, stopTestServer, createTestClient } from './helpers/server.js';
import { WebhookTestServer } from './helpers/webhook.js';

describe('Phase 13 Product Management Tests', () => {
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
    try {
      await client.delete(`/instances/${testInstanceId}`);
    } catch {
      // Ignore if instance doesn't exist
    }
  });

  describe('Product Creation', () => {
    it.skip('should create a new product', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/products`, {
        name: `Test Product ${Date.now()}`,
        description: 'A test product created via API',
        price: 1999, // $19.99 in cents
        currency: 'USD',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.success).toBe(true);
      expect(response.data.data.productId).toBeDefined();
    });

    it.skip('should create a product with all optional fields', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.post(`/instances/${testInstanceId}/products`, {
        name: `Full Product ${Date.now()}`,
        description: 'A product with all fields',
        price: 4999,
        currency: 'USD',
        imageUrls: ['https://example.com/product.jpg'],
        isHidden: false,
        retailerId: `SKU-${Date.now()}`,
        url: 'https://example.com/product',
        originCountryCode: 'US',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.productId).toBeDefined();
    });

    it.skip('should reject product creation when instance is not connected', async () => {
      const response = await client.post(`/instances/${testInstanceId}/products`, {
        name: 'Test Product',
        description: 'Test description',
        price: 1000,
        currency: 'USD',
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it('should reject product with missing required fields', async () => {
      const response = await client.post(`/instances/${testInstanceId}/products`, {
        name: 'Test Product',
        // Missing description, price, currency
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it('should reject product with invalid currency code', async () => {
      const response = await client.post(`/instances/${testInstanceId}/products`, {
        name: 'Test Product',
        description: 'Test description',
        price: 1000,
        currency: 'INVALID', // Too long
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it('should reject product with negative price', async () => {
      const response = await client.post(`/instances/${testInstanceId}/products`, {
        name: 'Test Product',
        description: 'Test description',
        price: -100,
        currency: 'USD',
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Product Update', () => {
    let testProductId: string | null = null;

    it.skip('should update an existing product', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First create a product
      const createResponse = await client.post(`/instances/${testInstanceId}/products`, {
        name: `Product to Update ${Date.now()}`,
        description: 'Original description',
        price: 1000,
        currency: 'USD',
      });

      if (!createResponse.data.data.productId) {
        console.log('Skipping test - product creation failed');
        return;
      }

      testProductId = createResponse.data.data.productId;

      // Update the product
      const updateResponse = await client.patch(
        `/instances/${testInstanceId}/products/${testProductId}`,
        {
          name: `Updated Product ${Date.now()}`,
          description: 'Updated description',
          price: 2000,
        },
      );

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.data.success).toBe(true);
      expect(updateResponse.data.data.productId).toBe(testProductId);
    });

    it.skip('should update only specified fields', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First create a product
      const createResponse = await client.post(`/instances/${testInstanceId}/products`, {
        name: `Partial Update Test ${Date.now()}`,
        description: 'Original description',
        price: 1500,
        currency: 'USD',
      });

      if (!createResponse.data.data.productId) {
        console.log('Skipping test - product creation failed');
        return;
      }

      const productId = createResponse.data.data.productId;

      // Update only price
      const updateResponse = await client.patch(
        `/instances/${testInstanceId}/products/${productId}`,
        {
          price: 2500,
        },
      );

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.data.success).toBe(true);
    });

    it.skip('should reject update when instance is not connected', async () => {
      const response = await client.patch(`/instances/${testInstanceId}/products/test-product-id`, {
        price: 3000,
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it('should handle non-existent instance', async () => {
      const response = await client.patch(`/instances/non-existent/products/test-product-id`, {
        price: 3000,
      });

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Product Deletion', () => {
    it.skip('should delete a single product', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First create a product
      const createResponse = await client.post(`/instances/${testInstanceId}/products`, {
        name: `Product to Delete ${Date.now()}`,
        description: 'This will be deleted',
        price: 500,
        currency: 'USD',
      });

      if (!createResponse.data.data.productId) {
        console.log('Skipping test - product creation failed');
        return;
      }

      const productId = createResponse.data.data.productId;

      // Delete the product
      const deleteResponse = await client.delete(`/instances/${testInstanceId}/products`, {
        data: {
          productIds: [productId],
        },
      });

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.data.success).toBe(true);
      expect(deleteResponse.data.data.deletedCount).toBe(1);
    });

    it.skip('should delete multiple products', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Create multiple products
      const productIds: string[] = [];

      for (let i = 0; i < 3; i++) {
        const createResponse = await client.post(`/instances/${testInstanceId}/products`, {
          name: `Bulk Delete Product ${i} - ${Date.now()}`,
          description: 'This will be deleted in bulk',
          price: 100 * (i + 1),
          currency: 'USD',
        });

        if (createResponse.data.data.productId) {
          productIds.push(createResponse.data.data.productId);
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (productIds.length === 0) {
        console.log('Skipping test - no products created');
        return;
      }

      // Delete all products
      const deleteResponse = await client.delete(`/instances/${testInstanceId}/products`, {
        data: {
          productIds,
        },
      });

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.data.success).toBe(true);
      expect(deleteResponse.data.data.deletedCount).toBeGreaterThan(0);
    });

    it.skip('should reject deletion when instance is not connected', async () => {
      const response = await client.delete(`/instances/${testInstanceId}/products`, {
        data: {
          productIds: ['test-product-id'],
        },
      });

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it('should reject deletion with empty productIds array', async () => {
      const response = await client.delete(`/instances/${testInstanceId}/products`, {
        data: {
          productIds: [],
        },
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it('should reject deletion without productIds', async () => {
      const response = await client.delete(`/instances/${testInstanceId}/products`, {
        data: {},
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Get Chats by Label', () => {
    it.skip('should get chats by label', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // First create a label
      const createLabelResponse = await client.post(`/instances/${testInstanceId}/labels`, {
        name: `Test Label ${Date.now()}`,
        color: 5,
      });

      if (!createLabelResponse.data.data.labelId) {
        console.log('Skipping test - label creation failed');
        return;
      }

      const labelId = createLabelResponse.data.data.labelId;

      // Get chats by this label
      const response = await client.get(`/instances/${testInstanceId}/labels/${labelId}/chats`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('chats');
      expect(response.data.data).toHaveProperty('count');
      expect(Array.isArray(response.data.data.chats)).toBe(true);
      expect(typeof response.data.data.count).toBe('number');
    });

    it.skip('should return empty array for label with no chats', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      // Create a new label that has no chats
      const createLabelResponse = await client.post(`/instances/${testInstanceId}/labels`, {
        name: `Empty Label ${Date.now()}`,
        color: 10,
      });

      if (!createLabelResponse.data.data.labelId) {
        console.log('Skipping test - label creation failed');
        return;
      }

      const labelId = createLabelResponse.data.data.labelId;

      // Get chats - should be empty
      const response = await client.get(`/instances/${testInstanceId}/labels/${labelId}/chats`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.chats).toEqual([]);
      expect(response.data.data.count).toBe(0);
    });

    it.skip('should return empty array for non-existent label', async () => {
      const statusResponse = await client.get(`/instances/${testInstanceId}/status`);

      if (statusResponse.data.data.status !== 'connected') {
        console.log('Skipping test - instance not connected');
        return;
      }

      const response = await client.get(
        `/instances/${testInstanceId}/labels/non-existent-label-id/chats`,
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.chats).toEqual([]);
      expect(response.data.data.count).toBe(0);
    });

    it.skip('should reject when instance is not connected', async () => {
      const response = await client.get(`/instances/${testInstanceId}/labels/test-label-id/chats`);

      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
    });

    it('should handle non-existent instance', async () => {
      const response = await client.get(`/instances/non-existent/labels/test-label-id/chats`);

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid instance ID for all product endpoints', async () => {
      // Create product
      const createResponse = await client.post(`/instances/non-existent/products`, {
        name: 'Test',
        description: 'Test',
        price: 1000,
        currency: 'USD',
      });
      expect(createResponse.status).toBe(404);

      // Update product
      const updateResponse = await client.patch(
        `/instances/non-existent/products/test-product-id`,
        {
          price: 2000,
        },
      );
      expect(updateResponse.status).toBe(404);

      // Delete products
      const deleteResponse = await client.delete(`/instances/non-existent/products`, {
        data: {
          productIds: ['test-product-id'],
        },
      });
      expect(deleteResponse.status).toBe(404);
    });
  });
});
