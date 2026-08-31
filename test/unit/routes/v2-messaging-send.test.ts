/**
 * v2 send family: one typed path per media kind, and the v1 soft-failure guard
 * that turns miaw-core's `{ success: false }` into a 400 instead of a false 200.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { registerSchemas } from '../../../src/schemas/index.js';
import { errorHandler } from '../../../src/utils/errorHandler.js';
import { messagingSendRoutesV2 } from '../../../src/routes/v2/messaging-send.js';

const PREFIX = '/api/v2';

describe('v2 message sending', () => {
  let server: FastifyInstance;
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let status: string;

  beforeEach(async () => {
    status = 'connected';
    const ok = vi.fn(async () => ({ success: true, messageId: 'MSG-1' }));
    client = {
      sendText: ok,
      sendImage: vi.fn(async () => ({ success: true, messageId: 'MSG-1' })),
      sendVideo: vi.fn(async () => ({ success: true, messageId: 'MSG-1' })),
      sendAudio: vi.fn(async () => ({ success: true, messageId: 'MSG-1' })),
      sendDocument: vi.fn(async () => ({ success: true, messageId: 'MSG-1' })),
      getChatMessages: vi.fn(async () => ({
        success: true,
        messages: [{ id: 'QUOTED-1', raw: {} }],
      })),
      getMessageCounts: vi.fn(() => new Map([['628111@s.whatsapp.net', 1]])),
    };

    const instanceManager = {
      getClient: vi.fn(() => client),
      getInstance: vi.fn(() => ({ instanceId: 'bot', status })),
    };

    server = Fastify({ logger: false });
    server.setErrorHandler(errorHandler);
    server.decorate('instanceManager', instanceManager as any);
    registerSchemas(server);
    await server.register(messagingSendRoutesV2, { prefix: PREFIX });
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    vi.clearAllMocks();
  });

  const post = (url: string, payload: unknown) =>
    server.inject({
      method: 'POST',
      url: `${PREFIX}${url}`,
      headers: { 'x-api-key': config.apiKey },
      payload,
    });

  it('sends text', async () => {
    const res = await post('/instances/bot/messages/text', {
      to: '628111',
      text: 'halo',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ messageId: 'MSG-1', to: '628111' });
    expect(client.sendText).toHaveBeenCalledWith('628111', 'halo', undefined);
  });

  it('exposes one typed path per media kind', async () => {
    await post('/instances/bot/messages/image', { to: '628111', image: 'https://x.test/a.png' });
    await post('/instances/bot/messages/video', {
      to: '628111',
      video: 'https://x.test/a.mp4',
      gifPlayback: true,
    });
    await post('/instances/bot/messages/audio', {
      to: '628111',
      audio: 'https://x.test/a.ogg',
      ptt: true,
    });
    await post('/instances/bot/messages/document', {
      to: '628111',
      document: 'https://x.test/a.pdf',
      fileName: 'a.pdf',
    });

    expect(client.sendImage).toHaveBeenCalledOnce();
    expect(client.sendVideo).toHaveBeenCalledWith(
      '628111',
      'https://x.test/a.mp4',
      expect.objectContaining({ gifPlayback: true }),
    );
    expect(client.sendAudio).toHaveBeenCalledWith(
      '628111',
      'https://x.test/a.ogg',
      expect.objectContaining({ ptt: true }),
    );
    expect(client.sendDocument).toHaveBeenCalledWith(
      '628111',
      'https://x.test/a.pdf',
      expect.objectContaining({ fileName: 'a.pdf' }),
    );
  });

  it('turns a soft failure into 400 instead of a false 200', async () => {
    client.sendText.mockResolvedValue({ success: false, error: 'not-on-whatsapp' });

    const res = await post('/instances/bot/messages/text', { to: '628111', text: 'halo' });

    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });

  it('turns a thrown send error into the same 400', async () => {
    client.sendImage.mockRejectedValue(new Error('upload failed'));

    const res = await post('/instances/bot/messages/image', {
      to: '628111',
      image: 'https://x.test/a.png',
    });

    expect(res.statusCode).toBe(400);
  });

  it('resolves a quoted message before sending', async () => {
    await post('/instances/bot/messages/text', {
      to: '628111',
      text: 'balas',
      chatJid: '628111@s.whatsapp.net',
      quoted: 'QUOTED-1',
    });

    expect(client.sendText).toHaveBeenCalledWith(
      '628111',
      'balas',
      expect.objectContaining({ quoted: expect.objectContaining({ id: 'QUOTED-1' }) }),
    );
  });

  it('404s an unknown quoted message rather than sending unquoted', async () => {
    const res = await post('/instances/bot/messages/text', {
      to: '628111',
      text: 'balas',
      chatJid: '628111@s.whatsapp.net',
      quoted: 'MISSING',
    });

    expect(res.statusCode).toBe(404);
    expect(client.sendText).not.toHaveBeenCalled();
  });

  it('503s when the instance exists but is not connected', async () => {
    status = 'qr_required';

    const res = await post('/instances/bot/messages/text', { to: '628111', text: 'halo' });

    expect(res.statusCode).toBe(503);
    expect(client.sendText).not.toHaveBeenCalled();
  });
});
