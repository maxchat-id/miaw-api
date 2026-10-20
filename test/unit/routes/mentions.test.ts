/**
 * Tagging people (@mentions) in groups.
 *
 * v1 `/send-text` and `/send-media` (what the MaxChat gateway calls) and the
 * v2 text/image/video paths pass `mentions` through to miaw-core instead of
 * dropping it. v1 group info returns each member's phone and LID plus the
 * group's addressing mode, which the "@" picker needs.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { registerSchemas } from '../../../src/schemas/index.js';
import { errorHandler } from '../../../src/utils/errorHandler.js';
import { messagingRoutes } from '../../../src/routes/messaging.js';
import { groupRoutes } from '../../../src/routes/groups.js';
import { messagingSendRoutesV2 } from '../../../src/routes/v2/messaging-send.js';

const GROUP = '120363000000000000@g.us';

describe('tagging people in groups', () => {
  let server: FastifyInstance;
  let client: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    const ok = () => vi.fn(async () => ({ success: true, messageId: 'MSG-1' }));
    client = {
      sendText: ok(),
      sendImage: ok(),
      sendVideo: ok(),
      sendDocument: ok(),
      getChatMessages: vi.fn(async () => ({
        success: true,
        messages: [{ id: 'QUOTED-1', raw: {} }],
      })),
      getMessageCounts: vi.fn(() => new Map([[GROUP, 1]])),
      getGroupParticipants: vi.fn(async () => [
        {
          jid: '6281100000001@s.whatsapp.net',
          role: 'admin',
          phone: '6281100000001',
          lid: '111@lid',
          name: 'Toko',
        },
      ]),
      getGroupInfo: vi.fn(async () => ({
        jid: GROUP,
        name: 'Grup LID',
        createdAt: 1700000000,
        participantCount: 2,
        addressingMode: 'lid',
        participants: [
          {
            jid: '6281100000001@s.whatsapp.net',
            role: 'admin',
            phone: '6281100000001',
            lid: '111@lid',
            name: 'Toko',
          },
          { jid: '222@lid', role: 'member', lid: '222@lid' },
        ],
      })),
    };

    const instanceManager = {
      getClient: vi.fn(() => client),
      getInstance: vi.fn(() => ({ instanceId: 'bot', status: 'connected' })),
    };

    server = Fastify({ logger: false });
    server.setErrorHandler(errorHandler);
    server.decorate('instanceManager', instanceManager as any);
    registerSchemas(server);
    await server.register(messagingRoutes);
    await server.register(groupRoutes);
    await server.register(messagingSendRoutesV2, { prefix: '/api/v2' });
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    vi.clearAllMocks();
  });

  const call = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
    server.inject({ method, url, headers: { 'x-api-key': config.apiKey }, payload });

  it('v1 send-text passes the tagged people', async () => {
    const res = await call('POST', '/instances/bot/send-text', {
      to: GROUP,
      text: '@6281100000001 tolong cek',
      mentions: ['6281100000001'],
    });

    expect(res.statusCode).toBe(200);
    expect(client.sendText).toHaveBeenCalledWith(GROUP, '@6281100000001 tolong cek', {
      mentions: ['6281100000001'],
    });
  });

  it('v1 send-text keeps a quote next to the tags', async () => {
    await call('POST', '/instances/bot/send-text', {
      to: GROUP,
      text: '@6281100000001 ini',
      quoted: 'QUOTED-1',
      chatJid: GROUP,
      mentions: ['6281100000001'],
    });

    expect(client.sendText).toHaveBeenCalledWith(GROUP, '@6281100000001 ini', {
      quoted: expect.objectContaining({ id: 'QUOTED-1' }),
      mentions: ['6281100000001'],
    });
  });

  it('v1 send-text without tags sends no options, as before', async () => {
    await call('POST', '/instances/bot/send-text', { to: GROUP, text: 'halo' });

    expect(client.sendText).toHaveBeenCalledWith(GROUP, 'halo', undefined);
  });

  it('v1 send-media passes tags for image and video captions', async () => {
    await call('POST', '/instances/bot/send-media', {
      to: GROUP,
      media: 'https://x.test/a.png',
      mimetype: 'image/png',
      caption: '@6281100000001 fotonya',
      mentions: ['6281100000001'],
    });
    await call('POST', '/instances/bot/send-media', {
      to: GROUP,
      media: 'https://x.test/a.mp4',
      mimetype: 'video/mp4',
      caption: '@6281100000001 videonya',
      mentions: ['6281100000001'],
    });

    expect(client.sendImage).toHaveBeenCalledWith(
      GROUP,
      'https://x.test/a.png',
      expect.objectContaining({ caption: '@6281100000001 fotonya', mentions: ['6281100000001'] }),
    );
    expect(client.sendVideo).toHaveBeenCalledWith(
      GROUP,
      'https://x.test/a.mp4',
      expect.objectContaining({ mentions: ['6281100000001'] }),
    );
  });

  it('v1 send-media passes tags for a document caption', async () => {
    await call('POST', '/instances/bot/send-media', {
      to: GROUP,
      media: 'https://x.test/a.pdf',
      mimetype: 'application/pdf',
      caption: '@6281100000001 filenya',
      mentions: ['6281100000001'],
    });

    expect(client.sendDocument).toHaveBeenCalledWith(
      GROUP,
      'https://x.test/a.pdf',
      expect.objectContaining({ mentions: ['6281100000001'] }),
    );
  });

  it('accepts a tag given as a JID', async () => {
    const res = await call('POST', '/instances/bot/send-text', {
      to: GROUP,
      text: '@111 halo',
      mentions: ['111111@lid', '6281100000001@s.whatsapp.net'],
    });

    expect(res.statusCode).toBe(200);
  });

  it('v2 text passes the tagged people', async () => {
    const res = await call('POST', '/api/v2/instances/bot/messages/text', {
      to: GROUP,
      text: '@6281100000001 halo',
      mentions: ['6281100000001'],
    });

    expect(res.statusCode).toBe(200);
    expect(client.sendText).toHaveBeenCalledWith(
      GROUP,
      '@6281100000001 halo',
      expect.objectContaining({ mentions: ['6281100000001'] }),
    );
  });

  it.each([
    ['an object', { phone: '6281100000001' }],
    ['a formatted phone', '+62 811-0000-0001'],
    ['a name', 'Budi'],
    ['another JID kind', '6281100000001@c.us'],
  ])('rejects a tag given as %s, instead of sending no tag', async (_, mention) => {
    const res = await call('POST', '/instances/bot/send-text', {
      to: GROUP,
      text: 'halo',
      mentions: [mention],
    });

    expect(res.statusCode).toBe(400);
    expect(client.sendText).not.toHaveBeenCalled();
  });

  it('v1 group participants keep member phone, LID and name', async () => {
    const res = await call('GET', `/instances/bot/groups/${GROUP}/participants`);

    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.json())).toContain('"phone":"6281100000001"');
    expect(JSON.stringify(res.json())).toContain('"lid":"111@lid"');
  });

  it('v1 group info returns member phone, LID and addressing mode', async () => {
    const res = await call('GET', `/instances/bot/groups/${GROUP}`);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      name: 'Grup LID',
      participantCount: 2,
      addressingMode: 'lid',
      participants: [
        {
          jid: '6281100000001@s.whatsapp.net',
          role: 'admin',
          phone: '6281100000001',
          lid: '111@lid',
          name: 'Toko',
        },
        { jid: '222@lid', role: 'member', lid: '222@lid' },
      ],
    });
  });
});
