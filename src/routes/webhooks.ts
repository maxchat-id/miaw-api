/**
 * Webhook Management Routes
 * POST /instances/:id/webhook/test - Send test webhook
 * GET /instances/:id/webhook/status - Get webhook delivery stats
 */

import { FastifyInstance } from 'fastify';
import { createAuthMiddleware } from '../middleware/auth';
import { NotFoundError, BadRequestError, ServiceUnavailableError } from '../utils/errorHandler';

/**
 * Register webhook management routes
 */
export async function webhookRoutes(server: FastifyInstance): Promise<void> {
  // All routes require authentication
  server.addHook('onRequest', createAuthMiddleware());

  /**
   * POST /instances/:id/webhook/test
   * Send test webhook to configured URL
   */
  server.post(
    '/instances/:id/webhook/test',
    {
      schema: {
        description: 'Send a test webhook event to the configured URL',
        tags: ['Webhooks'],
        summary: 'Test webhook delivery',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            event: {
              type: 'string',
              enum: ['test', 'message', 'ready', 'connection'],
              description: 'Test event type to send',
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
                  sent: { type: 'boolean' },
                  webhookUrl: { type: 'string' },
                  testEvent: { type: 'object' },
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
      const body = request.body as { event?: string };

      const instanceManager = server.instanceManager;
      const instance = instanceManager.getInstance(params.id);

      if (!instance) {
        throw new NotFoundError('Instance');
      }

      if (!instance.webhookUrl) {
        throw new BadRequestError('No webhook URL configured for this instance');
      }

      // Create test event payload
      const testEvent = {
        event: body.event || 'test',
        instanceId: params.id,
        timestamp: Date.now(),
        data: {
          test: true,
          message: 'This is a test webhook from Miaw API',
        },
      };

      try {
        // Get webhook dispatcher and queue test event
        const webhookDispatcher = server.webhookDispatcher;
        if (!webhookDispatcher) {
          throw new ServiceUnavailableError('Webhook dispatcher not available');
        }

        await webhookDispatcher.queue(instance.webhookUrl, testEvent);

        // Wait a moment for delivery attempt
        await new Promise((resolve) => setTimeout(resolve, 2000));

        reply.send({
          success: true,
          data: {
            sent: true,
            webhookUrl: instance.webhookUrl,
            testEvent,
          },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to send test webhook', {
          error: err.message,
        });
      }
    },
  );

  /**
   * GET /instances/:id/webhook/status
   * Get webhook delivery statistics
   */
  server.get(
    '/instances/:id/webhook/status',
    {
      schema: {
        description: 'Get webhook delivery statistics for an instance',
        tags: ['Webhooks'],
        summary: 'Get webhook statistics',
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
                  webhookUrl: { type: 'string' },
                  webhookEvents: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  stats: {
                    type: 'object',
                    properties: {
                      queued: { type: 'number' },
                      delivered: { type: 'number' },
                      failed: { type: 'number' },
                      lastDeliveryTime: { type: 'number' },
                      lastFailureTime: { type: 'number' },
                    },
                  },
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

      const instanceManager = server.instanceManager;
      const instance = instanceManager.getInstance(params.id);

      if (!instance) {
        throw new NotFoundError('Instance');
      }

      try {
        const webhookDispatcher = server.webhookDispatcher;
        if (!webhookDispatcher) {
          throw new ServiceUnavailableError('Webhook dispatcher not available');
        }

        const stats = webhookDispatcher.getStats();

        reply.send({
          success: true,
          data: {
            instanceId: params.id,
            webhookUrl: instance.webhookUrl || null,
            webhookEvents: instance.webhookEvents || [],
            stats,
          },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to get webhook status', {
          error: err.message,
        });
      }
    },
  );
}
