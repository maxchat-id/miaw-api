/**
 * Profile Management Routes
 * POST /instances/:id/profile/picture - Update profile picture
 * DELETE /instances/:id/profile/picture - Remove profile picture
 * PATCH /instances/:id/profile/name - Update profile name
 * PATCH /instances/:id/profile/status - Update profile status
 */

import { FastifyInstance } from 'fastify';
import { createAuthMiddleware } from '../middleware/auth';
import { NotFoundError, BadRequestError, ServiceUnavailableError } from '../utils/errorHandler';

/**
 * Register profile management routes
 */
export async function profileRoutes(server: FastifyInstance): Promise<void> {
  // All routes require authentication
  server.addHook('onRequest', createAuthMiddleware());

  /**
   * POST /instances/:id/profile/picture
   * Update profile picture from URL
   */
  server.post(
    '/instances/:id/profile/picture',
    {
      schema: {
        description: 'Update your profile picture from URL',
        tags: ['Profile'],
        summary: 'Update profile picture',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'updateProfilePicture#',
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
      const body = request.body as { url: string };

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
        const result = await client.updateProfilePicture(body.url);

        reply.send({
          success: true,
          data: { success: result.success },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to update profile picture', { error: err.message });
      }
    }
  );

  /**
   * DELETE /instances/:id/profile/picture
   * Remove profile picture
   */
  server.delete(
    '/instances/:id/profile/picture',
    {
      schema: {
        description: 'Remove your profile picture',
        tags: ['Profile'],
        summary: 'Remove profile picture',
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
        const result = await client.removeProfilePicture();

        reply.send({
          success: true,
          data: { success: result.success },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to remove profile picture', { error: err.message });
      }
    }
  );

  /**
   * PATCH /instances/:id/profile/name
   * Update profile name
   */
  server.patch(
    '/instances/:id/profile/name',
    {
      schema: {
        description: 'Update your profile display name',
        tags: ['Profile'],
        summary: 'Update profile name',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'updateProfileName#',
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
      const body = request.body as { name: string };

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
        const result = await client.updateProfileName(body.name);

        reply.send({
          success: true,
          data: { success: result.success },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to update profile name', { error: err.message });
      }
    }
  );

  /**
   * PATCH /instances/:id/profile/status
   * Update profile status (About text)
   */
  server.patch(
    '/instances/:id/profile/status',
    {
      schema: {
        description: 'Update your profile status (About text)',
        tags: ['Profile'],
        summary: 'Update profile status',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'updateProfileStatus#',
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
      const body = request.body as { status: string };

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
        const result = await client.updateProfileStatus(body.status);

        reply.send({
          success: true,
          data: { success: result.success },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to update profile status', { error: err.message });
      }
    }
  );
}
