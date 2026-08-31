/**
 * Community Routes (v2)
 *
 * GET    /instances/:instanceId/communities
 * POST   /instances/:instanceId/communities
 * GET    /instances/:instanceId/communities/:communityJid
 * PATCH  /instances/:instanceId/communities/:communityJid
 * DELETE /instances/:instanceId/communities/:communityJid
 * GET    /instances/:instanceId/communities/:communityJid/participants
 * PATCH  /instances/:instanceId/communities/:communityJid/participants
 * POST   /instances/:instanceId/communities/:communityJid/groups
 * GET    /instances/:instanceId/communities/:communityJid/linked-groups
 * PUT    /instances/:instanceId/communities/:communityJid/linked-groups
 * DELETE /instances/:instanceId/communities/:communityJid/linked-groups/:groupJid
 * GET    /instances/:instanceId/communities/:communityJid/invite
 * DELETE /instances/:instanceId/communities/:communityJid/invite
 * GET    /instances/:instanceId/community-invites/:inviteCode
 * POST   /instances/:instanceId/community-memberships
 *
 * v1 had no community routes at all; miaw-core has carried them for a while.
 * The shape deliberately mirrors `./groups.ts` — one PATCH for the whole
 * participant list, invites read and revoked on one path, and lookup/join as
 * top-level resources — because a community is a group of groups and callers
 * should not have to learn a second vocabulary for it.
 *
 * The one addition groups do not have is `linked-groups`: the member groups.
 * A group is attached with PUT and detached with DELETE on its own id, so
 * repeating either is harmless.
 */

import { FastifyInstance } from 'fastify';
import type { MiawClient } from 'miaw-core';
import { createAuthMiddleware } from '../../middleware/auth';
import {
  ApiError,
  NotFoundError,
  BadRequestError,
  ServiceUnavailableError,
} from '../../utils/errorHandler';

const instanceParams = {
  type: 'object',
  required: ['instanceId'],
  properties: { instanceId: { type: 'string' } },
};

const communityParams = {
  type: 'object',
  required: ['instanceId', 'communityJid'],
  properties: {
    instanceId: { type: 'string' },
    communityJid: { type: 'string', minLength: 1 },
  },
};

function requireConnectedClient(server: FastifyInstance, instanceId: string): MiawClient {
  const client = server.instanceManager.getClient(instanceId);
  const instance = server.instanceManager.getInstance(instanceId);

  if (!client || !instance) {
    throw new NotFoundError('Instance');
  }
  if (instance.status !== 'connected') {
    throw new ServiceUnavailableError('Instance is not connected');
  }
  return client;
}

/**
 * Normalize an unexpected error into a 400, while letting anything we already
 * classified (404, 503, or a 400 that carries its own message and details)
 * travel to the error handler untouched.
 */
function failed(what: string, err: any): never {
  if (err instanceof ApiError) {
    throw err;
  }
  throw new BadRequestError(`Failed to ${what}`, { error: err?.message });
}

