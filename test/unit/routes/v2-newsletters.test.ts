/**
 * v2 newsletters: follow/mute/picture become repeatable PUT/DELETE pairs, one
 * PATCH covers name and description, and miaw-core's bare `false` becomes a
 * 400 rather than a reported success.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { registerSchemas } from '../../../src/schemas/index.js';
import { errorHandler } from '../../../src/utils/errorHandler.js';
import { newsletterRoutesV2 } from '../../../src/routes/v2/newsletters.js';

const PREFIX = '/api/v2';
const NL = '12345@newsletter';
const N = encodeURIComponent(NL);

describe('v2 newsletters', () => {
  let server: FastifyInstance;
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let status: string;

  beforeEach(async () => {
    status = 'connected';
    client = {
      createNewsletter: vi.fn(async () => ({ success: true, newsletterId: NL })),
      getNewsletterMetadata: vi.fn(async () => ({ id: NL, name: 'Kabar' })),
      updateNewsletterName: vi.fn(async () => true),
      updateNewsletterDescription: vi.fn(async () => true),
      deleteNewsletter: vi.fn(async () => true),
      fetchNewsletterMessages: vi.fn(async () => ({
        success: true,
        messages: [{ id: 'M1' }],
        nextCursor: 'CUR',
      })),
      sendNewsletterMessage: vi.fn(async () => ({ success: true, messageId: 'M1' })),
      sendNewsletterImage: vi.fn(async () => ({ success: true, messageId: 'M2' })),
      sendNewsletterVideo: vi.fn(async () => ({ success: true, messageId: 'M3' })),
      followNewsletter: vi.fn(async () => true),
      unfollowNewsletter: vi.fn(async () => true),
      muteNewsletter: vi.fn(async () => true),
      unmuteNewsletter: vi.fn(async () => true),
      subscribeNewsletterUpdates: vi.fn(async () => true),
      updateNewsletterPicture: vi.fn(async () => true),
      removeNewsletterPicture: vi.fn(async () => true),
      getNewsletterSubscribers: vi.fn(async () => ({ subscriberCount: 12 })),
      getNewsletterAdminCount: vi.fn(async () => 3),
      changeNewsletterOwner: vi.fn(async () => true),
      demoteNewsletterAdmin: vi.fn(async () => true),
      reactToNewsletterMessage: vi.fn(async () => true),
    };

    server = Fastify({ logger: false });
    server.setErrorHandler(errorHandler);
    server.decorate('instanceManager', {
      getClient: vi.fn(() => client),
      getInstance: vi.fn(() => ({ instanceId: 'bot', status })),
    } as any);
    registerSchemas(server);
    await server.register(newsletterRoutesV2, { prefix: PREFIX });
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

  it('creates with 201 and reads metadata', async () => {
    const created = await call('POST', '/instances/bot/newsletters', { name: 'Kabar' });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.newsletterId).toBe(NL);

    const read = await call('GET', `/instances/bot/newsletters/${N}`);
    expect(read.json().data).toEqual({ id: NL, name: 'Kabar' });
  });

  it('patches name and description together, naming a half-failure', async () => {
    const ok = await call('PATCH', `/instances/bot/newsletters/${N}`, {
      name: 'Kabar Baru',
      description: 'harian',
    });
    expect(ok.json().data).toEqual({ name: 'Kabar Baru', description: 'harian' });

    client.updateNewsletterDescription.mockResolvedValue(false);
    const half = await call('PATCH', `/instances/bot/newsletters/${N}`, {
      name: 'Kabar Baru',
      description: 'harian',
    });
    expect(half.statusCode).toBe(400);
    expect(half.json().error.message).toContain('description');
  });

  it('rejects an empty patch', async () => {
    const res = await call('PATCH', `/instances/bot/newsletters/${N}`, {});

    expect(res.statusCode).toBe(400);
    expect(client.updateNewsletterName).not.toHaveBeenCalled();
  });

  it('posts each media kind on its own path', async () => {
    await call('POST', `/instances/bot/newsletters/${N}/messages/text`, { text: 'halo' });
    await call('POST', `/instances/bot/newsletters/${N}/messages/image`, {
      image: 'https://x.test/a.png',
      caption: 'foto',
    });
    await call('POST', `/instances/bot/newsletters/${N}/messages/video`, {
      video: 'https://x.test/a.mp4',
    });

    expect(client.sendNewsletterMessage).toHaveBeenCalledWith(NL, 'halo');
    expect(client.sendNewsletterImage).toHaveBeenCalledWith(NL, 'https://x.test/a.png', 'foto');
    expect(client.sendNewsletterVideo).toHaveBeenCalledWith(NL, 'https://x.test/a.mp4', undefined);
  });

  it('keeps the soft-failure guard on posts', async () => {
    client.sendNewsletterMessage.mockResolvedValue({ success: false, error: 'not an admin' });

    const res = await call('POST', `/instances/bot/newsletters/${N}/messages/text`, {
      text: 'halo',
    });

    expect(res.statusCode).toBe(400);
  });

  it('drives follow and mute as repeatable PUT/DELETE pairs', async () => {
    expect((await call('PUT', `/instances/bot/newsletters/${N}/follow`)).json().data).toEqual({
      newsletterId: NL,
      following: true,
    });
    expect((await call('DELETE', `/instances/bot/newsletters/${N}/follow`)).json().data).toEqual({
      newsletterId: NL,
      following: false,
    });
    expect((await call('PUT', `/instances/bot/newsletters/${N}/mute`)).json().data).toEqual({
      newsletterId: NL,
      muted: true,
    });
    expect((await call('DELETE', `/instances/bot/newsletters/${N}/mute`)).json().data).toEqual({
      newsletterId: NL,
      muted: false,
    });
  });

  it('turns a bare false from miaw-core into 400, not a reported success', async () => {
    client.followNewsletter.mockResolvedValue(false);

    const res = await call('PUT', `/instances/bot/newsletters/${N}/follow`);

    expect(res.statusCode).toBe(400);
  });

  it('returns the message cursor inside data', async () => {
    const res = await call('GET', `/instances/bot/newsletters/${N}/messages?count=10`);

    expect(res.json().data).toEqual({ items: [{ id: 'M1' }], total: 1, nextCursor: 'CUR' });
    expect(client.fetchNewsletterMessages).toHaveBeenCalledWith(NL, 10, undefined, 0);
  });

  it('sets and removes the picture, and subscribes to updates', async () => {
    const set = await call('PUT', `/instances/bot/newsletters/${N}/picture`, {
      url: 'https://cdn.test/a.jpg',
    });
    expect(set.json().data).toEqual({ newsletterId: NL, updated: true });

    const removed = await call('DELETE', `/instances/bot/newsletters/${N}/picture`);
    expect(removed.json().data).toEqual({ newsletterId: NL, removed: true });

    const subscribed = await call('PUT', `/instances/bot/newsletters/${N}/updates-subscription`);
    expect(subscribed.json().data).toEqual({ newsletterId: NL, subscribed: true });
  });

  it('reads subscribers and admin count', async () => {
    expect((await call('GET', `/instances/bot/newsletters/${N}/subscribers`)).json().data).toEqual({
      subscriberCount: 12,
    });
    expect((await call('GET', `/instances/bot/newsletters/${N}/admins/count`)).json().data).toEqual(
      {
        newsletterId: NL,
        count: 3,
      },
    );
  });

  it('404s a newsletter whose admin count is unavailable', async () => {
    client.getNewsletterAdminCount.mockResolvedValue(null);

    const res = await call('GET', `/instances/bot/newsletters/${N}/admins/count`);

    expect(res.statusCode).toBe(404);
  });

  it('transfers ownership and demotes an admin', async () => {
    const owner = await call('PATCH', `/instances/bot/newsletters/${N}/owner`, {
      newOwnerJid: '628222@s.whatsapp.net',
    });
    expect(owner.json().data.owner).toBe('628222@s.whatsapp.net');

    const demoted = await call(
      'DELETE',
      `/instances/bot/newsletters/${N}/admins/${encodeURIComponent('628222@s.whatsapp.net')}`,
    );
    expect(demoted.json().data.demoted).toBe(true);
  });

  it('clears a message reaction with an empty emoji', async () => {
    await call('PUT', `/instances/bot/newsletters/${N}/messages/M1/reaction`, { emoji: '👍' });
    expect(client.reactToNewsletterMessage).toHaveBeenCalledWith(NL, 'M1', '👍');

    await call('DELETE', `/instances/bot/newsletters/${N}/messages/M1/reaction`);
    expect(client.reactToNewsletterMessage).toHaveBeenLastCalledWith(NL, 'M1', '');
  });

  it('503s while the instance is not connected', async () => {
    status = 'disconnected';

    expect((await call('GET', `/instances/bot/newsletters/${N}`)).statusCode).toBe(503);
  });
});
