/**
 * Group Routes (v2)
 *
 * GET    /instances/:instanceId/groups
 * POST   /instances/:instanceId/groups
 * GET    /instances/:instanceId/groups/:groupJid
 * PATCH  /instances/:instanceId/groups/:groupJid
 * DELETE /instances/:instanceId/groups/:groupJid
 * GET    /instances/:instanceId/groups/:groupJid/participants
 * PATCH  /instances/:instanceId/groups/:groupJid/participants
 * PUT    /instances/:instanceId/groups/:groupJid/picture
 * GET    /instances/:instanceId/groups/:groupJid/invite
 * DELETE /instances/:instanceId/groups/:groupJid/invite
 * GET    /instances/:instanceId/group-invites/:inviteCode
 * POST   /instances/:instanceId/group-memberships
 *
 * v1 gave each participant operation its own route and method — POST and
 * DELETE on `/participants`, POST and DELETE on `/admins` — four routes for
 * one edit to the same list. v2 patches the participant list once and names
 * the operation in the body.
 *
 * Invites also collapse: `/invite` reads the link and DELETE on the same path
 * revokes it, replacing `POST /revoke-invite`. Looking up a code and joining
 * by it become their own top-level resources, since neither is scoped to a
 * group the caller already belongs to.
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

const groupParams = {
  type: 'object',
  required: ['instanceId', 'groupJid'],
  properties: {
    instanceId: { type: 'string' },
    groupJid: { type: 'string', minLength: 1 },
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

export async function groupRoutesV2(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', createAuthMiddleware());

  server.get(
    '/instances/:instanceId/groups',
    {
      schema: {
        description: 'List the groups this account belongs to',
        tags: ['Groups'],
        summary: 'List groups',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const client = requireConnectedClient(server, instanceId);

      const result = await client.fetchAllGroups();
      if (!result.success) {
        throw new BadRequestError('Failed to fetch groups', { error: result.error });
      }

      const items = result.groups ?? [];
      reply.send({ success: true, data: { items, total: items.length } });
    },
  );

  server.post(
    '/instances/:instanceId/groups',
    {
      schema: {
        description: 'Create a group with an initial participant list',
        tags: ['Groups'],
        summary: 'Create group',
        params: instanceParams,
        body: {
          type: 'object',
          required: ['name', 'participants'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
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
      const { instanceId } = request.params as { instanceId: string };
      const { name, participants } = request.body as { name: string; participants: string[] };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.createGroup(name, participants);
        if (!result.success) {
          throw new BadRequestError('Failed to create group', { error: result.error });
        }
        reply.status(201).send({
          success: true,
          data: { groupJid: result.groupJid, groupInfo: result.groupInfo },
        });
      } catch (err: any) {
        failed('create group', err);
      }
    },
  );

  server.get(
    '/instances/:instanceId/groups/:groupJid',
    {
      schema: {
        description: 'Get group metadata',
        tags: ['Groups'],
        summary: 'Get group',
        params: groupParams,
      },
    },
    async (request, reply) => {
      const { instanceId, groupJid } = request.params as {
        instanceId: string;
        groupJid: string;
      };
      const client = requireConnectedClient(server, instanceId);

      const info = await client.getGroupInfo(groupJid);
      if (!info) {
        throw new NotFoundError('Group');
      }

      reply.send({ success: true, data: info });
    },
  );

  server.patch(
    '/instances/:instanceId/groups/:groupJid',
    {
      schema: {
        description: 'Update the group subject and/or description',
        tags: ['Groups'],
        summary: 'Update group',
        params: groupParams,
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
      const { instanceId, groupJid } = request.params as {
        instanceId: string;
        groupJid: string;
      };
      const body = request.body as { name?: string; description?: string };
      const client = requireConnectedClient(server, instanceId);

      const updated: Record<string, string> = {};

      try {
        // Reported field by field: if the description fails after the name
        // landed, the caller can tell which half is live.
        if (body.name !== undefined) {
          const result = await client.updateGroupName(groupJid, body.name);
          if (!result.success) {
            throw new BadRequestError('Failed to update group name', { error: result.error });
          }
          updated.name = body.name;
        }

        if (body.description !== undefined) {
          const result = await client.updateGroupDescription(groupJid, body.description);
          if (!result.success) {
            throw new BadRequestError('Failed to update group description', {
              error: result.error,
              updated,
            });
          }
          updated.description = body.description;
        }
      } catch (err: any) {
        failed('update group', err);
      }

      reply.send({ success: true, data: updated });
    },
  );

  server.delete(
    '/instances/:instanceId/groups/:groupJid',
    {
      schema: {
        description: 'Leave a group. The group itself keeps existing for its other members.',
        tags: ['Groups'],
        summary: 'Leave group',
        params: groupParams,
      },
    },
    async (request, reply) => {
      const { instanceId, groupJid } = request.params as {
        instanceId: string;
        groupJid: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.leaveGroup(groupJid);
        if (!result.success) {
          throw new BadRequestError('Failed to leave group', { error: result.error });
        }
        reply.send({ success: true, data: { groupJid, left: true } });
      } catch (err: any) {
        failed('leave group', err);
      }
    },
  );

  server.get(
    '/instances/:instanceId/groups/:groupJid/participants',
    {
      schema: {
        description: 'List group participants',
        tags: ['Groups'],
        summary: 'List participants',
        params: groupParams,
      },
    },
    async (request, reply) => {
      const { instanceId, groupJid } = request.params as {
        instanceId: string;
        groupJid: string;
      };
      const client = requireConnectedClient(server, instanceId);

      const participants = await client.getGroupParticipants(groupJid);
      if (!participants) {
        throw new NotFoundError('Group');
      }

      reply.send({
        success: true,
        data: { items: participants, total: participants.length },
      });
    },
  );

  server.patch(
    '/instances/:instanceId/groups/:groupJid/participants',
    {
      schema: {
        description:
          'Add, remove, promote or demote participants. Replaces the four v1 routes ' +
          '(POST/DELETE on /participants and on /admins).',
        tags: ['Groups'],
        summary: 'Change participants',
        params: groupParams,
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
      const { instanceId, groupJid } = request.params as {
        instanceId: string;
        groupJid: string;
      };
      const { operation, participants } = request.body as {
        operation: 'add' | 'remove' | 'promote' | 'demote';
        participants: string[];
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const results =
          operation === 'add'
            ? await client.addParticipants(groupJid, participants)
            : operation === 'remove'
              ? await client.removeParticipants(groupJid, participants)
              : operation === 'promote'
                ? await client.promoteToAdmin(groupJid, participants)
                : await client.demoteFromAdmin(groupJid, participants);

        // WhatsApp answers per participant, so a partial outcome is normal:
        // one number may be unreachable while the rest go through. The
        // per-participant status is the answer, not an error.
        reply.send({
          success: true,
          data: { operation, items: results, total: results.length },
        });
      } catch (err: any) {
        failed(`${operation} group participants`, err);
      }
    },
  );

  server.put(
    '/instances/:instanceId/groups/:groupJid/picture',
    {
      schema: {
        description: 'Set the group picture from a URL, file path, or data URI',
        tags: ['Groups'],
        summary: 'Set group picture',
        params: groupParams,
        body: {
          type: 'object',
          required: ['url'],
          additionalProperties: false,
          properties: { url: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, groupJid } = request.params as {
        instanceId: string;
        groupJid: string;
      };
      const { url } = request.body as { url: string };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.updateGroupPicture(groupJid, url);
        if (!result.success) {
          throw new BadRequestError('Failed to set group picture', { error: result.error });
        }
        reply.send({ success: true, data: { groupJid, updated: true } });
      } catch (err: any) {
        failed('set group picture', err);
      }
    },
  );

  server.get(
    '/instances/:instanceId/groups/:groupJid/invite',
    {
      schema: {
        description: 'Get the current invite link for a group',
        tags: ['Groups'],
        summary: 'Get invite link',
        params: groupParams,
      },
    },
    async (request, reply) => {
      const { instanceId, groupJid } = request.params as {
        instanceId: string;
        groupJid: string;
      };
      const client = requireConnectedClient(server, instanceId);

      const link = await client.getGroupInviteLink(groupJid);
      if (!link) {
        throw new NotFoundError('Invite link');
      }

      reply.send({ success: true, data: { groupJid, link } });
    },
  );

  server.delete(
    '/instances/:instanceId/groups/:groupJid/invite',
    {
      schema: {
        description:
          'Revoke the current invite link and issue a new one. The old link stops working. ' +
          'Replaces the v1 POST /revoke-invite.',
        tags: ['Groups'],
        summary: 'Revoke invite link',
        params: groupParams,
      },
    },
    async (request, reply) => {
      const { instanceId, groupJid } = request.params as {
        instanceId: string;
        groupJid: string;
      };
      const client = requireConnectedClient(server, instanceId);

      const link = await client.revokeGroupInvite(groupJid);
      if (!link) {
        throw new BadRequestError('Failed to revoke invite link');
      }

      // Revoking always mints a replacement, so returning it saves a round trip.
      reply.send({ success: true, data: { groupJid, revoked: true, link } });
    },
  );

  server.get(
    '/instances/:instanceId/group-invites/:inviteCode',
    {
      schema: {
        description:
          'Inspect a group behind an invite code without joining it. Top-level because ' +
          'the caller is not a member yet.',
        tags: ['Groups'],
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

      const info = await client.getGroupInviteInfo(inviteCode);
      if (!info) {
        throw new NotFoundError('Group invite');
      }

      reply.send({ success: true, data: info });
    },
  );

  server.post(
    '/instances/:instanceId/group-memberships',
    {
      schema: {
        description: 'Join a group using an invite code',
        tags: ['Groups'],
        summary: 'Join group',
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
        const groupJid = await client.acceptGroupInvite(inviteCode);
        if (!groupJid) {
          throw new BadRequestError('Failed to join group', {
            error: 'The invite code may be expired, revoked, or already used',
          });
        }
        reply.status(201).send({ success: true, data: { groupJid, joined: true } });
      } catch (err: any) {
        failed('join group', err);
      }
    },
  );
}
