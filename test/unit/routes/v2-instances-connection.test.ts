/**
 * v2 instance and connection contract: normalized paths, `{ items, total }`
 * collections, and the local extras (SSRF guard, needsPairing) that must
 * survive the port from v1.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { registerSchemas } from '../../../src/schemas/index.js';
import { errorHandler } from '../../../src/utils/errorHandler.js';
import { instanceRoutesV2 } from '../../../src/routes/v2/instances.js';
import { connectionRoutesV2 } from '../../../src/routes/v2/connection.js';

const PREFIX = '/api/v2';

const stateFor = (overrides: Record<string, unknown> = {}) => ({
  instanceId: 'bot',
  status: 'disconnected',
  webhookEvents: [],
  webhookEnabled: false,
  createdAt: new Date(0),
  lastActivity: new Date(0),
  ...overrides,
});

describe('v2 instances + connection', () => {
  let server: FastifyInstance;
  let manager: Record<string, ReturnType<typeof vi.fn>>;
  let client: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    client = {
      connect: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
    };
    manager = {
      createInstance: vi.fn(async (cfg: any) => stateFor({ instanceId: cfg.instanceId })),
      listInstances: vi.fn(() => [stateFor(), stateFor({ instanceId: 'bot2' })]),
      getInstance: vi.fn(() => stateFor()),
      updateWebhook: vi.fn(() => stateFor({ webhookUrl: 'https://example.test/hook' })),
      deleteInstance: vi.fn(async () => undefined),
      getClient: vi.fn(() => client),
    };

    server = Fastify({ logger: false });
    server.setErrorHandler(errorHandler);
    server.decorate('instanceManager', manager as any);
    registerSchemas(server);
    await server.register(
      async (api) => {
        await api.register(instanceRoutesV2);
        await api.register(connectionRoutesV2);
      },
      { prefix: PREFIX },
    );
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    vi.clearAllMocks();
  });

  const call = (method: string, url: string, payload?: unknown) =>
    server.inject({
      method: method as any,
      url: `${PREFIX}${url}`,
      headers: { 'x-api-key': config.apiKey },
      ...(payload === undefined ? {} : { payload }),
    });

  it('returns collections as { items, total }', async () => {
    const res = await call('GET', '/instances');
    expect(res.statusCode).toBe(200);
    expect(res.json().data.total).toBe(2);
    expect(res.json().data.items).toHaveLength(2);
  });

  it('creates an instance with 201 and accepts clientOptions', async () => {
    const res = await call('POST', '/instances', {
      instanceId: 'bot',
      clientOptions: { proxy: 'socks5://proxy.test:1080' },
    });

    expect(res.statusCode).toBe(201);
    expect(manager.createInstance).toHaveBeenCalledWith(
      expect.objectContaining({ clientOptions: { proxy: 'socks5://proxy.test:1080' } }),
    );
  });

  it('keeps the v1 SSRF guard on webhook URLs', async () => {
    const res = await call('POST', '/instances', {
      instanceId: 'bot',
      webhookUrl: 'http://127.0.0.1:4000/hook',
    });

    expect(res.statusCode).toBe(400);
    expect(manager.createInstance).not.toHaveBeenCalled();
  });

  it('acts on connection as a sub-resource', async () => {
    const put = await call('PUT', '/instances/bot/connection');
    expect(put.statusCode).toBe(200);
    expect(client.connect).toHaveBeenCalledOnce();

    const del = await call('DELETE', '/instances/bot/connection');
    expect(del.json().data).toEqual({ connected: false });

    const restart = await call('POST', '/instances/bot/connection-restarts');
    expect(restart.json().data).toEqual({ restarted: true });
    // PUT connected once, the restart reconnected once. DELETE never connects.
    expect(client.connect).toHaveBeenCalledTimes(2);
    expect(client.disconnect).toHaveBeenCalledTimes(2);
  });

  it('reports needsPairing only while a fresh scan is required', async () => {
    manager.getInstance.mockReturnValue(stateFor({ status: 'qr_required' }));
    const waiting = await call('GET', '/instances/bot/connection');
    expect(waiting.json().data.needsPairing).toBe(true);

    manager.getInstance.mockReturnValue(stateFor({ status: 'reconnecting' }));
    const reconnecting = await call('GET', '/instances/bot/connection');
    expect(reconnecting.json().data.needsPairing).toBe(false);
  });

  it('serves the cached QR from the authentication sub-resource', async () => {
    manager.getInstance.mockReturnValue(stateFor({ status: 'qr_required', lastQr: 'QR-STRING' }));
    const found = await call('GET', '/instances/bot/authentication/qr-code');
    expect(found.json().data.qr).toBe('QR-STRING');

    manager.getInstance.mockReturnValue(stateFor({ status: 'connected' }));
    const cleared = await call('GET', '/instances/bot/authentication/qr-code');
    expect(cleared.statusCode).toBe(404);
  });

  it('maps a missing instance to 404', async () => {
    manager.getInstance.mockReturnValue(null);
    manager.getClient.mockReturnValue(null);

    expect((await call('GET', '/instances/nope')).statusCode).toBe(404);
    expect((await call('PUT', '/instances/nope/connection')).statusCode).toBe(404);
  });
});
