/**
 * Fastify runs ajv with `removeAdditional`, so `additionalProperties: false`
 * strips an unknown key and answers 200 rather than rejecting it. Every v2
 * route would otherwise accept a misspelled or unsupported field and report
 * success while discarding it.
 *
 * registerV2Routes walks each inline request schema and restates the allowed
 * keys under `propertyNames`, which removal does not apply to. Schemas shared
 * with v1 through `$ref` get a strict `v2`-prefixed twin instead, so v1 keeps
 * the lenient behaviour its callers may rely on.
 *
 * These tests mount through registerV2Routes, since registering a module
 * directly bypasses the hook.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { registerSchemas } from '../../../src/schemas/index.js';
import { errorHandler } from '../../../src/utils/errorHandler.js';
import { registerV2Routes } from '../../../src/routes/index.js';

const PREFIX = '/api/v2';
const CHAT = '628111@s.whatsapp.net';
const C = encodeURIComponent(CHAT);

describe('v2 rejects unknown request fields', () => {
  let server: FastifyInstance;
  let client: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    client = {
      sendText: vi.fn(async () => ({ success: true, messageId: 'M1' })),
      createInstance: vi.fn(async () => ({ instanceId: 'bot2', status: 'disconnected' })),
      sendContact: vi.fn(async () => ({ success: true, messageId: 'M2' })),
      getChatMessages: vi.fn(async () => ({ success: true, messages: [] })),
      getMessageCounts: vi.fn(() => new Map()),
      muteChat: vi.fn(async () => ({ success: true })),
      createGroup: vi.fn(async () => ({ success: true, groupJid: '1@g.us' })),
      getRuntimeOptions: vi.fn(() => ({
        debug: false,
        autoReconnect: true,
        maxReconnectAttempts: 5,
        reconnectDelay: 3000,
      })),
      setRuntimeOptions: vi.fn((patch: any) => ({
        debug: false,
        autoReconnect: true,
        maxReconnectAttempts: 5,
        reconnectDelay: 3000,
        ...patch,
      })),
    };

    server = Fastify({ logger: false });
    server.setErrorHandler(errorHandler);
    server.decorate('instanceManager', {
      getClient: vi.fn(() => client),
      getInstance: vi.fn(() => ({ instanceId: 'bot', status: 'connected' })),
      createInstance: client.createInstance,
      listInstances: vi.fn(() => []),
    } as any);
    server.decorate('proxyPool', { enabled: false, getStatus: () => ({}) } as any);
    server.decorate('webhookDispatcher', { getStats: () => ({}) } as any);
    registerSchemas(server);
    await registerV2Routes(server);
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

  it('rejects an unknown key alongside valid ones', async () => {
    // The dangerous shape: the request looks like it worked because the known
    // half did, while the unknown half vanished.
    const res = await call('PATCH', '/instances/bot/runtime', {
      autoReconnect: false,
      proxy: 'socks5://proxy.test:1080',
    });

    expect(res.statusCode).toBe(400);
    expect(client.setRuntimeOptions).not.toHaveBeenCalled();
  });

  it('rejects a misspelled field rather than ignoring it', async () => {
    const res = await call('PUT', `/instances/bot/chats/${C}/mute`, { duration: 60000 });

    expect(res.statusCode).toBe(400);
    expect(client.muteChat).not.toHaveBeenCalled();
  });

  it('reaches nested object schemas', async () => {
    // contacts[] items carry their own additionalProperties: false, so the
    // walk has to recurse rather than stop at the top level.
    const res = await call('POST', '/instances/bot/messages/contact', {
      to: '628111',
      contacts: [{ fullName: 'Ani', phone: '628222', nickname: 'An' }],
    });

    expect(res.statusCode).toBe(400);
    expect(client.sendContact).not.toHaveBeenCalled();
  });

  it('still accepts a request that only uses known keys', async () => {
    const res = await call('POST', '/instances/bot/messages/contact', {
      to: '628111',
      contacts: [{ fullName: 'Ani', phone: '628222' }],
    });

    expect(res.statusCode).toBe(200);
    expect(client.sendContact).toHaveBeenCalledOnce();
  });

  it('leaves a bodyless request valid where the schema allows one', async () => {
    // The guard must not turn `nullable: true` bodies into 400s.
    const res = await call('PUT', `/instances/bot/chats/${C}/mute`);

    expect(res.statusCode).toBe(200);
    expect(client.muteChat).toHaveBeenCalledWith(CHAT, undefined);
  });

  it('rejects an unknown key in a $ref body through the v2 twin', async () => {
    // sendText# stays lenient for v1; v2 points at v2SendText#, a strict clone.
    const res = await call('POST', '/instances/bot/messages/text', {
      to: '628111',
      text: 'halo',
      unknownField: true,
    });

    expect(res.statusCode).toBe(400);
    expect(client.sendText).not.toHaveBeenCalled();
  });

  it('still accepts the same $ref body without the unknown key', async () => {
    const res = await call('POST', '/instances/bot/messages/text', {
      to: '628111',
      text: 'halo',
    });

    expect(res.statusCode).toBe(200);
    expect(client.sendText).toHaveBeenCalledOnce();
  });

  it('reaches a nested $ref: clientOptions.proxy resolves to the strict twin', async () => {
    const res = await call('POST', '/instances', {
      instanceId: 'bot2',
      clientOptions: {
        proxy: { url: 'socks5://proxy.test:1080', realm: 'nope' },
      },
    });

    expect(res.statusCode).toBe(400);
  });
});
