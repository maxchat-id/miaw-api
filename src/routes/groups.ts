/**
 * Group Management Routes
 * POST /instances/:id/groups - Create group
 * GET /instances/:id/groups/:groupJid - Get group info
 * PATCH /instances/:id/groups/:groupJid - Update group name/description
 * GET /instances/:id/groups/:groupJid/participants - Get group participants
 * POST /instances/:id/groups/:groupJid/participants - Add participants
 * DELETE /instances/:id/groups/:groupJid/participants - Remove participants
 * POST /instances/:id/groups/:groupJid/admins - Promote to admin
 * DELETE /instances/:id/groups/:groupJid/admins - Demote admin
 * POST /instances/:id/groups/:groupJid/picture - Update group picture
 * GET /instances/:id/groups/:groupJid/invite - Get invite link
 * POST /instances/:id/groups/:groupJid/revoke-invite - Revoke invite link
 * GET /instances/:id/groups/invite/:code/info - Preview group before joining
 * POST /instances/:id/groups/join/:inviteCode - Join via invite code
 * DELETE /instances/:id/groups/:groupJid - Leave group
 */

import { FastifyInstance } from 'fastify';
import type { MiawClient } from 'miaw-core';
import { createAuthMiddleware } from '../middleware/auth';
import { NotFoundError, BadRequestError, ServiceUnavailableError } from '../utils/errorHandler';

/**
 * Register group management routes
 */
