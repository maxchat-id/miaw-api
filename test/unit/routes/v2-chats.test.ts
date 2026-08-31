/**
 * v2 chats: collections carry their own totals, and chat presence is one
 * writable sub-resource rather than three verb routes.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { registerSchemas } from '../../../src/schemas/index.js';
import { errorHandler } from '../../../src/utils/errorHandler.js';
import { chatRoutesV2 } from '../../../src/routes/v2/chats.js';

const PREFIX = '/api/v2';
const CHAT = '628111@s.whatsapp.net';

describe('v2 chats + presence', () => {
  let server: FastifyInstance;
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let status: string;

  beforeEach(async () => {
    status = 'connected';
    client = {
      fetchAllChats: vi.fn(async () => ({
        success: true,
        chats: [{ jid: CHAT, name: 'Ani' }],
      })),
      getChatMessages: vi.fn(async () => ({
        success: true,
        messages: [{ id: 'MSG-1' }, { id: 'MSG-2' }],
      })),
      sendTyping: vi.fn(async () => undefined),
      sendRecording: vi.fn(async () => undefined),
      stopTyping: vi.fn(async () => undefined),
      setPresence: vi.fn(async () => undefined),
    };

    server = Fastify({ logger: false });
    server.setErrorHandler(errorHandler);
    server.decorate('instanceManager', {
      getClient: vi.fn(() => client),
      getInstance: vi.fn(() => ({ instanceId: 'bot', status })),
    } as any);
    registerSchemas(server);
    await server.register(chatRoutesV2, { prefix: PREFIX });
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

  it('lists chats and chat messages as { items, total }', async () => {
    const chats = await call('GET', '/instances/bot/chats');
    expect(chats.json().data).toEqual({ items: [{ jid: CHAT, name: 'Ani' }], total: 1 });

    const messages = await call('GET', `/instances/bot/chats/${encodeURIComponent(CHAT)}/messages`);
    expect(messages.json().data.total).toBe(2);
    expect(client.getChatMessages).toHaveBeenCalledWith(CHAT);
  });

  it('drives all three chat presence states from one sub-resource', async () => {
    const url = `/instances/bot/chats/${encodeURIComponent(CHAT)}/presence`;

    const typing = await call('PUT', url, { state: 'typing' });
    expect(typing.json().data).toEqual({ chatJid: CHAT, state: 'typing' });
    expect(client.sendTyping).toHaveBeenCalledWith(CHAT);

    await call('PUT', url, { state: 'recording' });
    expect(client.sendRecording).toHaveBeenCalledWith(CHAT);

    await call('PUT', url, { state: 'paused' });
    expect(client.stopTyping).toHaveBeenCalledWith(CHAT);
  });

  it('rejects an unknown presence state', async () => {
    const res = await call('PUT', `/instances/bot/chats/${encodeURIComponent(CHAT)}/presence`, {
      state: 'dancing',
    });

    expect(res.statusCode).toBe(400);
    expect(client.sendTyping).not.toHaveBeenCalled();
  });

  it('sets account-wide presence without echoing a bare success', async () => {
    const res = await call('PUT', '/instances/bot/presence', { status: 'unavailable' });

    expect(res.json().data).toEqual({ status: 'unavailable' });
    expect(res.json().data).not.toHaveProperty('success');
    expect(client.setPresence).toHaveBeenCalledWith('unavailable');
  });

  it('surfaces a failed store read as 400', async () => {
    client.fetchAllChats.mockResolvedValue({ success: false, error: 'store empty' });

    const res = await call('GET', '/instances/bot/chats');

    expect(res.statusCode).toBe(400);
  });

  it('503s while the instance is not connected', async () => {
    status = 'reconnecting';

    expect((await call('GET', '/instances/bot/chats')).statusCode).toBe(503);
    expect((await call('PUT', '/instances/bot/presence', { status: 'available' })).statusCode).toBe(
      503,
    );
  });
});
