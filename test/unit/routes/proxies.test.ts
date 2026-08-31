import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { registerSchemas } from '../../../src/schemas/index.js';

const probeMock = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/ProxyService.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/services/ProxyService.js')>();
  return { ...original, testProxy: probeMock };
});

import { proxyRoutes } from '../../../src/routes/proxies.js';

describe('proxy routes', () => {
  let server: FastifyInstance;
  let manager: {
    getProxy: ReturnType<typeof vi.fn>;
    replaceProxy: ReturnType<typeof vi.fn>;
  };
  let proxyPool: {
    enabled: boolean;
    getStatus: ReturnType<typeof vi.fn>;
    reload: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    manager = {
      getProxy: vi.fn(() => ({
        source: 'explicit',
        url: 'http://region:****@proxy.test:8080/',
        protocol: 'http',
        downloadProxied: true,
      })),
      replaceProxy: vi.fn(() => ({
        source: 'explicit',
        url: 'http://region:****@proxy.test:8080/',
        protocol: 'http',
        downloadProxied: true,
      })),
    };
    proxyPool = {
      enabled: false,
      getStatus: vi.fn(() => ({
        enabled: false,
        strategy: null,
        total: 0,
        eligible: 0,
        proxies: [],
      })),
      reload: vi.fn(),
    };
    probeMock.mockResolvedValue({
      proxy: {
        url: 'http://region:****@proxy.test:8080/',
        protocol: 'http',
      },
      reachable: true,
      latencyMs: 12,
      statusCode: 200,
      downloadProxied: true,
      error: null,
    });

    server = Fastify({ logger: false });
    server.decorate('instanceManager', manager as any);
    server.decorate('proxyPool', proxyPool as any);
    registerSchemas(server);
    await server.register(proxyRoutes, { prefix: '/api/v1' });
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    vi.clearAllMocks();
  });

  const inject = (method: string, url: string, payload?: unknown) =>
    server.inject({
      method,
      url,
      payload,
      headers: { authorization: `Bearer ${config.apiKey}` },
    });

  it('requires authentication for proxy operations', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/proxy-pool',
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns disabled pool status and rejects reloads without a pool', async () => {
    const status = await inject('GET', '/api/v1/proxy-pool');
    expect(status.statusCode).toBe(200);
    expect(status.json().data).toMatchObject({
      enabled: false,
      total: 0,
    });

    const reload = await inject('POST', '/api/v1/proxy-pool/reloads');
    expect(reload.statusCode).toBe(409);
    expect(proxyPool.reload).not.toHaveBeenCalled();
  });

  it('reloads an enabled pool and maps failed reloads to 503', async () => {
    proxyPool.enabled = true;
    proxyPool.reload.mockResolvedValueOnce({
      enabled: true,
      strategy: 'deterministic',
      total: 2,
      eligible: 2,
      proxies: [],
    });
    const success = await inject('POST', '/api/v1/proxy-pool/reloads');
    expect(success.statusCode).toBe(200);
    expect(success.json().data.total).toBe(2);

    proxyPool.reload.mockRejectedValueOnce(new Error('invalid file'));
    const failure = await inject('POST', '/api/v1/proxy-pool/reloads');
    expect(failure.statusCode).toBe(503);
  });

  it.each([
    'http://proxy.test:8080',
    'https://proxy.test:8443',
    'socks://proxy.test:1080',
    'socks4://proxy.test:1080',
    'socks4a://proxy.test:1080',
    'socks5://proxy.test:1080',
    'socks5h://proxy.test:1080',
  ])('accepts the supported proxy protocol %s', async (proxy) => {
    const response = await inject('POST', '/api/v1/proxy-tests', {
      proxy,
      timeoutMs: 1000,
    });
    expect(response.statusCode).toBe(200);
    expect(probeMock).toHaveBeenCalledWith(proxy, 1000);
  });

  it('rejects unsupported protocols and timeout bounds', async () => {
    const protocol = await inject('POST', '/api/v1/proxy-tests', {
      proxy: 'ftp://proxy.test:21',
    });
    expect(protocol.statusCode).toBe(400);

    const timeout = await inject('POST', '/api/v1/proxy-tests', {
      proxy: 'http://proxy.test:8080',
      timeoutMs: 999,
    });
    expect(timeout.statusCode).toBe(400);
    expect(probeMock).not.toHaveBeenCalled();
  });

  it('returns a sanitized proxy probe result', async () => {
    const response = await inject('POST', '/api/v1/proxy-tests', {
      proxy: {
        url: 'http://proxy.test:8080',
        username: 'region',
        password: 'secret',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(response.json())).not.toContain('secret');
  });

  it('gets, replaces, and clears a disconnected instance proxy', async () => {
    const current = await inject('GET', '/api/v1/instances/bot/proxy');
    expect(current.statusCode).toBe(200);
    expect(current.json().data.source).toBe('explicit');

    const replacement = {
      url: 'http://proxy.test:8080',
      username: 'region',
      password: 'secret',
    };
    const replaced = await inject('PUT', '/api/v1/instances/bot/proxy', {
      proxy: replacement,
    });
    expect(replaced.statusCode).toBe(200);
    expect(manager.replaceProxy).toHaveBeenCalledWith('bot', replacement);

    const cleared = await inject('DELETE', '/api/v1/instances/bot/proxy');
    expect(cleared.statusCode).toBe(200);
    expect(manager.replaceProxy).toHaveBeenCalledWith('bot');
  });

  it('maps missing instances and live proxy changes to REST errors', async () => {
    manager.getProxy.mockImplementationOnce(() => {
      throw new Error('Instance missing not found');
    });
    const missing = await inject('GET', '/api/v1/instances/missing/proxy');
    expect(missing.statusCode).toBe(404);

    manager.replaceProxy.mockImplementationOnce(() => {
      throw new Error('Instance must be disconnected before changing its proxy');
    });
    const connected = await inject('PUT', '/api/v1/instances/bot/proxy', {
      proxy: 'http://proxy.test:8080',
    });
    expect(connected.statusCode).toBe(409);
  });
});