export async function groupRoutes(server: FastifyInstance): Promise<void> {
  // All routes require authentication
  server.addHook('onRequest', createAuthMiddleware());

  /**
   * POST /instances/:id/groups
   * Create a new group
   */
  server.post(
    '/instances/:id/groups',
    {
      schema: {
        description: 'Create a new WhatsApp group',
        tags: ['Groups'],
        summary: 'Create group',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'createGroup#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  groupJid: { type: 'string', nullable: true },
                  groupInfo: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      description: { type: 'string', nullable: true },
                      owner: { type: 'string', nullable: true },
                      createdAt: { type: 'number' },
                    },
                  },
                  results: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        jid: { type: 'string' },
                        success: { type: 'boolean' },
                        error: { type: 'string', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const body = request.body as { name: string; participants: string[] };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const result = await client.createGroup(body.name, body.participants);

        reply.send({
          success: true,
          data: result,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to create group', { error: err.message });
      }
    },
  );

  /**
   * GET /instances/:id/groups/:groupJid
   * Get group information
   */
  server.get(
    '/instances/:id/groups/:groupJid',
    {
      schema: {
        description: 'Get group metadata and information',
        tags: ['Groups'],
        summary: 'Get group info',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            groupJid: { type: 'string' },
          },
          required: ['id', 'groupJid'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  owner: { type: 'string', nullable: true },
                  createdAt: { type: 'number' },
                  participants: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        jid: { type: 'string' },
                        name: { type: 'string', nullable: true },
                        admin: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; groupJid: string };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const groupInfo = await client.getGroupInfo(params.groupJid);

        if (!groupInfo) {
          throw new NotFoundError('Group');
        }

        reply.send({
          success: true,
          data: groupInfo,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to get group info', { error: err.message });
      }
    },
  );

  /**
   * PATCH /instances/:id/groups/:groupJid
   * Update group name or description
   */
  server.patch(
    '/instances/:id/groups/:groupJid',
    {
      schema: {
        description: 'Update group name or description',
        tags: ['Groups'],
        summary: 'Update group',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            groupJid: { type: 'string' },
          },
          required: ['id', 'groupJid'],
        },
        body: {
          $ref: 'updateGroup#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; groupJid: string };
      const body = request.body as { name?: string; description?: string };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        if (body.name) {
          await client.updateGroupName(params.groupJid, body.name);
        }

        if (body.description !== undefined) {
          await client.updateGroupDescription(params.groupJid, body.description);
        }

        reply.send({
          success: true,
          data: { success: true },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to update group', { error: err.message });
      }
    },
  );

  /**
   * GET /instances/:id/groups/:groupJid/participants
   * Get group participants list
   */
  server.get(
    '/instances/:id/groups/:groupJid/participants',
    {
      schema: {
        description: 'Get list of group participants with their roles',
        tags: ['Groups'],
        summary: 'Get group participants',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            groupJid: { type: 'string' },
          },
          required: ['id', 'groupJid'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                nullable: true,
                properties: {
                  groupJid: { type: 'string' },
                  participants: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        jid: { type: 'string' },
                        role: { type: 'string', enum: ['admin', 'superadmin', 'member'] },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; groupJid: string };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const participants = await client.getGroupParticipants(params.groupJid);

        if (!participants) {
          throw new NotFoundError('Group');
        }

        reply.send({
          success: true,
          data: {
            groupJid: params.groupJid,
            participants,
          },
        });
      } catch (err: any) {
        if (err.code === 'NOT_FOUND') {
          throw err;
        }
        throw new BadRequestError('Failed to get group participants', { error: err.message });
      }
    },
  );

  /**
   * POST /instances/:id/groups/:groupJid/participants
   * Add participants to a group
   */
  server.post(
    '/instances/:id/groups/:groupJid/participants',
    {
      schema: {
        description: 'Add participants to a group',
        tags: ['Groups'],
        summary: 'Add participants',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            groupJid: { type: 'string' },
          },
          required: ['id', 'groupJid'],
        },
        body: {
          $ref: 'groupParticipants#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    jid: { type: 'string' },
                    success: { type: 'boolean' },
                    error: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; groupJid: string };
      const body = request.body as { participants: string[] };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const result = await client.addParticipants(params.groupJid, body.participants);

        reply.send({
          success: true,
          data: result,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to add participants', { error: err.message });
      }
    },
  );

  /**
   * DELETE /instances/:id/groups/:groupJid/participants
   * Remove participants from a group
   */
  server.delete(
    '/instances/:id/groups/:groupJid/participants',
    {
      schema: {
        description: 'Remove participants from a group',
        tags: ['Groups'],
        summary: 'Remove participants',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            groupJid: { type: 'string' },
          },
          required: ['id', 'groupJid'],
        },
        body: {
          $ref: 'groupParticipants#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    jid: { type: 'string' },
                    success: { type: 'boolean' },
                    error: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; groupJid: string };
      const body = request.body as { participants: string[] };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const result = await client.removeParticipants(params.groupJid, body.participants);

        reply.send({
          success: true,
          data: result,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to remove participants', { error: err.message });
      }
    },
  );

  /**
   * POST /instances/:id/groups/:groupJid/admins
   * Promote participants to admin
   */
  server.post(
    '/instances/:id/groups/:groupJid/admins',
    {
      schema: {
        description: 'Promote participants to group admin',
        tags: ['Groups'],
        summary: 'Promote to admin',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            groupJid: { type: 'string' },
          },
          required: ['id', 'groupJid'],
        },
        body: {
          $ref: 'groupParticipants#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    jid: { type: 'string' },
                    success: { type: 'boolean' },
                    error: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; groupJid: string };
      const body = request.body as { participants: string[] };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const result = await client.promoteToAdmin(params.groupJid, body.participants);

        reply.send({
          success: true,
          data: result,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to promote admin', { error: err.message });
      }
    },
  );

  /**
   * DELETE /instances/:id/groups/:groupJid/admins
   * Demote admins to regular participants
   */
  server.delete(
    '/instances/:id/groups/:groupJid/admins',
    {
      schema: {
        description: 'Demote group admins to regular participants',
        tags: ['Groups'],
        summary: 'Demote admin',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            groupJid: { type: 'string' },
          },
          required: ['id', 'groupJid'],
        },
        body: {
          $ref: 'groupParticipants#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    jid: { type: 'string' },
                    success: { type: 'boolean' },
                    error: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; groupJid: string };
      const body = request.body as { participants: string[] };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const result = await client.demoteFromAdmin(params.groupJid, body.participants);

        reply.send({
          success: true,
          data: result,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to demote admin', { error: err.message });
      }
    },
  );

  /**
   * POST /instances/:id/groups/:groupJid/picture
   * Update group profile picture
   */
  server.post(
    '/instances/:id/groups/:groupJid/picture',
    {
      schema: {
        description: 'Update group profile picture from URL',
        tags: ['Groups'],
        summary: 'Update group picture',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            groupJid: { type: 'string' },
          },
          required: ['id', 'groupJid'],
        },
        body: {
          type: 'object',
          required: ['url'],
          properties: {
            url: {
              type: 'string',
              format: 'uri',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; groupJid: string };
      const body = request.body as { url: string };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const result = await client.updateGroupPicture(params.groupJid, body.url);

        reply.send({
          success: true,
          data: { success: result.success },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to update group picture', { error: err.message });
      }
    },
  );

  /**
   * GET /instances/:id/groups/:groupJid/invite
   * Get group invite link
   */
  server.get(
    '/instances/:id/groups/:groupJid/invite',
    {
      schema: {
        description: 'Get group invite link',
        tags: ['Groups'],
        summary: 'Get invite link',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            groupJid: { type: 'string' },
          },
          required: ['id', 'groupJid'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  url: { type: 'string', nullable: true },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; groupJid: string };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const inviteUrl = await client.getGroupInviteLink(params.groupJid);

        reply.send({
          success: true,
          data: {
            url: inviteUrl,
          },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to get invite link', { error: err.message });
      }
    },
  );

  /**
   * POST /instances/:id/groups/:groupJid/revoke-invite
   * Revoke group invite link
   */
  server.post(
    '/instances/:id/groups/:groupJid/revoke-invite',
    {
      schema: {
        description: 'Revoke current group invite link and generate a new one',
        tags: ['Groups'],
        summary: 'Revoke invite link',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            groupJid: { type: 'string' },
          },
          required: ['id', 'groupJid'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  url: { type: 'string', nullable: true },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; groupJid: string };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const newInviteUrl = await client.revokeGroupInvite(params.groupJid);

        reply.send({
          success: true,
          data: {
            url: newInviteUrl,
          },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to revoke invite', { error: err.message });
      }
    },
  );

  /**
   * GET /instances/:id/groups/invite/:code/info
   * Get group info from invite code before joining
   */
  server.get(
    '/instances/:id/groups/invite/:code/info',
    {
      schema: {
        description: 'Preview group information before joining via invite code',
        tags: ['Groups'],
        summary: 'Get group invite info',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            code: { type: 'string' },
          },
          required: ['id', 'code'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                nullable: true,
                properties: {
                  jid: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  participantCount: { type: 'number' },
                  createdAt: { type: 'number', nullable: true },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; code: string };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const inviteInfo = await client.getGroupInviteInfo(params.code);

        if (!inviteInfo) {
          throw new NotFoundError('Group invite');
        }

        reply.send({
          success: true,
          data: inviteInfo,
        });
      } catch (err: any) {
        if (err.code === 'NOT_FOUND') {
          throw err;
        }
        throw new BadRequestError('Failed to get group invite info', { error: err.message });
      }
    },
  );

  /**
   * POST /instances/:id/groups/join/:inviteCode
   * Join group via invite code
   */
  server.post(
    '/instances/:id/groups/join/:inviteCode',
    {
      schema: {
        description: 'Join a group using invite code',
        tags: ['Groups'],
        summary: 'Join group via invite',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            inviteCode: { type: 'string' },
          },
          required: ['id', 'inviteCode'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  groupJid: { type: 'string', nullable: true },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; inviteCode: string };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const groupJid = await client.acceptGroupInvite(params.inviteCode);

        reply.send({
          success: true,
          data: {
            groupJid,
          },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to join group', { error: err.message });
      }
    },
  );

  /**
   * DELETE /instances/:id/groups/:groupJid
   * Leave a group
   */
  server.delete(
    '/instances/:id/groups/:groupJid',
    {
      schema: {
        description: 'Leave a group',
        tags: ['Groups'],
        summary: 'Leave group',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            groupJid: { type: 'string' },
          },
          required: ['id', 'groupJid'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; groupJid: string };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const result = await client.leaveGroup(params.groupJid);

        reply.send({
          success: true,
          data: { success: result.success },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to leave group', { error: err.message });
      }
    },
  );
}
