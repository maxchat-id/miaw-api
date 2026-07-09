/**
 * Newsletter Management Routes
 * POST /instances/:id/newsletters - Create newsletter
 * DELETE /instances/:id/newsletters/:newsletterId - Delete newsletter
 * GET /instances/:id/newsletters/:newsletterId - Get newsletter metadata
 * GET /instances/:id/newsletters/:newsletterId/messages - Get newsletter messages
 * POST /instances/:id/newsletters/:newsletterId/messages/text - Send text message
 * POST /instances/:id/newsletters/:newsletterId/messages/image - Send image
 * POST /instances/:id/newsletters/:newsletterId/messages/video - Send video
 * POST /instances/:id/newsletters/:newsletterId/follow - Follow newsletter
 * DELETE /instances/:id/newsletters/:newsletterId/follow - Unfollow newsletter
 * POST /instances/:id/newsletters/:newsletterId/mute - Mute newsletter
 * DELETE /instances/:id/newsletters/:newsletterId/mute - Unmute newsletter
 * PATCH /instances/:id/newsletters/:newsletterId/name - Update name
 * PATCH /instances/:id/newsletters/:newsletterId/description - Update description
 * POST /instances/:id/newsletters/:newsletterId/picture - Update picture
 * DELETE /instances/:id/newsletters/:newsletterId/picture - Remove picture
 * POST /instances/:id/newsletters/:newsletterId/messages/:messageId/reaction - React to message
 * POST /instances/:id/newsletters/:newsletterId/subscribe - Subscribe to updates
 * GET /instances/:id/newsletters/:newsletterId/subscribers - Get subscriber info
 * GET /instances/:id/newsletters/:newsletterId/admins/count - Get admin count
 * POST /instances/:id/newsletters/:newsletterId/owner - Transfer ownership
 * DELETE /instances/:id/newsletters/:newsletterId/admins/:adminJid - Demote admin
 */

import { FastifyInstance } from 'fastify';
import type { MiawClient } from 'miaw-core';
import { createAuthMiddleware } from '../middleware/auth';
import { NotFoundError, BadRequestError, ServiceUnavailableError } from '../utils/errorHandler';

/**
 * Register newsletter management routes
 */
