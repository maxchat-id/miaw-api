/**
 * v2 message mutations: the target message is always addressed through the
 * path, and no response buries a second success flag inside `data`.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { registerSchemas } from '../../../src/schemas/index.js';
import { errorHandler } from '../../../src/utils/errorHandler.js';
import { messagingMutationRoutesV2 } from '../../../src/routes/v2/messaging-mutations.js';
import { registerV2Routes } from '../../../src/routes/index.js';

const PREFIX = '/api/v2';
const CHAT = '628111@s.whatsapp.net';

describe('v2 message mutations', () => {
  let server: FastifyInstance;
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let status: string;

  const message = {
    id: 'MSG-1',
    type: 'image',
    media: { mimetype: 'image/png', fileName: 'a.png' },
    raw: {},
  };

  beforeEach(async () => {
    status = 'connected';
    client = {
      getChatMessages: vi.fn(async () => ({ success: true, messages: [message] })),
      getMessageCounts: vi.fn(() => new Map([[CHAT, 1]])),
      editMessage: vi.fn(async () => ({ messageId: 'MSG-1' })),
      deleteMessage: vi.fn(async () => undefined),
      deleteMessageForMe: vi.fn(async () => undefined),
      sendReaction: vi.fn(async () => undefined),
      removeReaction: vi.fn(async () => ({ success: true })),
      forwardMessage: vi.fn(async () => ({ messageId: 'FWD-1' })),
      downloadMedia: vi.fn(async () => Buffer.from('binary-bytes')),
      markAsRead: vi.fn(async () => true),
      loadMoreMessages: vi.fn(async () => ({ messagesLoaded: 20, hasMore: true })),
    };

    server = Fastify({ logger: false });
    server.setErrorHandler(errorHandler);
    server.decorate('instanceManager', {
      getClient: vi.fn(() => client),
      getInstance: vi.fn(() => ({ instanceId: 'bot', status })),
    } as any);
    registerSchemas(server);
    await server.register(messagingMutationRoutesV2, { prefix: PREFIX });
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

  it('edits through the path, not the body', async () => {
    const edit = await call('PATCH', `/instances/bot/messages/MSG-1?chatJid=${CHAT}`, {
      text: 'diperbaiki',
    });

    expect(edit.statusCode).toBe(200);
    expect(client.editMessage).toHaveBeenCalledWith(message, 'diperbaiki');
  });

  it('deletes for everyone by default and for me on request', async () => {
    const everyone = await call('DELETE', `/instances/bot/messages/MSG-1?chatJid=${CHAT}`);
    expect(everyone.json().data).toEqual({ deleted: true, scope: 'everyone' });
    expect(client.deleteMessage).toHaveBeenCalledOnce();

    const me = await call('DELETE', `/instances/bot/messages/MSG-1?chatJid=${CHAT}&scope=me`);
    expect(me.json().data).toEqual({ deleted: true, scope: 'me' });
    expect(client.deleteMessageForMe).toHaveBeenCalledOnce();
  });

  it('sets and removes a reaction on the same sub-resource', async () => {
    const set = await call('PUT', `/instances/bot/messages/MSG-1/reaction?chatJid=${CHAT}`, {
      emoji: '👍',
    });
    expect(set.json().data).toEqual({ messageId: 'MSG-1', emoji: '👍' });

    const removed = await call('DELETE', `/instances/bot/messages/MSG-1/reaction?chatJid=${CHAT}`);
    expect(removed.json().data).toEqual({ messageId: 'MSG-1', removed: true });
  });

  it('surfaces a soft reaction-removal failure as 400', async () => {
    client.removeReaction.mockResolvedValue({ success: false, error: 'no reaction' });

    const res = await call('DELETE', `/instances/bot/messages/MSG-1/reaction?chatJid=${CHAT}`);

    expect(res.statusCode).toBe(400);
  });

  it('forwards to every recipient', async () => {
    const res = await call('POST', `/instances/bot/messages/MSG-1/forward?chatJid=${CHAT}`, {
      to: ['628222', '628333'],
    });

    expect(res.json().data.forwarded).toEqual([
      { to: '628222', messageId: 'FWD-1' },
      { to: '628333', messageId: 'FWD-1' },
    ]);
  });

  it('returns media as raw bytes, not an envelope', async () => {
    const res = await call('GET', `/instances/bot/messages/MSG-1/media?chatJid=${CHAT}`);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-disposition']).toContain('a.png');
    expect(res.rawPayload.toString()).toBe('binary-bytes');
  });

  it('reports a read receipt without nesting a second success flag', async () => {
    const res = await call('PUT', '/instances/bot/messages/MSG-1/read-receipt', {
      fromJid: CHAT,
    });

    expect(res.json().data).toEqual({ messageId: 'MSG-1', read: true });
    expect(res.json().data).not.toHaveProperty('success');
  });

  it('loads chat history as a POST to a collection', async () => {
    const res = await call(
      'POST',
      `/instances/bot/chats/${encodeURIComponent(CHAT)}/message-history-loads`,
      { count: 20 },
    );

    expect(res.json().data).toEqual({ messagesLoaded: 20, hasMore: true });
    expect(client.loadMoreMessages).toHaveBeenCalledWith(CHAT, 20, 15000);
  });

  it('keeps media raw when mounted behind the real v2 envelope hook', async () => {
    // The direct registration above bypasses registerV2Routes, so the opt-out
    // that keeps the envelope off this route is only proven here.
    const mounted = Fastify({ logger: false });
    mounted.setErrorHandler(errorHandler);
    mounted.decorate('instanceManager', {
      getClient: () => client,
      getInstance: () => ({ instanceId: 'bot', status: 'connected' }),
    } as any);
    mounted.decorate('proxyPool', { enabled: false, getStatus: () => ({}) } as any);
    registerSchemas(mounted);
    await registerV2Routes(mounted);
    await mounted.ready();

    try {
      const media = await mounted.inject({
        method: 'GET',
        url: `${PREFIX}/instances/bot/messages/MSG-1/media?chatJid=${CHAT}`,
        headers: { 'x-api-key': config.apiKey },
      });
      expect(media.rawPayload.toString()).toBe('binary-bytes');

      // A sibling route in the same scope still gets the envelope.
      const enveloped = await mounted.inject({
        method: 'DELETE',
        url: `${PREFIX}/instances/bot/messages/MSG-1?chatJid=${CHAT}`,
        headers: { 'x-api-key': config.apiKey },
      });
      expect(enveloped.json()).toEqual({
        success: true,
        data: { deleted: true, scope: 'everyone' },
      });
    } finally {
      await mounted.close();
    }
  });

  it('404s an unknown message and 503s a disconnected instance', async () => {
    client.getChatMessages.mockResolvedValue({ success: true, messages: [] });
    const missing = await call('DELETE', `/instances/bot/messages/NOPE?chatJid=${CHAT}`);
    expect(missing.statusCode).toBe(404);

    status = 'disconnected';
    const down = await call('DELETE', `/instances/bot/messages/MSG-1?chatJid=${CHAT}`);
    expect(down.statusCode).toBe(503);
  });
});
