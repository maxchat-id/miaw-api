/**
 * v2 Contract Integration Tests
 *
 * These run against the real server, so they cover what the unit tests cannot:
 * the two contracts actually coexist in one Fastify instance, the v2 envelope
 * hook is wired to every ported module, and the OpenAPI document describes
 * both mounts.
 *
 * No WhatsApp connection is required. Everything here is either instance
 * bookkeeping, which works while disconnected, or the 503 that connection-only
 * routes must return when it is — which is itself part of the contract.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { startTestServer, stopTestServer, createTestClient } from './helpers/server.js';
import { HttpClient } from './helpers/http.js';

const V2 = '/api/v2';

describe('v2 contract', () => {
  let client: HttpClient;
  let instanceId: string;

  beforeAll(async () => {
    await startTestServer();
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  }, 10000);

  beforeEach(async () => {
    client = createTestClient();
    instanceId = `v2-test-${Date.now()}`;
    await client.post(`${V2}/instances`, { instanceId });
  });

  afterEach(async () => {
    try {
      await client.delete(`${V2}/instances/${instanceId}`);
    } catch {
      // Already gone - some tests delete it themselves.
    }
  });

  const patch = (path: string, body?: unknown) => client.request(path, { method: 'PATCH', body });

  describe('dual mount', () => {
    it('serves both contracts from one server', async () => {
      const v1 = await client.get('/instances');
      const v2 = await client.get(`${V2}/instances`);

      expect(v1.status).toBe(200);
      expect(v2.status).toBe(200);
    });

    it('keeps the v1 collection shape untouched', async () => {
      const v1 = await client.get('/instances');

      // v1 returned a bare array and consumers depend on that.
      expect(Array.isArray(v1.data.data)).toBe(true);
    });

    it('wraps v2 collections in { items, total }', async () => {
      const v2 = await client.get(`${V2}/instances`);

      expect(Array.isArray(v2.data.data.items)).toBe(true);
      expect(typeof v2.data.data.total).toBe('number');
      expect(v2.data.data.total).toBe(v2.data.data.items.length);
    });

    it('keeps v1 lenient about unknown fields', async () => {
      // v2 rejects these; v1 is frozen, and callers may be sending extra
      // fields today that it has always quietly accepted.
      const id = `v1-lenient-${Date.now()}`;
      const res = await client.post('/instances', { instanceId: id, unknownField: true });

      expect(res.status).toBe(201);
      await client.delete(`/instances/${id}`);
    });

    it('rejects the same unknown field on v2', async () => {
      const res = await client.post(`${V2}/instances`, {
        instanceId: `v2-strict-${Date.now()}`,
        unknownField: true,
      });

      expect(res.status).toBe(400);
    });

    it('does not leak v2 paths into the root mount', async () => {
      const stray = await client.get('/api/v2/api/v2/instances');

      expect(stray.status).toBe(404);
    });
  });

  describe('envelope', () => {
    it('stamps success and data onto every v2 2xx', async () => {
      const res = await client.get(`${V2}/instances/${instanceId}`);

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data.instanceId).toBe(instanceId);
    });

    it('never nests a second success flag inside data', async () => {
      const res = await patch(`${V2}/instances/${instanceId}/webhook`, {
        webhookEvents: ['ready'],
      });

      expect(res.status).toBe(200);
      expect(res.data.data).not.toHaveProperty('success');
    });

    it('reports errors with a code and a correlation id', async () => {
      const res = await client.get(`${V2}/instances/does-not-exist`);

      expect(res.status).toBe(404);
      expect(res.data.success).toBe(false);
      expect(res.data.error.code).toBe('NOT_FOUND');
      expect(res.data.error.correlationId).toBeDefined();
    });
  });

  describe('authentication', () => {
    it('rejects an unauthenticated v2 request', async () => {
      const anonymous = client.withoutAuth();

      const res = await anonymous.get(`${V2}/instances`);

      expect(res.status).toBe(401);
    });

    it('rejects a wrong api key', async () => {
      const wrong = client.withApiKey('not-the-key');

      const res = await wrong.get(`${V2}/instances`);

      expect(res.status).toBe(401);
    });
  });

  describe('instance lifecycle without a WhatsApp connection', () => {
    it('creates with 201 and reads back the same instance', async () => {
      const id = `v2-lifecycle-${Date.now()}`;

      const created = await client.post(`${V2}/instances`, { instanceId: id });
      expect(created.status).toBe(201);
      expect(created.data.data.status).toBe('disconnected');

      const read = await client.get(`${V2}/instances/${id}`);
      expect(read.data.data.instanceId).toBe(id);

      const deleted = await client.delete(`${V2}/instances/${id}`);
      expect(deleted.data.data).toEqual({ deleted: true });

      const gone = await client.get(`${V2}/instances/${id}`);
      expect(gone.status).toBe(404);
    });

    it('rejects a duplicate instance with 409', async () => {
      const res = await client.post(`${V2}/instances`, { instanceId });

      expect(res.status).toBe(409);
    });

    it('accepts clientOptions, including a proxy', async () => {
      const id = `v2-proxy-${Date.now()}`;

      const res = await client.post(`${V2}/instances`, {
        instanceId: id,
        clientOptions: { proxy: 'socks5://proxy.invalid:1080', autoReconnect: false },
      });

      expect(res.status).toBe(201);
      await client.delete(`${V2}/instances/${id}`);
    });

    it('rejects a proxy scheme the transport cannot use', async () => {
      const res = await client.post(`${V2}/instances`, {
        instanceId: `v2-badproxy-${Date.now()}`,
        clientOptions: { proxy: 'ftp://proxy.invalid:21' },
      });

      expect(res.status).toBe(400);
    });

    it('holds the SSRF guard on the real server', async () => {
      const res = await client.post(`${V2}/instances`, {
        instanceId: `v2-ssrf-${Date.now()}`,
        webhookUrl: 'http://169.254.169.254/latest/meta-data',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('webhook sub-resource', () => {
    it('reads, updates and re-reads the configuration', async () => {
      const before = await client.get(`${V2}/instances/${instanceId}/webhook`);
      expect(before.data.data.webhookUrl).toBeNull();
      expect(before.data.data.webhookEnabled).toBe(false);

      const updated = await patch(`${V2}/instances/${instanceId}/webhook`, {
        webhookUrl: 'https://example.com/hook',
        webhookEvents: ['ready', 'message'],
      });
      expect(updated.status).toBe(200);

      const after = await client.get(`${V2}/instances/${instanceId}/webhook`);
      expect(after.data.data.webhookUrl).toBe('https://example.com/hook');
      expect(after.data.data.webhookEnabled).toBe(true);
    });

    it('refuses a test delivery when no URL is configured', async () => {
      const res = await client.post(`${V2}/instances/${instanceId}/webhook-tests`, {});

      expect(res.status).toBe(400);
    });

    it('queues a test delivery promptly once a URL exists', async () => {
      await patch(`${V2}/instances/${instanceId}/webhook`, {
        webhookUrl: 'https://example.com/hook',
      });

      const started = Date.now();
      const res = await client.post(`${V2}/instances/${instanceId}/webhook-tests`, {});

      expect(res.status).toBe(202);
      expect(res.data.data.queued).toBe(true);
      // v1 slept 2s inside the handler; this must not.
      expect(Date.now() - started).toBeLessThan(1500);
    });

    it('serves delivery stats', async () => {
      const res = await client.get(`${V2}/instances/${instanceId}/webhook/stats`);

      expect(res.status).toBe(200);
      expect(res.data.data.instanceId).toBe(instanceId);
      expect(res.data.data.stats).toBeDefined();
    });
  });

  describe('connection-only routes while disconnected', () => {
    // 503 rather than 500 or a hang is the contract: the instance exists, the
    // operation just cannot run yet.
    const cases: Array<[string, string, unknown]> = [
      ['GET', '/contacts', undefined],
      ['GET', '/chats', undefined],
      ['GET', '/groups', undefined],
      ['GET', '/profile', undefined],
      ['GET', '/labels', undefined],
      ['GET', '/communities', undefined],
      ['PUT', '/chats/628111%40s.whatsapp.net/archive', undefined],
      ['POST', '/messages/text', { to: '628111', text: 'halo' }],
    ];

    it.each(cases)('answers 503 for %s %s', async (method, path, body) => {
      const res = await client.request(`${V2}/instances/${instanceId}${path}`, {
        method,
        body,
      });

      expect(res.status).toBe(503);
      expect(res.data.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('reads and updates runtime options', async () => {
      const before = await client.get(`${V2}/instances/${instanceId}/runtime`);
      expect(before.status).toBe(200);
      expect(before.data.data).toHaveProperty('autoReconnect');

      const patched = await patch(`${V2}/instances/${instanceId}/runtime`, {
        autoReconnect: false,
        reconnectDelay: 5000,
      });
      expect(patched.status).toBe(200);
      expect(patched.data.data.autoReconnect).toBe(false);
      expect(patched.data.data.reconnectDelay).toBe(5000);

      const after = await client.get(`${V2}/instances/${instanceId}/runtime`);
      expect(after.data.data.autoReconnect).toBe(false);
    });

    it('refuses to change the transport through runtime', async () => {
      const res = await patch(`${V2}/instances/${instanceId}/runtime`, {
        proxy: 'socks5://proxy.invalid:1080',
      });

      expect(res.status).toBe(400);
    });

    it('still allows session bookkeeping', async () => {
      // Clearing and disposing are exactly what you do while disconnected.
      const cleared = await client.delete(`${V2}/instances/${instanceId}/session`);
      expect(cleared.status).toBe(200);
      expect(typeof cleared.data.data.cleared).toBe('boolean');

      const stats = await client.get(`${V2}/instances/${instanceId}/stats/messages`);
      expect(stats.status).toBe(200);
      expect(stats.data.data.totalMessages).toBe(0);
    });
  });

  describe('request validation', () => {
    it('rejects an empty profile patch', async () => {
      const res = await patch(`${V2}/instances/${instanceId}/profile`, {});

      expect(res.status).toBe(400);
    });

    it('rejects an unknown chat presence state', async () => {
      const res = await client.put(
        `${V2}/instances/${instanceId}/chats/${encodeURIComponent('628111@s.whatsapp.net')}/presence`,
        { state: 'dancing' },
      );

      expect(res.status).toBe(400);
    });

    it('rejects an unknown participant operation', async () => {
      const res = await patch(
        `${V2}/instances/${instanceId}/groups/${encodeURIComponent('1@g.us')}/participants`,
        { operation: 'banish', participants: ['628111'] },
      );

      expect(res.status).toBe(400);
    });

    it('caps a contact check batch at 50', async () => {
      const res = await client.post(`${V2}/instances/${instanceId}/contacts/checks`, {
        phones: Array.from({ length: 51 }, (_, i) => `62811100${i}`),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('OpenAPI document', () => {
    it('describes both mounts', async () => {
      const res = await client.get('/documentation/json');

      expect(res.status).toBe(200);
      const paths = Object.keys(res.data.paths ?? {});

      expect(paths).toContain('/instances');
      expect(paths).toContain(`${V2}/instances`);
      expect(paths).toContain(`${V2}/instances/{instanceId}/messages/text`);
      expect(paths).toContain(`${V2}/instances/{instanceId}/newsletters`);
      expect(paths).toContain(`${V2}/instances/{instanceId}/communities`);
      expect(paths).toContain(`${V2}/instances/{instanceId}/messages/poll`);
      expect(paths).toContain(`${V2}/instances/{instanceId}/authentication/pairing-code`);
      expect(paths).toContain(`${V2}/instances/{instanceId}/runtime`);
    });

    it('registers every ported v2 module', async () => {
      const res = await client.get('/documentation/json');
      const paths = Object.keys(res.data.paths ?? {});
      const v2 = paths.filter((p) => p.startsWith(V2));

      for (const marker of [
        'instances',
        'connection',
        'messages/text',
        'webhook',
        'contacts',
        'chats',
        'profile',
        'groups',
        'labels',
        'catalog/products',
        'newsletters',
        'communities',
        'catalog/products',
        'proxy-pool',
        'stats/messages',
      ]) {
        expect(v2.some((p) => p.includes(marker))).toBe(true);
      }
    });
  });
});
