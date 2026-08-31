/**
 * Capabilities miaw-core has always exposed but v1 never routed: the extra
 * send kinds, message starring, and the chat flags. They follow the same
 * shapes as the ported routes — PUT/DELETE pairs for state, a typed path per
 * media kind, and soft failures surfaced as 400.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { registerSchemas } from '../../../src/schemas/index.js';
import { errorHandler } from '../../../src/utils/errorHandler.js';
import { messagingSendRoutesV2 } from '../../../src/routes/v2/messaging-send.js';
import { messagingMutationRoutesV2 } from '../../../src/routes/v2/messaging-mutations.js';
import { chatRoutesV2 } from '../../../src/routes/v2/chats.js';

const PREFIX = '/api/v2';
const CHAT = '628111@s.whatsapp.net';
const C = encodeURIComponent(CHAT);

describe('v2 capabilities beyond the v1 port', () => {
  let server: FastifyInstance;
  let client: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    const ok = () => vi.fn(async () => ({ success: true }));
    client = {
      sendLocation: vi.fn(async () => ({ success: true, messageId: 'M1' })),
      sendContact: vi.fn(async () => ({ success: true, messageId: 'M2' })),
      sendSticker: vi.fn(async () => ({ success: true, messageId: 'M3' })),
      sendPoll: vi.fn(async () => ({ success: true, messageId: 'M4' })),
      starMessage: ok(),
      unstarMessage: ok(),
      archiveChat: ok(),
      unarchiveChat: ok(),
      pinChat: ok(),
      unpinChat: ok(),
      muteChat: ok(),
      unmuteChat: ok(),
      markChatRead: ok(),
      markChatUnread: ok(),
      clearChat: ok(),
      deleteChat: ok(),
      getChatMessages: vi.fn(async () => ({ success: true, messages: [{ id: 'MSG-1', raw: {} }] })),
      getMessageCounts: vi.fn(() => new Map([[CHAT, 1]])),
    };

    server = Fastify({ logger: false });
    server.setErrorHandler(errorHandler);
    server.decorate('instanceManager', {
      getClient: vi.fn(() => client),
      getInstance: vi.fn(() => ({ instanceId: 'bot', status: 'connected' })),
    } as any);
    registerSchemas(server);
    await server.register(
      async (api) => {
        await api.register(messagingSendRoutesV2);
        await api.register(messagingMutationRoutesV2);
        await api.register(chatRoutesV2);
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

  describe('send kinds', () => {
    it('sends a location', async () => {
      const res = await call('POST', '/instances/bot/messages/location', {
        to: '628111',
        latitude: -6.2,
        longitude: 106.8,
        name: 'Monas',
      });

      expect(res.statusCode).toBe(200);
      expect(client.sendLocation).toHaveBeenCalledWith(
        '628111',
        -6.2,
        106.8,
        expect.objectContaining({ name: 'Monas' }),
      );
    });

    it('rejects coordinates off the globe', async () => {
      const res = await call('POST', '/instances/bot/messages/location', {
        to: '628111',
        latitude: 120,
        longitude: 106.8,
      });

      expect(res.statusCode).toBe(400);
      expect(client.sendLocation).not.toHaveBeenCalled();
    });

    it('sends contact cards', async () => {
      const res = await call('POST', '/instances/bot/messages/contact', {
        to: '628111',
        contacts: [{ fullName: 'Ani', phone: '628222', organization: 'Toko' }],
      });

      expect(res.statusCode).toBe(200);
      expect(client.sendContact).toHaveBeenCalledWith(
        '628111',
        [{ fullName: 'Ani', phone: '628222', organization: 'Toko' }],
        expect.anything(),
      );
    });

    it('sends a sticker', async () => {
      const res = await call('POST', '/instances/bot/messages/sticker', {
        to: '628111',
        sticker: 'https://x.test/a.webp',
      });

      expect(res.statusCode).toBe(200);
      expect(client.sendSticker).toHaveBeenCalledOnce();
    });

    it('sends a poll and defaults selectableCount', async () => {
      const res = await call('POST', '/instances/bot/messages/poll', {
        to: '628111',
        name: 'Makan siang?',
        options: ['Nasi', 'Mie'],
      });

      expect(res.statusCode).toBe(200);
      expect(client.sendPoll).toHaveBeenCalledWith(
        '628111',
        'Makan siang?',
        ['Nasi', 'Mie'],
        expect.objectContaining({ selectableCount: 1 }),
      );
    });

    it('rejects a poll with one option', async () => {
      const res = await call('POST', '/instances/bot/messages/poll', {
        to: '628111',
        name: 'Makan siang?',
        options: ['Nasi'],
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects selecting more options than exist', async () => {
      const res = await call('POST', '/instances/bot/messages/poll', {
        to: '628111',
        name: 'Makan siang?',
        options: ['Nasi', 'Mie'],
        selectableCount: 3,
      });

      expect(res.statusCode).toBe(400);
      expect(client.sendPoll).not.toHaveBeenCalled();
    });
  });

  describe('message star', () => {
    it('stars and unstars on the same path', async () => {
      const starred = await call('PUT', `/instances/bot/messages/MSG-1/star?chatJid=${C}`);
      expect(starred.json().data).toEqual({ messageId: 'MSG-1', starred: true });

      const cleared = await call('DELETE', `/instances/bot/messages/MSG-1/star?chatJid=${C}`);
      expect(cleared.json().data).toEqual({ messageId: 'MSG-1', starred: false });
    });

    it('surfaces a soft star failure as 400', async () => {
      client.starMessage.mockResolvedValue({ success: false, error: 'not allowed' });

      const res = await call('PUT', `/instances/bot/messages/MSG-1/star?chatJid=${C}`);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('chat flags', () => {
    it('sets and clears archive and pin', async () => {
      expect((await call('PUT', `/instances/bot/chats/${C}/archive`)).json().data).toEqual({
        chatJid: CHAT,
        archived: true,
      });
      expect((await call('DELETE', `/instances/bot/chats/${C}/archive`)).json().data).toEqual({
        chatJid: CHAT,
        archived: false,
      });
      expect((await call('PUT', `/instances/bot/chats/${C}/pin`)).json().data.pinned).toBe(true);
      expect((await call('DELETE', `/instances/bot/chats/${C}/pin`)).json().data.pinned).toBe(
        false,
      );
    });

    it('mutes with an explicit duration and without one', async () => {
      await call('PUT', `/instances/bot/chats/${C}/mute`, { durationMs: 60000 });
      expect(client.muteChat).toHaveBeenCalledWith(CHAT, 60000);

      // WhatsApp stores an expiry rather than a flag, so a bodyless mute has to
      // fall through to miaw-core's own default.
      const bare = await call('PUT', `/instances/bot/chats/${C}/mute`);
      expect(bare.statusCode).toBe(200);
      expect(client.muteChat).toHaveBeenLastCalledWith(CHAT, undefined);

      await call('DELETE', `/instances/bot/chats/${C}/mute`);
      expect(client.unmuteChat).toHaveBeenCalledOnce();
    });

    it('sets the chat read state both ways', async () => {
      await call('PUT', `/instances/bot/chats/${C}/read-state`, { state: 'read' });
      expect(client.markChatRead).toHaveBeenCalledWith(CHAT);

      await call('PUT', `/instances/bot/chats/${C}/read-state`, { state: 'unread' });
      expect(client.markChatUnread).toHaveBeenCalledWith(CHAT);

      const bad = await call('PUT', `/instances/bot/chats/${C}/read-state`, { state: 'maybe' });
      expect(bad.statusCode).toBe(400);
    });

    it('separates clearing messages from deleting the chat', async () => {
      const cleared = await call('DELETE', `/instances/bot/chats/${C}/messages`);
      expect(cleared.json().data).toEqual({ chatJid: CHAT, cleared: true });
      expect(client.clearChat).toHaveBeenCalledOnce();
      expect(client.deleteChat).not.toHaveBeenCalled();

      const deleted = await call('DELETE', `/instances/bot/chats/${C}`);
      expect(deleted.json().data).toEqual({ chatJid: CHAT, deleted: true });
      expect(client.deleteChat).toHaveBeenCalledOnce();
    });

    it('surfaces a soft chat failure as 400', async () => {
      client.archiveChat.mockResolvedValue({ success: false, error: 'chat unknown' });

      const res = await call('PUT', `/instances/bot/chats/${C}/archive`);

      expect(res.statusCode).toBe(400);
    });
  });
});
