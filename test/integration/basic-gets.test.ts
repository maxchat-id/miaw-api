/**
 * Basic GET Operations Tests (v0.9.0)
 *
 * Tests for:
 * - GET /instances/:id/contacts - Get all contacts
 * - GET /instances/:id/groups - Get all groups
 * - GET /instances/:id/profile - Get own profile
 * - GET /instances/:id/labels - Get all labels
 * - GET /instances/:id/chats - Get all chats
 * - GET /instances/:id/chats/:jid/messages - Get chat messages
 */

import { describe, test, expect, beforeAll } from 'vitest';

const API_URL = 'http://127.0.0.1:3000';
const API_KEY = process.env.API_KEY || 'test-api-key-for-integration-tests';
const INSTANCE_ID = process.env.TEST_INSTANCE_ID || 'integration-test-bot';

describe('Basic GET Operations (v0.9.0)', () => {
  let isConnected = false;

  beforeAll(async () => {
    // Check if instance is connected
    try {
      const response = await fetch(`${API_URL}/instances/${INSTANCE_ID}/status`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
      });
      const data = (await response.json()) as { status: string };
      isConnected = data.status === 'connected';
    } catch {
      // Skip if API is not available
    }
  });

  describe('GET /instances/:id/contacts - Get all contacts', () => {
    test('should return contacts list when instance is connected', async () => {
      if (!isConnected) {
        console.log('  ⚠️  Skipping: Instance not connected');
        return;
      }

      const response = await fetch(`${API_URL}/instances/${INSTANCE_ID}/contacts`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as { success: boolean; contacts?: unknown[] };
      expect(data.success).toBe(true);
      expect(Array.isArray(data.contacts)).toBe(true);
    });

    test('should return 404 for non-existent instance', async () => {
      const response = await fetch(`${API_URL}/instances/non-existent/contacts`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
      });

      expect(response.status).toBe(404);

      const data = (await response.json()) as { success: boolean; error?: string };
      expect(data.success).toBe(false);
      expect(data.error).toBe('Instance not found');
    });
  });

  describe('GET /instances/:id/groups - Get all groups', () => {
    test('should return groups list when instance is connected', async () => {
      if (!isConnected) {
        console.log('  ⚠️  Skipping: Instance not connected');
        return;
      }

      const response = await fetch(`${API_URL}/instances/${INSTANCE_ID}/groups`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as { success: boolean; groups?: unknown[] };
      expect(data.success).toBe(true);
      expect(Array.isArray(data.groups)).toBe(true);
    });

    test('should return 404 for non-existent instance', async () => {
      const response = await fetch(`${API_URL}/instances/non-existent/groups`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
      });

      expect(response.status).toBe(404);

      const data = (await response.json()) as { success: boolean; error?: string };
      expect(data.success).toBe(false);
      expect(data.error).toBe('Instance not found');
    });
  });

  describe('GET /instances/:id/profile - Get own profile', () => {
    test('should return own profile when instance is connected', async () => {
      if (!isConnected) {
        console.log('  ⚠️  Skipping: Instance not connected');
        return;
      }

      const response = await fetch(`${API_URL}/instances/${INSTANCE_ID}/profile`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as { jid?: string };
      expect(data.jid).toBeDefined();
      expect(typeof data.jid).toBe('string');
    });

    test('should return 404 for non-existent instance', async () => {
      const response = await fetch(`${API_URL}/instances/non-existent/profile`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
      });

      expect(response.status).toBe(404);

      const data = (await response.json()) as { success: boolean; error?: string };
      expect(data.success).toBe(false);
      expect(data.error).toBe('Instance not found');
    });
  });

  describe('GET /instances/:id/labels - Get all labels', () => {
    test('should return labels list when instance is connected', async () => {
      if (!isConnected) {
        console.log('  ⚠️  Skipping: Instance not connected');
        return;
      }

      const response = await fetch(`${API_URL}/instances/${INSTANCE_ID}/labels`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as { success: boolean; labels?: unknown[] };
      expect(data.success).toBe(true);
      expect(Array.isArray(data.labels)).toBe(true);
    });

    test('should return 404 for non-existent instance', async () => {
      const response = await fetch(`${API_URL}/instances/non-existent/labels`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
      });

      expect(response.status).toBe(404);

      const data = (await response.json()) as { success: boolean; error?: string };
      expect(data.success).toBe(false);
      expect(data.error).toBe('Instance not found');
    });
  });

  describe('GET /instances/:id/chats - Get all chats', () => {
    test('should return chats list when instance is connected', async () => {
      if (!isConnected) {
        console.log('  ⚠️  Skipping: Instance not connected');
        return;
      }

      const response = await fetch(`${API_URL}/instances/${INSTANCE_ID}/chats`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as { success: boolean; chats?: unknown[] };
      expect(data.success).toBe(true);
      expect(Array.isArray(data.chats)).toBe(true);
    });

    test('should return 404 for non-existent instance', async () => {
      const response = await fetch(`${API_URL}/instances/non-existent/chats`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
      });

      expect(response.status).toBe(404);

      const data = (await response.json()) as { success: boolean; error?: string };
      expect(data.success).toBe(false);
      expect(data.error).toBe('Instance not found');
    });
  });

  describe('GET /instances/:id/chats/:jid/messages - Get chat messages', () => {
    test('should return messages for a valid chat JID', async () => {
      if (!isConnected) {
        console.log('  ⚠️  Skipping: Instance not connected');
        return;
      }

      // Use status@whatsapp.net as a test JID (WhatsApp official account)
      const testJid = 'status@whatsapp.net';

      const response = await fetch(
        `${API_URL}/instances/${INSTANCE_ID}/chats/${testJid}/messages`,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
          },
        },
      );

      expect(response.status).toBe(200);

      const data = (await response.json()) as { success: boolean; messages?: unknown[] };
      expect(data.success).toBe(true);
      expect(Array.isArray(data.messages)).toBe(true);
    });

    test('should return 404 for non-existent instance', async () => {
      const response = await fetch(
        `${API_URL}/instances/non-existent/chats/status@whatsapp.net/messages`,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
          },
        },
      );

      expect(response.status).toBe(404);

      const data = (await response.json()) as { success: boolean; error?: string };
      expect(data.success).toBe(false);
      expect(data.error).toBe('Instance not found');
    });
  });
});
