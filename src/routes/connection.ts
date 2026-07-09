/**
 * Connection Routes
 * POST /instances/:id/connect - Connect instance (returns QR)
 * DELETE /instances/:id/disconnect - Disconnect instance
 * POST /instances/:id/restart - Restart instance
 * GET /instances/:id/status - Get connection status
 */

import { FastifyInstance } from 'fastify';
import { createAuthMiddleware } from '../middleware/auth';
import { NotFoundError, ServiceUnavailableError } from '../utils/errorHandler';

/**
 * Register connection routes
 */
export async function connectionRoutes(server: FastifyInstance): Promise<void> {
  // All routes require authentication
  server.addHook('onRequest', createAuthMiddleware());

  /**
   * POST /instances/:id/connect
   * Connect instance to WhatsApp
   */
  server.post(
    '/instances/:id/connect',
    {
      schema: {
        description: 'Connect instance to WhatsApp (returns QR code if needed). Scan the QR code with WhatsApp to authenticate. Listen to webhooks for the QR code.',
        tags: ['Connection'],
        summary: 'Connect instance',
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
                oneOf: [
                  {
                    type: 'object',
                    properties: {
                      status: { type: 'string', enum: ['connected', 'connecting'] },
                    },
                  },
                  {
                    type: 'object',
                    properties: {
                      status: { type: 'string', enum: ['qr_required'] },
                      qr: { type: 'string' },
                    },
                  },
                ],
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

      if (!client) {
        throw new NotFoundError('Instance');
      }

      const instance = instanceManager.getInstance(params.id);

      try {
        await client.connect();

        // Check current status
        const currentState = instance?.status;

        if (currentState === 'connected') {
          reply.send({
            success: true,
            data: { status: 'connected' },
          });
        } else if (currentState === 'qr_required') {
          // Get QR from latest event
          reply.send({
            success: true,
            data: {
              status: 'qr_required',
              qr: 'Scan QR code with WhatsApp (check webhook for QR)',
            },
          });
        } else {
          reply.send({
            success: true,
            data: { status: 'connecting' },
          });
        }
      } catch (err: any) {
        throw new ServiceUnavailableError(err.message);
      }
    }
  );

  /**
   * DELETE /instances/:id/disconnect
   * Disconnect instance from WhatsApp
   */
  server.delete(
    '/instances/:id/disconnect',
    {
      schema: {
        description: 'Disconnect instance from WhatsApp. You can reconnect later using the connect endpoint.',
        tags: ['Connection'],
        summary: 'Disconnect instance',
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
      const instanceManager = server.instanceManager;
      const client = instanceManager.getClient(params.id);

      if (!client) {
        throw new NotFoundError('Instance');
      }

      await client.disconnect();

      reply.send({
        success: true,
        message: 'Instance disconnected successfully',
      });
    }
  );

  /**
   * POST /instances/:id/restart
   * Restart instance connection
   */
  server.post(
    '/instances/:id/restart',
    {
      schema: {
        description: 'Restart instance connection. Useful when the connection is stale or having issues.',
        tags: ['Connection'],
        summary: 'Restart instance',
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
      const instanceManager = server.instanceManager;
      const client = instanceManager.getClient(params.id);

      if (!client) {
        throw new NotFoundError('Instance');
      }

      // Disconnect first if connected
      try {
        await client.disconnect();
      } catch {
        // Ignore disconnect errors
      }

      // Reconnect
      await client.connect();

      reply.send({
        success: true,
        message: 'Instance restarted successfully',
      });
    }
  );

  /**
   * GET /instances/:id/status
   * Get connection status
   */
  server.get(
    '/instances/:id/status',
    {
      schema: {
        description: `Get instance connection status.

**Possible statuses:**
- \`disconnected\`: Not connected to WhatsApp
- \`connecting\`: Connection in progress
- \`connected\`: Successfully connected
- \`reconnecting\`: Reconnection in progress (after connection loss)
- \`qr_required\`: QR code needs to be scanned`,
        tags: ['Connection'],
        summary: 'Get instance status',
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
                  status: {
                    type: 'string',
                    enum: ['disconnected', 'connecting', 'connected', 'reconnecting', 'qr_required'],
                  },
                  phoneNumber: { type: 'string', nullable: true },
                  connectedAt: { type: 'string', format: 'date-time', nullable: true },
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

      reply.send({
        success: true,
        data: {
          instanceId: instance.instanceId,
          status: instance.status,
          phoneNumber: instance.phoneNumber,
          connectedAt: instance.connectedAt,
        },
      });
    }
  );
}
