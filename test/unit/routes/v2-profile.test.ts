/**
 * v2 profile: one PATCH covers both fields, and no mutation answers with a
 * bare `data: { success }`.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { registerSchemas } from '../../../src/schemas/index.js';
import { errorHandler } from '../../../src/utils/errorHandler.js';
import { profileRoutesV2 } from '../../../src/routes/v2/profile.js';

const PREFIX = '/api/v2';

describe('v2 profile', () => {
  let server: FastifyInstance;
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let status: string;

  beforeEach(async () => {
    status = 'connected';
    client = {
      getOwnProfile: vi.fn(async () => ({ phone: '628111', name: 'Bot' })),
      updateProfileName: vi.fn(async () => ({ success: true })),
      updateProfileStatus: vi.fn(async () => ({ success: true })),
      updateProfilePicture: vi.fn(async () => ({ success: true })),
      removeProfilePicture: vi.fn(async () => ({ success: true })),
    };

    server = Fastify({ logger: false });
    server.setErrorHandler(errorHandler);
    server.decorate('instanceManager', {
      getClient: vi.fn(() => client),
      getInstance: vi.fn(() => ({ instanceId: 'bot', status })),
    } as any);
    registerSchemas(server);
    await server.register(profileRoutesV2, { prefix: PREFIX });
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

  it('reads the own profile', async () => {
    const res = await call('GET', '/instances/bot/profile');

    expect(res.json().data).toEqual({ phone: '628111', name: 'Bot' });
  });

  it('updates both fields in one request', async () => {
    const res = await call('PATCH', '/instances/bot/profile', {
      name: 'Bot Baru',
      status: 'sibuk',
    });

    expect(res.json().data).toEqual({ name: 'Bot Baru', status: 'sibuk' });
    expect(client.updateProfileName).toHaveBeenCalledWith('Bot Baru');
    expect(client.updateProfileStatus).toHaveBeenCalledWith('sibuk');
  });

  it('touches only the field that was sent', async () => {
    await call('PATCH', '/instances/bot/profile', { status: 'sibuk' });

    expect(client.updateProfileName).not.toHaveBeenCalled();
    expect(client.updateProfileStatus).toHaveBeenCalledOnce();
  });

  it('rejects an empty patch instead of reporting a no-op success', async () => {
    const res = await call('PATCH', '/instances/bot/profile', {});

    expect(res.statusCode).toBe(400);
    expect(client.updateProfileName).not.toHaveBeenCalled();
  });

  it('names the failing field when a partial update half-fails', async () => {
    client.updateProfileStatus.mockResolvedValue({ success: false, error: 'rate limited' });

    const res = await call('PATCH', '/instances/bot/profile', {
      name: 'Bot Baru',
      status: 'sibuk',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('status');
    // The name did go through, so the response must not imply otherwise.
    expect(client.updateProfileName).toHaveBeenCalledOnce();
  });

  it('sets and removes the picture without echoing a bare success', async () => {
    const set = await call('PUT', '/instances/bot/profile/picture', {
      url: 'https://cdn.test/a.jpg',
    });
    expect(set.json().data).toEqual({ updated: true });
    expect(set.json().data).not.toHaveProperty('success');

    const removed = await call('DELETE', '/instances/bot/profile/picture');
    expect(removed.json().data).toEqual({ removed: true });
  });

  it('surfaces a soft picture failure as 400', async () => {
    client.updateProfilePicture.mockResolvedValue({ success: false, error: 'too large' });

    const res = await call('PUT', '/instances/bot/profile/picture', {
      url: 'https://cdn.test/a.jpg',
    });

    expect(res.statusCode).toBe(400);
  });

  it('503s while the instance is not connected', async () => {
    status = 'qr_required';

    expect((await call('GET', '/instances/bot/profile')).statusCode).toBe(503);
  });
});
