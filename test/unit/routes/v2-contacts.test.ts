/**
 * v2 contacts: one `:contactId` addresses a contact everywhere, the two v1
 * check routes collapse into one batch, and no response nests a second
 * success flag inside `data`.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { registerSchemas } from '../../../src/schemas/index.js';
import { errorHandler } from '../../../src/utils/errorHandler.js';
import { contactRoutesV2 } from '../../../src/routes/v2/contacts.js';

const PREFIX = '/api/v2';

describe('v2 contacts', () => {
  let server: FastifyInstance;
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let status: string;

  beforeEach(async () => {
    status = 'connected';
    client = {
      fetchAllContacts: vi.fn(async () => ({
        success: true,
        contacts: [{ jid: '628111@s.whatsapp.net', name: 'Ani' }],
      })),
      checkNumbers: vi.fn(async () => [
        { exists: true, jid: '628111@s.whatsapp.net' },
        { exists: false },
      ]),
      getContactInfo: vi.fn(async () => ({ jid: '628111@s.whatsapp.net', name: 'Ani' })),
      addOrEditContact: vi.fn(async () => ({ success: true })),
      removeContact: vi.fn(async () => ({ success: true })),
      getContactProfile: vi.fn(async () => ({ name: 'Ani', status: 'hai' })),
      getProfilePicture: vi.fn(async () => 'https://cdn.test/a.jpg'),
      getBusinessProfile: vi.fn(async () => ({ description: 'Toko' })),
      subscribePresence: vi.fn(async () => undefined),
    };

    server = Fastify({ logger: false });
    server.setErrorHandler(errorHandler);
    server.decorate('instanceManager', {
      getClient: vi.fn(() => client),
      getInstance: vi.fn(() => ({ instanceId: 'bot', status })),
    } as any);
    registerSchemas(server);
    await server.register(contactRoutesV2, { prefix: PREFIX });
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

  it('lists contacts as { items, total }', async () => {
    const res = await call('GET', '/instances/bot/contacts');

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      items: [{ jid: '628111@s.whatsapp.net', name: 'Ani' }],
      total: 1,
    });
  });

  it('checks a single number through the same batch route', async () => {
    const res = await call('POST', '/instances/bot/contacts/checks', { phones: ['628111'] });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.total).toBe(2);
    expect(client.checkNumbers).toHaveBeenCalledWith(['628111']);
  });

  it('caps a check batch at 50 numbers', async () => {
    const res = await call('POST', '/instances/bot/contacts/checks', {
      phones: Array.from({ length: 51 }, (_, i) => `62811100${i}`),
    });

    expect(res.statusCode).toBe(400);
    expect(client.checkNumbers).not.toHaveBeenCalled();
  });

  it('adds a contact with PUT on its own id, without nesting success', async () => {
    const res = await call('PUT', '/instances/bot/contacts/628111', { name: 'Ani' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ contactId: '628111', name: 'Ani' });
    expect(res.json().data).not.toHaveProperty('success');
    expect(client.addOrEditContact).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '628111', name: 'Ani' }),
    );
  });

  it('rejects an unnamed contact rather than saving a blank entry', async () => {
    const res = await call('PUT', '/instances/bot/contacts/628111', {});

    expect(res.statusCode).toBe(400);
    expect(client.addOrEditContact).not.toHaveBeenCalled();
  });

  it('removes a contact by the same id', async () => {
    const res = await call('DELETE', '/instances/bot/contacts/628111');

    expect(res.json().data).toEqual({ contactId: '628111', removed: true });
    expect(client.removeContact).toHaveBeenCalledWith('628111');
  });

  it('surfaces a soft removal failure as 400', async () => {
    client.removeContact.mockResolvedValue({ success: false, error: 'not in phone book' });

    const res = await call('DELETE', '/instances/bot/contacts/628111');

    expect(res.statusCode).toBe(400);
  });

  it('serves the profile sub-resources', async () => {
    expect((await call('GET', '/instances/bot/contacts/628111/profile')).json().data).toEqual({
      name: 'Ani',
      status: 'hai',
    });

    const picture = await call(
      'GET',
      '/instances/bot/contacts/628111/profile-picture?highRes=true',
    );
    expect(picture.json().data).toEqual({ url: 'https://cdn.test/a.jpg' });
    expect(client.getProfilePicture).toHaveBeenCalledWith('628111', true);

    expect(
      (await call('GET', '/instances/bot/contacts/628111/business-profile')).json().data,
    ).toEqual({ description: 'Toko' });
  });

  it('404s a profile that does not exist instead of returning null data', async () => {
    client.getProfilePicture.mockResolvedValue(null);
    client.getContactInfo.mockResolvedValue(null);

    expect((await call('GET', '/instances/bot/contacts/628111/profile-picture')).statusCode).toBe(
      404,
    );
    expect((await call('GET', '/instances/bot/contacts/628111')).statusCode).toBe(404);
  });

  it('subscribes to presence from the contact resource', async () => {
    const res = await call('PUT', '/instances/bot/contacts/628111/presence-subscription');

    expect(res.json().data).toEqual({ contactId: '628111', subscribed: true });
    expect(client.subscribePresence).toHaveBeenCalledWith('628111');
  });

  it('503s every route while the instance is not connected', async () => {
    status = 'disconnected';

    expect((await call('GET', '/instances/bot/contacts')).statusCode).toBe(503);
    expect(
      (await call('POST', '/instances/bot/contacts/checks', { phones: ['628111'] })).statusCode,
    ).toBe(503);
  });
});
