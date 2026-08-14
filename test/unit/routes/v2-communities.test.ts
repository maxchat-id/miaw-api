/**
 * v2 communities: the same vocabulary as groups, plus the linked-groups
 * sub-resource that only communities have.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { registerSchemas } from '../../../src/schemas/index.js';
import { errorHandler } from '../../../src/utils/errorHandler.js';
import { communityRoutesV2 } from '../../../src/routes/v2/communities.js';

const PREFIX = '/api/v2';
const COMMUNITY = '9999@g.us';
const GROUP = '12345@g.us';
const K = encodeURIComponent(COMMUNITY);
const G = encodeURIComponent(GROUP);

describe('v2 communities', () => {
  let server: FastifyInstance;
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let status: string;

  beforeEach(async () => {
    status = 'connected';
    client = {
      getAllCommunities: vi.fn(async () => [{ jid: COMMUNITY, subject: 'Warga' }]),
      createCommunity: vi.fn(async () => ({
        success: true,
        communityJid: COMMUNITY,
        communityInfo: { jid: COMMUNITY, subject: 'Warga' },
      })),
      getCommunityInfo: vi.fn(async () => ({ jid: COMMUNITY, subject: 'Warga' })),
      updateCommunityName: vi.fn(async () => ({ success: true })),
      updateCommunityDescription: vi.fn(async () => ({ success: true })),
      leaveCommunity: vi.fn(async () => ({ success: true })),
      getCommunityParticipants: vi.fn(async () => [{ jid: '628111@s.whatsapp.net' }]),
      addCommunityMembers: vi.fn(async () => [
        { jid: '628111@s.whatsapp.net', status: '200' },
        { jid: '628222@s.whatsapp.net', status: '409' },
      ]),
      removeCommunityMembers: vi.fn(async () => [{ jid: '628111@s.whatsapp.net', status: '200' }]),
      promoteCommunityMembers: vi.fn(async () => [{ jid: '628111@s.whatsapp.net', status: '200' }]),
      demoteCommunityMembers: vi.fn(async () => [{ jid: '628111@s.whatsapp.net', status: '200' }]),
      createCommunityGroup: vi.fn(async () => ({ success: true, groupJid: GROUP })),
      getLinkedGroups: vi.fn(async () => [{ jid: GROUP, subject: 'Tim' }]),
      linkGroupToCommunity: vi.fn(async () => ({ success: true })),
      unlinkGroupFromCommunity: vi.fn(async () => ({ success: true })),
      getCommunityInviteLink: vi.fn(async () => 'https://chat.whatsapp.com/ABC'),
      revokeCommunityInvite: vi.fn(async () => 'https://chat.whatsapp.com/XYZ'),
      getCommunityInviteInfo: vi.fn(async () => ({ jid: COMMUNITY, subject: 'Warga' })),
      acceptCommunityInvite: vi.fn(async () => COMMUNITY),
    };

    server = Fastify({ logger: false });
    server.setErrorHandler(errorHandler);
    server.decorate('instanceManager', {
      getClient: vi.fn(() => client),
      getInstance: vi.fn(() => ({ instanceId: 'bot', status })),
    } as any);
    registerSchemas(server);
    await server.register(communityRoutesV2, { prefix: PREFIX });
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

  it('lists communities, participants and linked groups as { items, total }', async () => {
    expect((await call('GET', '/instances/bot/communities')).json().data.total).toBe(1);
    expect(
      (await call('GET', `/instances/bot/communities/${K}/participants`)).json().data.total,
    ).toBe(1);
    expect(
      (await call('GET', `/instances/bot/communities/${K}/linked-groups`)).json().data,
    ).toEqual({ items: [{ jid: GROUP, subject: 'Tim' }], total: 1 });
  });

  it('creates a community with 201', async () => {
    const res = await call('POST', '/instances/bot/communities', {
      name: 'Warga',
      description: 'RT 05',
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.communityJid).toBe(COMMUNITY);
    expect(client.createCommunity).toHaveBeenCalledWith('Warga', 'RT 05');
  });

  it('drives all four participant operations from one PATCH', async () => {
    const url = `/instances/bot/communities/${K}/participants`;

    await call('PATCH', url, { operation: 'add', participants: ['628111'] });
    await call('PATCH', url, { operation: 'remove', participants: ['628111'] });
    await call('PATCH', url, { operation: 'promote', participants: ['628111'] });
    await call('PATCH', url, { operation: 'demote', participants: ['628111'] });

    expect(client.addCommunityMembers).toHaveBeenCalledOnce();
    expect(client.removeCommunityMembers).toHaveBeenCalledOnce();
    expect(client.promoteCommunityMembers).toHaveBeenCalledOnce();
    expect(client.demoteCommunityMembers).toHaveBeenCalledOnce();
  });

  it('keeps a partial participant outcome', async () => {
    const res = await call('PATCH', `/instances/bot/communities/${K}/participants`, {
      operation: 'add',
      participants: ['628111', '628222'],
    });

    expect(res.json().data.items).toEqual([
      { jid: '628111@s.whatsapp.net', status: '200' },
      { jid: '628222@s.whatsapp.net', status: '409' },
    ]);
  });

  it('creates a group already inside the community', async () => {
    const res = await call('POST', `/instances/bot/communities/${K}/groups`, {
      name: 'Tim',
      participants: ['628111'],
    });

    expect(res.statusCode).toBe(201);
    expect(client.createCommunityGroup).toHaveBeenCalledWith(COMMUNITY, 'Tim', ['628111']);
  });

  it('links and unlinks a group, passing the arguments in core order', async () => {
    const linked = await call('PUT', `/instances/bot/communities/${K}/linked-groups`, {
      groupJid: GROUP,
    });
    expect(linked.json().data).toEqual({ communityJid: COMMUNITY, groupJid: GROUP, linked: true });
    // miaw-core takes (groupJid, communityJid) - the reverse of the path order.
    expect(client.linkGroupToCommunity).toHaveBeenCalledWith(GROUP, COMMUNITY);

    const unlinked = await call('DELETE', `/instances/bot/communities/${K}/linked-groups/${G}`);
    expect(unlinked.json().data.linked).toBe(false);
    expect(client.unlinkGroupFromCommunity).toHaveBeenCalledWith(GROUP, COMMUNITY);
  });

  it('patches name and description together, naming a half-failure', async () => {
    const ok = await call('PATCH', `/instances/bot/communities/${K}`, {
      name: 'Warga Baru',
      description: 'RT 05',
    });
    expect(ok.json().data).toEqual({ name: 'Warga Baru', description: 'RT 05' });

    client.updateCommunityDescription.mockResolvedValue({ success: false, error: 'not admin' });
    const half = await call('PATCH', `/instances/bot/communities/${K}`, {
      name: 'Warga Baru',
      description: 'RT 05',
    });
    expect(half.statusCode).toBe(400);
    expect(half.json().error.message).toContain('description');
  });

  it('reads and revokes the invite on the same path', async () => {
    expect((await call('GET', `/instances/bot/communities/${K}/invite`)).json().data.link).toBe(
      'https://chat.whatsapp.com/ABC',
    );

    const revoked = await call('DELETE', `/instances/bot/communities/${K}/invite`);
    expect(revoked.json().data).toEqual({
      communityJid: COMMUNITY,
      revoked: true,
      link: 'https://chat.whatsapp.com/XYZ',
    });
  });

  it('inspects and joins an invite from top-level resources', async () => {
    expect((await call('GET', '/instances/bot/community-invites/ABC')).json().data.subject).toBe(
      'Warga',
    );

    const joined = await call('POST', '/instances/bot/community-memberships', {
      inviteCode: 'ABC',
    });
    expect(joined.statusCode).toBe(201);
    expect(joined.json().data).toEqual({ communityJid: COMMUNITY, joined: true });
  });

  it('400s a spent invite code rather than reporting a null join', async () => {
    client.acceptCommunityInvite.mockResolvedValue(null);

    const res = await call('POST', '/instances/bot/community-memberships', { inviteCode: 'GONE' });

    expect(res.statusCode).toBe(400);
  });

  it('leaves a community, 404s an unknown one, and 503s while disconnected', async () => {
    expect((await call('DELETE', `/instances/bot/communities/${K}`)).json().data).toEqual({
      communityJid: COMMUNITY,
      left: true,
    });

    client.getCommunityInfo.mockResolvedValue(null);
    expect((await call('GET', `/instances/bot/communities/${K}`)).statusCode).toBe(404);

    status = 'disconnected';
    expect((await call('GET', '/instances/bot/communities')).statusCode).toBe(503);
  });
});
