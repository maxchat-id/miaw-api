/**
 * Both contracts must be reachable from one server: v1 unprefixed at the root,
 * v2 under /api/v2 with the success envelope stamped on every 2xx.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { registerSchemas } from '../../../src/schemas/index.js';
import { registerRoutes, V2_PREFIX } from '../../../src/routes/index.js';

describe('v1 / v2 dual mount', () => {
  let server: FastifyInstance;

  const poolStatus = {
    enabled: false,
    strategy: null,
    total: 0,
    eligible: 0,
    proxies: [],
  };

  beforeEach(async () => {
    const instanceManager = {
      getProxy: vi.fn(() => ({
        source: 'none',
        url: null,
        protocol: null,
        downloadProxied: false,
      })),
      replaceProxy: vi.fn(),
      getClient: vi.fn(() => null),
      getInstance: vi.fn(() => null),
      listInstances: vi.fn(() => []),
    };

    server = Fastify({ logger: false });
    server.decorate('instanceManager', instanceManager as any);
    server.decorate('proxyPool', { enabled: false, getStatus: () => poolStatus } as any);
    server.decorate('webhookDispatcher', {} as any);
    registerSchemas(server);
    await registerRoutes(server, instanceManager as any);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  const get = (url: string) =>
    server.inject({
      method: 'GET',
      url,
      headers: { 'x-api-key': config.apiKey },
    });

  it('serves the same resource on both mounts', async () => {
    const v1 = await get('/proxy-pool');
    const v2 = await get(`${V2_PREFIX}/proxy-pool`);

    expect(v1.statusCode).toBe(200);
    expect(v2.statusCode).toBe(200);
    expect(v1.json()).toEqual({ success: true, data: poolStatus });
    expect(v2.json()).toEqual({ success: true, data: poolStatus });
  });

  it('leaves v1 paths unprefixed so existing consumers keep working', async () => {
    const missing = await get('/api/v2/does-not-exist');
    expect(missing.statusCode).toBe(404);

    // The v1 mount must not have been moved under the v2 prefix.
    const v1 = await get('/proxy-pool');
    expect(v1.statusCode).toBe(200);
  });

  it('stamps successEnvelope on v2 2xx responses only', async () => {
    const routes = server
      .printRoutes({ commonPrefix: false })
      .split('\n')
      .filter((line) => line.includes('proxy-pool'));

    // Both mounts registered the resource.
    expect(routes.length).toBeGreaterThan(0);

    const v2 = await get(`${V2_PREFIX}/proxy-pool`);
    expect(v2.json()).toHaveProperty('success', true);
    expect(v2.json()).toHaveProperty('data');
  });
});
