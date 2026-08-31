/**
 * v2 groups: one PATCH edits the participant list for all four operations,
 * invites read and revoke on the same path, and per-participant outcomes are
 * reported rather than flattened into one success flag.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { registerSchemas } from '../../../src/schemas/index.js';
import { errorHandler } from '../../../src/utils/errorHandler.js';
import { groupRoutesV2 } from '../../../src/routes/v2/groups.js';

const PREFIX = '/api/v2';
const GROUP = '12345@g.us';

describe('v2 groups', () => {
  let server: FastifyInstance;
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let status: string;

  beforeEach(async () => {
    status = 'connected';
    client = {
      fetchAllGroups: vi.fn(async () => ({
        success: true,
        groups: [{ jid: GROUP, subject: 'Tim' }],
      })),
      createGroup: vi.fn(async () => ({
        success: true,
        groupJid: GROUP,
        groupInfo: { jid: GROUP, subject: 'Tim' },
      })),
      getGroupInfo: vi.fn(async () => ({ jid: GROUP, subject: 'Tim' })),
      updateGroupName: vi.fn(async () => ({ success: true })),
      updateGroupDescription: vi.fn(async () => ({ success: true })),
      leaveGroup: vi.fn(async () => ({ success: true })),
      getGroupParticipants: vi.fn(async () => [{ jid: '628111@s.whatsapp.net', isAdmin: true }]),
      addParticipants: vi.fn(async () => [
        { jid: '628111@s.whatsapp.net', status: '200' },
        { jid: '628222@s.whatsapp.net', status: '409' },
      ]),
      removeParticipants: vi.fn(async () => [{ jid: '628111@s.whatsapp.net', status: '200' }]),
      promoteToAdmin: vi.fn(async () => [{ jid: '628111@s.whatsapp.net', status: '200' }]),
      demoteFromAdmin: vi.fn(async () => [{ jid: '628111@s.whatsapp.net', status: '200' }]),
      updateGroupPicture: vi.fn(async () => ({ success: true })),
      getGroupInviteLink: vi.fn(async () => 'https://chat.whatsapp.com/ABC'),
      revokeGroupInvite: vi.fn(async () => 'https://chat.whatsapp.com/XYZ'),
      getGroupInviteInfo: vi.fn(async () => ({ jid: GROUP, subject: 'Tim' })),
      acceptGroupInvite: vi.fn(async () => GROUP),
    };

    server = Fastify({ logger: false });
    server.setErrorHandler(errorHandler);
    server.decorate('instanceManager', {
      getClient: vi.fn(() => client),
      getInstance: vi.fn(() => ({ instanceId: 'bot', status })),
    } as any);
    registerSchemas(server);
    await server.register(groupRoutesV2, { prefix: PREFIX });
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

  const G = encodeURIComponent(GROUP);

  it('lists groups and participants as { items, total }', async () => {
    expect((await call('GET', '/instances/bot/groups')).json().data.total).toBe(1);
    expect((await call('GET', `/instances/bot/groups/${G}/participants`)).json().data).toEqual({
      items: [{ jid: '628111@s.whatsapp.net', isAdmin: true }],
      total: 1,
    });
  });

  it('creates a group with 201', async () => {
    const res = await call('POST', '/instances/bot/groups', {
      name: 'Tim',
      participants: ['628111'],
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.groupJid).toBe(GROUP);
    expect(client.createGroup).toHaveBeenCalledWith('Tim', ['628111']);
  });

  it('drives all four participant operations from one PATCH', async () => {
    const url = `/instances/bot/groups/${G}/participants`;

    const added = await call('PATCH', url, { operation: 'add', participants: ['628111'] });
    expect(added.json().data.operation).toBe('add');
    expect(client.addParticipants).toHaveBeenCalledWith(GROUP, ['628111']);

    await call('PATCH', url, { operation: 'remove', participants: ['628111'] });
    await call('PATCH', url, { operation: 'promote', participants: ['628111'] });
    await call('PATCH', url, { operation: 'demote', participants: ['628111'] });

    expect(client.removeParticipants).toHaveBeenCalledOnce();
    expect(client.promoteToAdmin).toHaveBeenCalledOnce();
    expect(client.demoteFromAdmin).toHaveBeenCalledOnce();
  });

  it('reports a partial participant outcome instead of collapsing it', async () => {
    const res = await call('PATCH', `/instances/bot/groups/${G}/participants`, {
      operation: 'add',
      participants: ['628111', '628222'],
    });

    // One landed, one was already a member. Both statuses must survive.
    expect(res.statusCode).toBe(200);
    expect(res.json().data.items).toEqual([
      { jid: '628111@s.whatsapp.net', status: '200' },
      { jid: '628222@s.whatsapp.net', status: '409' },
    ]);
  });

  it('rejects an unknown participant operation', async () => {
    const res = await call('PATCH', `/instances/bot/groups/${G}/participants`, {
      operation: 'banish',
      participants: ['628111'],
    });

    expect(res.statusCode).toBe(400);
    expect(client.addParticipants).not.toHaveBeenCalled();
  });

  it('patches subject and description together, naming a half-failure', async () => {
    const ok = await call('PATCH', `/instances/bot/groups/${G}`, {
      name: 'Tim Baru',
      description: 'catatan',
    });
    expect(ok.json().data).toEqual({ name: 'Tim Baru', description: 'catatan' });

    client.updateGroupDescription.mockResolvedValue({ success: false, error: 'not admin' });
    const half = await call('PATCH', `/instances/bot/groups/${G}`, {
      name: 'Tim Baru',
      description: 'catatan',
    });
    expect(half.statusCode).toBe(400);
    expect(half.json().error.message).toContain('description');
  });

  it('rejects an empty group patch', async () => {
    const res = await call('PATCH', `/instances/bot/groups/${G}`, {});

    expect(res.statusCode).toBe(400);
    expect(client.updateGroupName).not.toHaveBeenCalled();
  });

  it('reads and revokes the invite on the same path', async () => {
    const read = await call('GET', `/instances/bot/groups/${G}/invite`);
    expect(read.json().data.link).toBe('https://chat.whatsapp.com/ABC');

    const revoked = await call('DELETE', `/instances/bot/groups/${G}/invite`);
    // Revoking mints a replacement, so the new link comes back with it.
    expect(revoked.json().data).toEqual({
      groupJid: GROUP,
      revoked: true,
      link: 'https://chat.whatsapp.com/XYZ',
    });
  });

  it('inspects and joins an invite from top-level resources', async () => {
    const info = await call('GET', '/instances/bot/group-invites/ABC');
    expect(info.json().data.subject).toBe('Tim');

    const joined = await call('POST', '/instances/bot/group-memberships', { inviteCode: 'ABC' });
    expect(joined.statusCode).toBe(201);
    expect(joined.json().data).toEqual({ groupJid: GROUP, joined: true });
  });

  it('400s a spent invite code rather than reporting a null join', async () => {
    client.acceptGroupInvite.mockResolvedValue(null);

    const res = await call('POST', '/instances/bot/group-memberships', { inviteCode: 'GONE' });

    expect(res.statusCode).toBe(400);
  });

  it('leaves a group and 404s an unknown one', async () => {
    expect((await call('DELETE', `/instances/bot/groups/${G}`)).json().data).toEqual({
      groupJid: GROUP,
      left: true,
    });

    client.getGroupInfo.mockResolvedValue(null);
    expect((await call('GET', `/instances/bot/groups/${G}`)).statusCode).toBe(404);
  });

  it('503s while the instance is not connected', async () => {
    status = 'connecting';

    expect((await call('GET', '/instances/bot/groups')).statusCode).toBe(503);
  });
});