export async function communityRoutesV2(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', createAuthMiddleware());

  server.get(
    '/instances/:instanceId/communities',
    {
      schema: {
        description: 'List the communities this account belongs to',
        tags: ['Communities'],
        summary: 'List communities',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const client = requireConnectedClient(server, instanceId);

      try {
        const items = await client.getAllCommunities();
        reply.send({ success: true, data: { items, total: items.length } });
      } catch (err: any) {
        failed('list communities', err);
      }
    },
  );

  server.post(
    '/instances/:instanceId/communities',
    {
      schema: {
        description: 'Create a community',
        tags: ['Communities'],
        summary: 'Create community',
        params: instanceParams,
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
            description: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const { name, description } = request.body as { name: string; description?: string };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.createCommunity(name, description);
        if (!result.success) {
          throw new BadRequestError('Failed to create community', { error: result.error });
        }
        reply.status(201).send({
          success: true,
          data: { communityJid: result.communityJid, communityInfo: result.communityInfo },
        });
      } catch (err: any) {
        failed('create community', err);
      }
    },
  );

  server.get(
    '/instances/:instanceId/communities/:communityJid',
    {
      schema: {
        description: 'Get community metadata',
        tags: ['Communities'],
        summary: 'Get community',
        params: communityParams,
      },
    },
    async (request, reply) => {
      const { instanceId, communityJid } = request.params as {
        instanceId: string;
        communityJid: string;
      };
      const client = requireConnectedClient(server, instanceId);

      const info = await client.getCommunityInfo(communityJid);
      if (!info) {
        throw new NotFoundError('Community');
      }

      reply.send({ success: true, data: info });
    },
  );

  server.patch(
    '/instances/:instanceId/communities/:communityJid',
    {
      schema: {
        description: 'Update the community name and/or description',
        tags: ['Communities'],
        summary: 'Update community',
        params: communityParams,
        body: {
          type: 'object',
          additionalProperties: false,
          // An empty patch would report success while changing nothing.
          minProperties: 1,
          properties: {
            name: { type: 'string', minLength: 1 },
            description: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, communityJid } = request.params as {
        instanceId: string;
        communityJid: string;
      };
      const body = request.body as { name?: string; description?: string };
      const client = requireConnectedClient(server, instanceId);

      const updated: Record<string, string> = {};

      try {
        // Reported field by field: if the description fails after the name
        // landed, the caller can tell which half is live.
        if (body.name !== undefined) {
          const result = await client.updateCommunityName(communityJid, body.name);
          if (!result.success) {
            throw new BadRequestError('Failed to update community name', { error: result.error });
          }
          updated.name = body.name;
        }

        if (body.description !== undefined) {
          const result = await client.updateCommunityDescription(communityJid, body.description);
          if (!result.success) {
            throw new BadRequestError('Failed to update community description', {
              error: result.error,
              updated,
            });
          }
          updated.description = body.description;
        }
      } catch (err: any) {
        failed('update community', err);
      }

      reply.send({ success: true, data: updated });
    },
  );

  server.delete(
    '/instances/:instanceId/communities/:communityJid',
    {
      schema: {
        description: 'Leave a community. The community keeps existing for its other members.',
        tags: ['Communities'],
        summary: 'Leave community',
        params: communityParams,
      },
    },
    async (request, reply) => {
      const { instanceId, communityJid } = request.params as {
        instanceId: string;
        communityJid: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.leaveCommunity(communityJid);
        if (!result.success) {
          throw new BadRequestError('Failed to leave community', { error: result.error });
        }
        reply.send({ success: true, data: { communityJid, left: true } });
      } catch (err: any) {
        failed('leave community', err);
      }
    },
  );

  server.get(
    '/instances/:instanceId/communities/:communityJid/participants',
    {
      schema: {
        description: 'List community participants',
        tags: ['Communities'],
        summary: 'List participants',
        params: communityParams,
      },
    },
    async (request, reply) => {
      const { instanceId, communityJid } = request.params as {
        instanceId: string;
        communityJid: string;
      };
      const client = requireConnectedClient(server, instanceId);

      const participants = await client.getCommunityParticipants(communityJid);
      if (!participants) {
        throw new NotFoundError('Community');
      }

      reply.send({
        success: true,
        data: { items: participants, total: participants.length },
      });
    },
  );

  server.patch(
    '/instances/:instanceId/communities/:communityJid/participants',
    {
      schema: {
        description: 'Add, remove, promote or demote community members',
        tags: ['Communities'],
        summary: 'Change participants',
        params: communityParams,
        body: {
          type: 'object',
          required: ['operation', 'participants'],
          additionalProperties: false,
          properties: {
            operation: { type: 'string', enum: ['add', 'remove', 'promote', 'demote'] },
            participants: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', minLength: 1 },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, communityJid } = request.params as {
        instanceId: string;
        communityJid: string;
      };
      const { operation, participants } = request.body as {
        operation: 'add' | 'remove' | 'promote' | 'demote';
        participants: string[];
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const results =
          operation === 'add'
            ? await client.addCommunityMembers(communityJid, participants)
            : operation === 'remove'
              ? await client.removeCommunityMembers(communityJid, participants)
              : operation === 'promote'
                ? await client.promoteCommunityMembers(communityJid, participants)
                : await client.demoteCommunityMembers(communityJid, participants);

        // Per-participant outcomes are the answer, as in groups: one member may
        // be unreachable while the rest go through.
        reply.send({
          success: true,
          data: { operation, items: results, total: results.length },
        });
      } catch (err: any) {
        failed(`${operation} community participants`, err);
      }
    },
  );

  server.post(
    '/instances/:instanceId/communities/:communityJid/groups',
    {
      schema: {
        description: 'Create a group already linked to this community',
        tags: ['Communities'],
        summary: 'Create community group',
        params: communityParams,
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
            participants: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
              default: [],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, communityJid } = request.params as {
        instanceId: string;
        communityJid: string;
      };
      const { name, participants = [] } = request.body as {
        name: string;
        participants?: string[];
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.createCommunityGroup(communityJid, name, participants);
        if (!result.success) {
          throw new BadRequestError('Failed to create community group', { error: result.error });
        }
        reply.status(201).send({
          success: true,
          data: { communityJid, groupJid: result.groupJid, groupInfo: result.groupInfo },
        });
      } catch (err: any) {
        failed('create community group', err);
      }
    },
  );

  server.get(
    '/instances/:instanceId/communities/:communityJid/linked-groups',
    {
      schema: {
        description: 'List the groups belonging to a community',
        tags: ['Communities'],
        summary: 'List linked groups',
        params: communityParams,
      },
    },
    async (request, reply) => {
      const { instanceId, communityJid } = request.params as {
        instanceId: string;
        communityJid: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const items = await client.getLinkedGroups(communityJid);
        reply.send({ success: true, data: { items, total: items.length } });
      } catch (err: any) {
        failed('list linked groups', err);
      }
    },
  );

  server.put(
    '/instances/:instanceId/communities/:communityJid/linked-groups',
    {
      schema: {
        description: 'Attach an existing group to the community',
        tags: ['Communities'],
        summary: 'Link group',
        params: communityParams,
        body: {
          type: 'object',
          required: ['groupJid'],
          additionalProperties: false,
          properties: { groupJid: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, communityJid } = request.params as {
        instanceId: string;
        communityJid: string;
      };
      const { groupJid } = request.body as { groupJid: string };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.linkGroupToCommunity(groupJid, communityJid);
        if (!result.success) {
          throw new BadRequestError('Failed to link group', { error: result.error });
        }
        reply.send({ success: true, data: { communityJid, groupJid, linked: true } });
      } catch (err: any) {
        failed('link group', err);
      }
    },
  );

  server.delete(
    '/instances/:instanceId/communities/:communityJid/linked-groups/:groupJid',
    {
      schema: {
        description: 'Detach a group from the community. The group itself survives.',
        tags: ['Communities'],
        summary: 'Unlink group',
        params: {
          type: 'object',
          required: ['instanceId', 'communityJid', 'groupJid'],
          properties: {
            instanceId: { type: 'string' },
            communityJid: { type: 'string', minLength: 1 },
            groupJid: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, communityJid, groupJid } = request.params as {
        instanceId: string;
        communityJid: string;
        groupJid: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.unlinkGroupFromCommunity(groupJid, communityJid);
        if (!result.success) {
          throw new BadRequestError('Failed to unlink group', { error: result.error });
        }
        reply.send({ success: true, data: { communityJid, groupJid, linked: false } });
      } catch (err: any) {
        failed('unlink group', err);
      }
    },
  );

  server.get(
    '/instances/:instanceId/communities/:communityJid/invite',
    {
      schema: {
        description: 'Get the current invite link for a community',
        tags: ['Communities'],
        summary: 'Get invite link',
        params: communityParams,
      },
    },
    async (request, reply) => {
      const { instanceId, communityJid } = request.params as {
        instanceId: string;
        communityJid: string;
      };
      const client = requireConnectedClient(server, instanceId);

      const link = await client.getCommunityInviteLink(communityJid);
      if (!link) {
        throw new NotFoundError('Invite link');
      }

      reply.send({ success: true, data: { communityJid, link } });
    },
  );

  server.delete(
    '/instances/:instanceId/communities/:communityJid/invite',
    {
      schema: {
        description: 'Revoke the current invite link and issue a new one',
        tags: ['Communities'],
        summary: 'Revoke invite link',
        params: communityParams,
      },
    },
    async (request, reply) => {
      const { instanceId, communityJid } = request.params as {
        instanceId: string;
        communityJid: string;
      };
      const client = requireConnectedClient(server, instanceId);

      const link = await client.revokeCommunityInvite(communityJid);
      if (!link) {
        throw new BadRequestError('Failed to revoke invite link');
      }

      // Revoking always mints a replacement, so returning it saves a round trip.
      reply.send({ success: true, data: { communityJid, revoked: true, link } });
    },
  );

  server.get(
    '/instances/:instanceId/community-invites/:inviteCode',
    {
      schema: {
        description: 'Inspect a community behind an invite code without joining it',
        tags: ['Communities'],
        summary: 'Get invite info',
        params: {
          type: 'object',
          required: ['instanceId', 'inviteCode'],
          properties: {
            instanceId: { type: 'string' },
            inviteCode: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, inviteCode } = request.params as {
        instanceId: string;
        inviteCode: string;
      };
      const client = requireConnectedClient(server, instanceId);

      const info = await client.getCommunityInviteInfo(inviteCode);
      if (!info) {
        throw new NotFoundError('Community invite');
      }

      reply.send({ success: true, data: info });
    },
  );

  server.post(
    '/instances/:instanceId/community-memberships',
    {
      schema: {
        description: 'Join a community using an invite code',
        tags: ['Communities'],
        summary: 'Join community',
        params: instanceParams,
        body: {
          type: 'object',
          required: ['inviteCode'],
          additionalProperties: false,
          properties: { inviteCode: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const { inviteCode } = request.body as { inviteCode: string };
      const client = requireConnectedClient(server, instanceId);

      try {
        const communityJid = await client.acceptCommunityInvite(inviteCode);
        if (!communityJid) {
          throw new BadRequestError('Failed to join community', {
            error: 'The invite code may be expired, revoked, or already used',
          });
        }
        reply.status(201).send({ success: true, data: { communityJid, joined: true } });
      } catch (err: any) {
        failed('join community', err);
      }
    },
  );
}
