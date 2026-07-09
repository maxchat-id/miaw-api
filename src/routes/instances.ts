/**
 * Instance Management Routes
 * POST /instances - Create new instance
 * GET /instances - List all instances
 * GET /instances/:id - Get instance details
 * DELETE /instances/:id - Delete instance
 */

import { FastifyInstance } from 'fastify';
import { createAuthMiddleware } from '../middleware/auth';
import { ConflictError, NotFoundError } from '../utils/errorHandler';
import { assertSafeWebhookUrl } from '../utils/ssrf';

/**
 * Register instance routes
 */
export async function instanceRoutes(server: FastifyInstance): Promise<void> {
  // All routes require authentication
  server.addHook('onRequest', createAuthMiddleware());

  /**
   * POST /instances
   * Create a new WhatsApp instance
   */
  server.post(
    '/instances',
    {
      schema: {
        description: 'Create a new WhatsApp instance',
        tags: ['Instances'],
        summary: 'Create instance',
        body: {
          $ref: 'createInstance#',
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  instanceId: { type: 'string' },
                  status: { type: 'string' },
                  webhookUrl: { type: 'string', nullable: true },
                  webhookEvents: { type: 'array', items: { type: 'string' } },
                  webhookEnabled: { type: 'boolean' },
                  createdAt: { type: 'string', format: 'date-time' },
                  lastActivity: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
          409: {
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
      const body = request.body as {
        instanceId: string;
        webhookUrl?: string;
        webhookEvents?: string[];
      };

      const instanceManager = (server as any).instanceManager;

      if (body.webhookUrl) {
        await assertSafeWebhookUrl(body.webhookUrl);
      }

      try {
        const state = await instanceManager.createInstance(body);
        reply.status(201).send({
          success: true,
          data: state,
        });
      } catch (err: any) {
        if (err.message?.includes('already exists')) {
          throw new ConflictError(`Instance ${body.instanceId} already exists`);
        }
        throw err;
      }
    }
  );

  /**
   * GET /instances
   * List all instances
   */
  server.get(
    '/instances',
    {
      schema: {
        description: 'List all WhatsApp instances',
        tags: ['Instances'],
        summary: 'List instances',
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
                    instanceId: { type: 'string' },
                    status: { type: 'string' },
                    webhookUrl: { type: 'string', nullable: true },
                    webhookEvents: { type: 'array', items: { type: 'string' } },
                    webhookEnabled: { type: 'boolean' },
                    createdAt: { type: 'string', format: 'date-time' },
                    lastActivity: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const instanceManager = (server as any).instanceManager;
      const instances = instanceManager.listInstances();

      reply.send({
        success: true,
        data: instances,
      });
    }
  );

  /**
   * GET /instances/:id
   * Get instance details
   */
  server.get(
    '/instances/:id',
    {
      schema: {
        description: 'Get instance details',
        tags: ['Instances'],
        summary: 'Get instance',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  instanceId: { type: 'string' },
                  status: { type: 'string' },
                  webhookUrl: { type: 'string', nullable: true },
                  webhookEvents: { type: 'array', items: { type: 'string' } },
                  webhookEnabled: { type: 'boolean' },
                  createdAt: { type: 'string', format: 'date-time' },
                  lastActivity: { type: 'string', format: 'date-time' },
                  connectedAt: { type: 'string', format: 'date-time', nullable: true },
                  phoneNumber: { type: 'string', nullable: true },
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
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const instanceManager = (server as any).instanceManager;
      const instance = instanceManager.getInstance(params.id);

      if (!instance) {
        throw new NotFoundError('Instance');
      }

      reply.send({
        success: true,
        data: instance,
      });
    }
  );

  /**
   * PATCH /instances/:id
   * Update instance webhook settings without recreating it
   */
  server.patch(
    '/instances/:id',
    {
      schema: {
        description: 'Update instance webhook settings (URL and/or events)',
        tags: ['Instances'],
        summary: 'Update instance',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'updateInstance#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  instanceId: { type: 'string' },
                  status: { type: 'string' },
                  webhookUrl: { type: 'string', nullable: true },
                  webhookEvents: { type: 'array', items: { type: 'string' } },
                  webhookEnabled: { type: 'boolean' },
                  createdAt: { type: 'string', format: 'date-time' },
                  lastActivity: { type: 'string', format: 'date-time' },
                  connectedAt: { type: 'string', format: 'date-time', nullable: true },
                  phoneNumber: { type: 'string', nullable: true },
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
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const body = request.body as {
        webhookUrl?: string | null;
        webhookEvents?: string[];
      };
      const instanceManager = (server as any).instanceManager;

      if (body.webhookUrl) {
        await assertSafeWebhookUrl(body.webhookUrl);
      }

      try {
        const state = instanceManager.updateWebhook(params.id, body);
        reply.send({
          success: true,
          data: state,
        });
      } catch (err: any) {
        if (err.message?.includes('not found')) {
          throw new NotFoundError('Instance');
        }
        throw err;
      }
    }
  );

  /**
   * DELETE /instances/:id
   * Delete instance
   */
  server.delete(
    '/instances/:id',
    {
      schema: {
        description: 'Delete a WhatsApp instance',
        tags: ['Instances'],
        summary: 'Delete instance',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
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
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const instanceManager = (server as any).instanceManager;

      try {
        await instanceManager.deleteInstance(params.id);
        reply.send({
          success: true,
          message: 'Instance deleted successfully',
        });
      } catch (err: any) {
        if (err.message?.includes('not found')) {
          throw new NotFoundError('Instance');
        }
        throw err;
      }
    }
  );
}
