/**
 * Presence & UX Routes
 * POST /instances/:id/presence - Set bot presence status
 * POST /instances/:id/typing/:to - Send typing indicator
 * POST /instances/:id/recording/:to - Send recording indicator
 * POST /instances/:id/stop-typing/:to - Stop typing/recording indicator
 * POST /instances/:id/read - Mark message as read
 * POST /instances/:id/subscribe/:jid - Subscribe to presence updates
 */

import { FastifyInstance } from 'fastify';
import { createAuthMiddleware } from '../middleware/auth';
import { NotFoundError, BadRequestError, ServiceUnavailableError } from '../utils/errorHandler';

/**
 * Register presence & UX routes
 */
export async function presenceRoutes(server: FastifyInstance): Promise<void> {
  // All routes require authentication
  server.addHook('onRequest', createAuthMiddleware());

  /**
   * POST /instances/:id/presence
   * Set bot's presence status (online/offline)
   */
  server.post(
    '/instances/:id/presence',
    {
      schema: {
        description: 'Set your presence status (online or offline)',
        tags: ['Presence'],
        summary: 'Set presence status',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'setPresence#',
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
      const params = request.params as { id: string };
      const body = request.body as { status: 'available' | 'unavailable' };

      const instanceManager = server.instanceManager;
      const client = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        await client.setPresence(body.status);

        reply.send({
          success: true,
          data: { success: true },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to set presence', { error: err.message });
      }
    },
  );

  /**
   * POST /instances/:id/typing/:to
   * Send typing indicator to a chat
   */
  server.post(
    '/instances/:id/typing/:to',
    {
      schema: {
        description: 'Send typing indicator to a chat',
        tags: ['Presence'],
        summary: 'Send typing indicator',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['id', 'to'],
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
      const params = request.params as { id: string; to: string };

      const instanceManager = server.instanceManager;
      const client = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        await client.sendTyping(params.to);

        reply.send({
          success: true,
          data: { success: true },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to send typing indicator', { error: err.message });
      }
    },
  );

  /**
   * POST /instances/:id/recording/:to
   * Send recording indicator to a chat
   */
  server.post(
    '/instances/:id/recording/:to',
    {
      schema: {
        description: 'Send recording indicator to a chat',
        tags: ['Presence'],
        summary: 'Send recording indicator',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['id', 'to'],
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
      const params = request.params as { id: string; to: string };

      const instanceManager = server.instanceManager;
      const client = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        await client.sendRecording(params.to);

        reply.send({
          success: true,
          data: { success: true },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to send recording indicator', { error: err.message });
      }
    },
  );

  /**
   * POST /instances/:id/stop-typing/:to
   * Stop typing/recording indicator
   */
  server.post(
    '/instances/:id/stop-typing/:to',
    {
      schema: {
        description: 'Stop typing or recording indicator (send paused state)',
        tags: ['Presence'],
        summary: 'Stop typing indicator',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['id', 'to'],
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
      const params = request.params as { id: string; to: string };

      const instanceManager = server.instanceManager;
      const client = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        await client.stopTyping(params.to);

        reply.send({
          success: true,
          data: { success: true },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to stop typing indicator', { error: err.message });
      }
    },
  );

  /**
   * POST /instances/:id/read
   * Mark message as read
   */
  server.post(
    '/instances/:id/read',
    {
      schema: {
        description: 'Mark a message as read (send read receipt)',
        tags: ['Presence'],
        summary: 'Mark message as read',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          required: ['messageId', 'fromJid'],
          properties: {
            messageId: {
              type: 'string',
            },
            fromJid: {
              type: 'string',
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
      const params = request.params as { id: string };
      const body = request.body as { messageId: string; fromJid: string };

      const instanceManager = server.instanceManager;
      const client = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        // Create a minimal message object for markAsRead
        const message = {
          id: body.messageId,
          raw: {
            key: {
              from: body.fromJid,
              id: body.messageId,
            },
          },
        } as any;

        const result = await client.markAsRead(message);

        reply.send({
          success: true,
          data: { success: result },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to mark as read', { error: err.message });
      }
    },
  );

  /**
   * POST /instances/:id/subscribe/:jid
   * Subscribe to presence updates for a contact
   */
  server.post(
    '/instances/:id/subscribe/:jid',
    {
      schema: {
        description: 'Subscribe to presence updates for a contact',
        tags: ['Presence'],
        summary: 'Subscribe to presence',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            jid: { type: 'string' },
          },
          required: ['id', 'jid'],
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
      const params = request.params as { id: string; jid: string };

      const instanceManager = server.instanceManager;
      const client = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        await client.subscribePresence(params.jid);

        reply.send({
          success: true,
          data: { success: true },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to subscribe to presence', { error: err.message });
      }
    },
  );
}
