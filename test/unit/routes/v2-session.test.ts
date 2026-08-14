/**
 * v2 session: three different destructive operations become DELETE on the
 * three different things they destroy, and each reports its outcome inside
 * `data` rather than in a prose `message`.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { registerSchemas } from '../../../src/schemas/index.js';
import { errorHandler } from '../../../src/utils/errorHandler.js';
import { sessionRoutesV2 } from '../../../src/routes/v2/session.js';

const PREFIX = '/api/v2';

describe('v2 session', () => {
  let server: FastifyInstance;
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let manager: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    client = {
      logout: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
      clearSession: vi.fn(() => true),
      getMessageCounts: vi.fn(
        () =>
          new Map([
            ['a@s.whatsapp.net', 3],
            ['b@s.whatsapp.net', 4],
          ]),
      ),
      getRuntimeOptions: vi.fn(() => ({
        debug: false,
        autoReconnect: true,
        maxReconnectAttempts: Infinity,
        reconnectDelay: 3000,
      })),
      setRuntimeOptions: vi.fn((patch: any) => ({
        debug: false,
        autoReconnect: true,
        maxReconnectAttempts: Infinity,
        reconnectDelay: 3000,
        ...patch,
      })),
      getLabelsStoreInfo: vi.fn(() => ({
        size: 2,
        eventCount: 7,
        lastSyncTime: new Date('2026-07-01T00:00:00.000Z'),
      })),
    };
    manager = { getClient: vi.fn(() => client) };

    server = Fastify({ logger: false });
    server.setErrorHandler(errorHandler);
    server.decorate('instanceManager', manager as any);
    registerSchemas(server);
    await server.register(sessionRoutesV2, { prefix: PREFIX });
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

  it('separates logout, session and runtime as three DELETEs', async () => {
    const loggedOut = await call('DELETE', '/instances/bot/authentication');
    expect(loggedOut.json().data).toEqual({ loggedOut: true, sessionCleared: true });
    expect(client.logout).toHaveBeenCalledOnce();

    const cleared = await call('DELETE', '/instances/bot/session');
    expect(cleared.json().data).toEqual({ cleared: true });
    expect(client.clearSession).toHaveBeenCalledOnce();

    const disposed = await call('DELETE', '/instances/bot/runtime');
    expect(disposed.json().data).toEqual({ disposed: true, sessionPreserved: true });
    expect(client.dispose).toHaveBeenCalledOnce();
  });

  it('reports an empty session clear as an outcome, not an error', async () => {
    client.clearSession.mockReturnValue(false);

    const res = await call('DELETE', '/instances/bot/session');

    // The caller wanted it gone and it is gone; false only says there was
    // nothing on disk.
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ cleared: false });
  });

  it('works on a disconnected instance, which is the usual case', async () => {
    // No status check here: disposing or clearing is exactly what you do when
    // an instance is not connected.
    const res = await call('DELETE', '/instances/bot/runtime');

    expect(res.statusCode).toBe(200);
  });

  it('surfaces a failed logout as 503', async () => {
    client.logout.mockRejectedValue(new Error('socket already gone'));

    const res = await call('DELETE', '/instances/bot/authentication');

    expect(res.statusCode).toBe(503);
  });

  it('totals the message store', async () => {
    const res = await call('GET', '/instances/bot/stats/messages');

    expect(res.json().data).toEqual({
      counts: { 'a@s.whatsapp.net': 3, 'b@s.whatsapp.net': 4 },
      totalChats: 2,
      totalMessages: 7,
    });
  });

  it('serialises the label sync time, and nulls it when never synced', async () => {
    const synced = await call('GET', '/instances/bot/stats/labels');
    expect(synced.json().data.lastSyncTime).toBe('2026-07-01T00:00:00.000Z');

    client.getLabelsStoreInfo.mockReturnValue({ size: 0, eventCount: 0, lastSyncTime: undefined });
    const never = await call('GET', '/instances/bot/stats/labels');
    expect(never.json().data.lastSyncTime).toBeNull();
  });

  it('reads the tunable options', async () => {
    const res = await call('GET', '/instances/bot/runtime');

    expect(res.json().data).toEqual({
      debug: false,
      autoReconnect: true,
      maxReconnectAttempts: null,
      reconnectDelay: 3000,
    });
  });

  it('applies only the keys sent, and returns the whole set', async () => {
    const res = await call('PATCH', '/instances/bot/runtime', { autoReconnect: false });

    expect(res.statusCode).toBe(200);
    expect(client.setRuntimeOptions).toHaveBeenCalledWith({ autoReconnect: false });
    expect(res.json().data.autoReconnect).toBe(false);
    expect(res.json().data.reconnectDelay).toBe(3000);
  });

  it('rejects an empty patch', async () => {
    expect((await call('PATCH', '/instances/bot/runtime', {})).statusCode).toBe(400);
    expect(client.setRuntimeOptions).not.toHaveBeenCalled();
  });

  it('404s an unknown instance', async () => {
    manager.getClient.mockReturnValue(null);

    expect((await call('DELETE', '/instances/nope/session')).statusCode).toBe(404);
    expect((await call('GET', '/instances/nope/stats/messages')).statusCode).toBe(404);
  });
});