export async function newsletterRoutes(server: FastifyInstance): Promise<void> {
  // All routes require authentication
  server.addHook('onRequest', createAuthMiddleware());

  /**
   * GET /instances/:id/newsletters/:newsletterId
   * Get newsletter metadata
   */
  server.get(
    '/instances/:id/newsletters/:newsletterId',
    {
      schema: {
        description: 'Get newsletter/channel metadata',
        tags: ['Newsletters'],
        summary: 'Get newsletter metadata',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
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
                  description: { type: 'string' },
                  picture: { type: 'string' },
                  createTime: { type: 'number' },
                  updateTime: { type: 'number' },
                  isOwn: { type: 'boolean' },
                  isSubscribed: { type: 'boolean' },
                  isMuted: { type: 'boolean' },
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
      const params = request.params as { id: string; newsletterId: string };

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
        const metadata = await client.getNewsletterMetadata(params.newsletterId);

        reply.send({
          success: true,
          data: metadata,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to get newsletter metadata', {
          error: err.message,
        });
      }
    }
  );

  /**
   * GET /instances/:id/newsletters/:newsletterId/messages
   * Get newsletter messages
   */
  server.get(
    '/instances/:id/newsletters/:newsletterId/messages',
    {
      schema: {
        description: 'Get messages from a newsletter/channel',
        tags: ['Newsletters'],
        summary: 'Get newsletter messages',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100, default: 10 },
            count: { type: 'number', minimum: 1, maximum: 100, default: 10 },
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
                  id: { type: 'string' },
                  name: { type: 'string' },
                  messages: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        messageId: { type: 'string' },
                        timestamp: { type: 'number' },
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
      const params = request.params as { id: string; newsletterId: string };
      const query = request.query as { limit?: number; count?: number };

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
        const messages = await client.fetchNewsletterMessages(
          params.newsletterId,
          query.limit || query.count
        );

        reply.send({
          success: true,
          data: messages,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to get newsletter messages', {
          error: err.message,
        });
      }
    }
  );

  /**
   * POST /instances/:id/newsletters
   * Create a new newsletter
   */
  server.post(
    '/instances/:id/newsletters',
    {
      schema: {
        description: 'Create a new newsletter/channel',
        tags: ['Newsletters'],
        summary: 'Create newsletter',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'createNewsletter#',
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
                  newsletterId: { type: 'string' },
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
      const body = request.body as { name: string; description?: string };

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
        const result = await client.createNewsletter(body.name, body.description);

        reply.send({
          success: true,
          data: result,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to create newsletter', {
          error: err.message,
        });
      }
    }
  );

  /**
   * DELETE /instances/:id/newsletters/:newsletterId
   * Delete a newsletter
   */
  server.delete(
    '/instances/:id/newsletters/:newsletterId',
    {
      schema: {
        description: 'Delete a newsletter/channel',
        tags: ['Newsletters'],
        summary: 'Delete newsletter',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
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
      const params = request.params as { id: string; newsletterId: string };

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
        const result = await client.deleteNewsletter(params.newsletterId);

        reply.send({
          success: true,
          data: { success: result },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to delete newsletter', {
          error: err.message,
        });
      }
    }
  );

  /**
   * POST /instances/:id/newsletters/:newsletterId/messages/text
   * Send text message to newsletter
   */
  server.post(
    '/instances/:id/newsletters/:newsletterId/messages/text',
    {
      schema: {
        description: 'Send a text message to a newsletter/channel',
        tags: ['Newsletters'],
        summary: 'Send newsletter text',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
        },
        body: {
          $ref: 'sendNewsletterText#',
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
                  messageId: { type: 'string' },
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
      const params = request.params as { id: string; newsletterId: string };
      const body = request.body as { text: string };

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
        const result = await client.sendNewsletterMessage(params.newsletterId, body.text);

        reply.send({
          success: true,
          data: result,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to send newsletter text', {
          error: err.message,
        });
      }
    }
  );

  /**
   * POST /instances/:id/newsletters/:newsletterId/messages/image
   * Send image to newsletter
   */
  server.post(
    '/instances/:id/newsletters/:newsletterId/messages/image',
    {
      schema: {
        description: 'Send an image to a newsletter/channel',
        tags: ['Newsletters'],
        summary: 'Send newsletter image',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
        },
        body: {
          $ref: 'sendNewsletterImage#',
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
                  messageId: { type: 'string' },
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
      const params = request.params as { id: string; newsletterId: string };
      const body = request.body as { image: string; caption?: string };

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
        const result = await client.sendNewsletterImage(params.newsletterId, body.image, body.caption);

        reply.send({
          success: true,
          data: result,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to send newsletter image', {
          error: err.message,
        });
      }
    }
  );

  /**
   * POST /instances/:id/newsletters/:newsletterId/messages/video
   * Send video to newsletter
   */
  server.post(
    '/instances/:id/newsletters/:newsletterId/messages/video',
    {
      schema: {
        description: 'Send a video to a newsletter/channel',
        tags: ['Newsletters'],
        summary: 'Send newsletter video',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
        },
        body: {
          $ref: 'sendNewsletterVideo#',
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
                  messageId: { type: 'string' },
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
      const params = request.params as { id: string; newsletterId: string };
      const body = request.body as { video: string; caption?: string };

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
        const result = await client.sendNewsletterVideo(params.newsletterId, body.video, body.caption);

        reply.send({
          success: true,
          data: result,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to send newsletter video', {
          error: err.message,
        });
      }
    }
  );

  /**
   * POST /instances/:id/newsletters/:newsletterId/follow
   * Follow a newsletter
   */
  server.post(
    '/instances/:id/newsletters/:newsletterId/follow',
    {
      schema: {
        description: 'Follow/subscribe to a newsletter/channel',
        tags: ['Newsletters'],
        summary: 'Follow newsletter',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
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
      const params = request.params as { id: string; newsletterId: string };

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
        const result = await client.followNewsletter(params.newsletterId);

        reply.send({
          success: true,
          data: { success: result },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to follow newsletter', {
          error: err.message,
        });
      }
    }
  );

  /**
   * DELETE /instances/:id/newsletters/:newsletterId/follow
   * Unfollow a newsletter
   */
  server.delete(
    '/instances/:id/newsletters/:newsletterId/follow',
    {
      schema: {
        description: 'Unfollow/unsubscribe from a newsletter/channel',
        tags: ['Newsletters'],
        summary: 'Unfollow newsletter',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
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
      const params = request.params as { id: string; newsletterId: string };

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
        const result = await client.unfollowNewsletter(params.newsletterId);

        reply.send({
          success: true,
          data: { success: result },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to unfollow newsletter', {
          error: err.message,
        });
      }
    }
  );

  /**
   * POST /instances/:id/newsletters/:newsletterId/mute
   * Mute a newsletter
   */
  server.post(
    '/instances/:id/newsletters/:newsletterId/mute',
    {
      schema: {
        description: 'Mute a newsletter/channel (stop receiving notifications)',
        tags: ['Newsletters'],
        summary: 'Mute newsletter',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
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
      const params = request.params as { id: string; newsletterId: string };

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
        const result = await client.muteNewsletter(params.newsletterId);

        reply.send({
          success: true,
          data: { success: result },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to mute newsletter', {
          error: err.message,
        });
      }
    }
  );

  /**
   * DELETE /instances/:id/newsletters/:newsletterId/mute
   * Unmute a newsletter
   */
  server.delete(
    '/instances/:id/newsletters/:newsletterId/mute',
    {
      schema: {
        description: 'Unmute a newsletter/channel (resume receiving notifications)',
        tags: ['Newsletters'],
        summary: 'Unmute newsletter',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
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
      const params = request.params as { id: string; newsletterId: string };

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
        const result = await client.unmuteNewsletter(params.newsletterId);

        reply.send({
          success: true,
          data: { success: result },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to unmute newsletter', {
          error: err.message,
        });
      }
    }
  );

  /**
   * POST /instances/:id/newsletters/:newsletterId/subscribe
   * Subscribe to newsletter updates
   */
  server.post(
    '/instances/:id/newsletters/:newsletterId/subscribe',
    {
      schema: {
        description: 'Subscribe to live newsletter updates/push notifications',
        tags: ['Newsletters'],
        summary: 'Subscribe to updates',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
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
      const params = request.params as { id: string; newsletterId: string };

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
        const result = await client.subscribeNewsletterUpdates(params.newsletterId);

        reply.send({
          success: true,
          data: { success: result },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to subscribe to newsletter updates', {
          error: err.message,
        });
      }
    }
  );

  /**
   * PATCH /instances/:id/newsletters/:newsletterId/name
   * Update newsletter name
   */
  server.patch(
    '/instances/:id/newsletters/:newsletterId/name',
    {
      schema: {
        description: 'Update the name of a newsletter/channel you own',
        tags: ['Newsletters'],
        summary: 'Update newsletter name',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
        },
        body: { $ref: 'updateNewsletterName#' },
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
      const params = request.params as { id: string; newsletterId: string };
      const body = request.body as { name: string };

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
        const result = await client.updateNewsletterName(params.newsletterId, body.name);

        reply.send({
          success: true,
          data: { success: result },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to update newsletter name', {
          error: err.message,
        });
      }
    }
  );

  /**
   * PATCH /instances/:id/newsletters/:newsletterId/description
   * Update newsletter description
   */
  server.patch(
    '/instances/:id/newsletters/:newsletterId/description',
    {
      schema: {
        description: 'Update the description of a newsletter/channel you own',
        tags: ['Newsletters'],
        summary: 'Update newsletter description',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
        },
        body: { $ref: 'updateNewsletterDescription#' },
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
      const params = request.params as { id: string; newsletterId: string };
      const body = request.body as { description: string };

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
        const result = await client.updateNewsletterDescription(params.newsletterId, body.description);

        reply.send({
          success: true,
          data: { success: result },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to update newsletter description', {
          error: err.message,
        });
      }
    }
  );

  /**
   * POST /instances/:id/newsletters/:newsletterId/picture
   * Update newsletter picture
   */
  server.post(
    '/instances/:id/newsletters/:newsletterId/picture',
    {
      schema: {
        description: 'Update the profile picture of a newsletter/channel you own',
        tags: ['Newsletters'],
        summary: 'Update newsletter picture',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
        },
        body: { $ref: 'updateNewsletterPicture#' },
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
      const params = request.params as { id: string; newsletterId: string };
      const body = request.body as { image: string };

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
        const result = await client.updateNewsletterPicture(params.newsletterId, body.image);

        reply.send({
          success: true,
          data: { success: result },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to update newsletter picture', {
          error: err.message,
        });
      }
    }
  );

  /**
   * DELETE /instances/:id/newsletters/:newsletterId/picture
   * Remove newsletter picture
   */
  server.delete(
    '/instances/:id/newsletters/:newsletterId/picture',
    {
      schema: {
        description: 'Remove the profile picture of a newsletter/channel you own',
        tags: ['Newsletters'],
        summary: 'Remove newsletter picture',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
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
      const params = request.params as { id: string; newsletterId: string };

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
        const result = await client.removeNewsletterPicture(params.newsletterId);

        reply.send({
          success: true,
          data: { success: result },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to remove newsletter picture', {
          error: err.message,
        });
      }
    }
  );

  /**
   * GET /instances/:id/newsletters/:newsletterId/subscribers
   * Get newsletter subscribers
   */
  server.get(
    '/instances/:id/newsletters/:newsletterId/subscribers',
    {
      schema: {
        description: 'Get the list of subscribers for a newsletter/channel you own',
        tags: ['Newsletters'],
        summary: 'Get newsletter subscribers',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  subscribers: {
                    type: 'array',
                    items: { type: 'object' },
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
      const params = request.params as { id: string; newsletterId: string };

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
        const subscribers = await client.getNewsletterSubscribers(params.newsletterId);

        reply.send({
          success: true,
          data: { subscribers },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to get newsletter subscribers', {
          error: err.message,
        });
      }
    }
  );

  /**
   * GET /instances/:id/newsletters/:newsletterId/admins/count
   * Get newsletter admin count
   */
  server.get(
    '/instances/:id/newsletters/:newsletterId/admins/count',
    {
      schema: {
        description: 'Get the number of admins for a newsletter/channel',
        tags: ['Newsletters'],
        summary: 'Get newsletter admin count',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  count: { type: 'number' },
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
      const params = request.params as { id: string; newsletterId: string };

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
        const count = await client.getNewsletterAdminCount(params.newsletterId);

        reply.send({
          success: true,
          data: { count },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to get newsletter admin count', {
          error: err.message,
        });
      }
    }
  );

  /**
   * POST /instances/:id/newsletters/:newsletterId/owner
   * Transfer newsletter ownership
   */
  server.post(
    '/instances/:id/newsletters/:newsletterId/owner',
    {
      schema: {
        description: 'Transfer ownership of a newsletter/channel to another user',
        tags: ['Newsletters'],
        summary: 'Transfer newsletter ownership',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
          },
          required: ['id', 'newsletterId'],
        },
        body: { $ref: 'changeNewsletterOwner#' },
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
      const params = request.params as { id: string; newsletterId: string };
      const body = request.body as { newOwnerJid: string };

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
        const result = await client.changeNewsletterOwner(params.newsletterId, body.newOwnerJid);

        reply.send({
          success: true,
          data: { success: result },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to transfer newsletter ownership', {
          error: err.message,
        });
      }
    }
  );

  /**
   * DELETE /instances/:id/newsletters/:newsletterId/admins/:adminJid
   * Demote newsletter admin
   */
  server.delete(
    '/instances/:id/newsletters/:newsletterId/admins/:adminJid',
    {
      schema: {
        description: 'Demote an admin of a newsletter/channel you own',
        tags: ['Newsletters'],
        summary: 'Demote newsletter admin',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
            adminJid: { type: 'string' },
          },
          required: ['id', 'newsletterId', 'adminJid'],
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
      const params = request.params as { id: string; newsletterId: string; adminJid: string };

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
        const result = await client.demoteNewsletterAdmin(params.newsletterId, params.adminJid);

        reply.send({
          success: true,
          data: { success: result },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to demote newsletter admin', {
          error: err.message,
        });
      }
    }
  );

  /**
   * POST /instances/:id/newsletters/:newsletterId/messages/:messageId/reaction
   * React to a newsletter message
   */
  server.post(
    '/instances/:id/newsletters/:newsletterId/messages/:messageId/reaction',
    {
      schema: {
        description: 'React to a newsletter/channel message with an emoji. Use empty string to remove reaction.',
        tags: ['Newsletters'],
        summary: 'React to newsletter message',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            newsletterId: { type: 'string' },
            messageId: { type: 'string' },
          },
          required: ['id', 'newsletterId', 'messageId'],
        },
        body: { $ref: 'reactToNewsletterMessage#' },
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
      const params = request.params as { id: string; newsletterId: string; messageId: string };
      const body = request.body as { emoji: string };

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
        const result = await client.reactToNewsletterMessage(
          params.newsletterId,
          params.messageId,
          body.emoji
        );

        reply.send({
          success: true,
          data: { success: result },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to react to newsletter message', {
          error: err.message,
        });
      }
    }
  );
}
