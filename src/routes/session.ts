/**
 * Session & Lifecycle Routes (Phase 14)
 * POST /instances/:id/logout - Logout and clear session
 * POST /instances/:id/dispose - Dispose and cleanup resources
 * DELETE /instances/:id/session - Clear session files manually
 * GET /instances/:id/stats/messages - Get message counts per chat
 * GET /instances/:id/stats/labels - Get labels store info
 */

import { FastifyInstance } from 'fastify';
import { createAuthMiddleware } from '../middleware/auth';
import { NotFoundError, ServiceUnavailableError } from '../utils/errorHandler';

/**
 * Register session lifecycle and stats routes
 */
export async function sessionRoutes(server: FastifyInstance): Promise<void> {
  // All routes require authentication
  server.addHook('onRequest', createAuthMiddleware());

  /**
   * POST /instances/:id/logout
   * Logout from WhatsApp and clear session
   */
  server.post(
    '/instances/:id/logout',
    {
      schema: {
        description: `Logout from WhatsApp and clear session files.

**What happens:**
- Sends logout notification to WhatsApp servers
- Clears all session/authentication files
- Instance status changes to \`disconnected\`

**After logout:**
- A new QR code scan is required to reconnect
- Previous session cannot be restored`,
        tags: ['Session'],
        summary: 'Logout instance',
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

      try {
        await client.logout();
        reply.send({
          success: true,
          message: 'Logged out successfully. Session cleared.',
        });
      } catch (err: any) {
        throw new ServiceUnavailableError(err.message);
      }
    },
  );

  /**
   * POST /instances/:id/dispose
   * Dispose instance and cleanup resources
   */
  server.post(
    '/instances/:id/dispose',
    {
      schema: {
        description: `Dispose instance and cleanup all resources.

**What happens:**
- Closes WebSocket connection
- Clears all in-memory data (messages, contacts, etc.)
- Removes event listeners
- Session files are preserved (can reconnect without QR)

**Use case:**
- Graceful shutdown
- Resource cleanup without losing authentication`,
        tags: ['Session'],
        summary: 'Dispose instance',
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

      try {
        await client.dispose();
        reply.send({
          success: true,
          message: 'Instance disposed successfully. Resources cleaned up.',
        });
      } catch (err: any) {
        throw new ServiceUnavailableError(err.message);
      }
    },
  );

  /**
   * DELETE /instances/:id/session
   * Clear session files manually
   */
  server.delete(
    '/instances/:id/session',
    {
      schema: {
        description: `Clear session files manually.

**What happens:**
- Deletes authentication/session files from disk
- Does NOT disconnect from WhatsApp (use logout for that)

**Use case:**
- Force fresh authentication on next connect
- Clean up corrupted session data`,
        tags: ['Session'],
        summary: 'Clear session',
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
              data: {
                type: 'object',
                properties: {
                  cleared: { type: 'boolean' },
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
      const client = instanceManager.getClient(params.id);

      if (!client) {
        throw new NotFoundError('Instance');
      }

      const cleared = client.clearSession();
      reply.send({
        success: true,
        message: cleared ? 'Session cleared successfully.' : 'No session to clear.',
        data: { cleared },
      });
    },
  );

  /**
   * GET /instances/:id/stats/messages
   * Get message counts per chat
   */
  server.get(
    '/instances/:id/stats/messages',
    {
      schema: {
        description: `Get message counts per chat from in-memory store.

**Returns:**
- \`counts\`: Object mapping chat JID to message count
- \`totalChats\`: Number of chats with messages
- \`totalMessages\`: Total messages across all chats

**Note:** Only includes messages stored in memory (history sync data).`,
        tags: ['Stats'],
        summary: 'Get message counts',
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
                  counts: {
                    type: 'object',
                    additionalProperties: { type: 'number' },
                  },
                  totalChats: { type: 'number' },
                  totalMessages: { type: 'number' },
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
      const client = instanceManager.getClient(params.id);

      if (!client) {
        throw new NotFoundError('Instance');
      }

      const countsMap = client.getMessageCounts();
      const counts = Object.fromEntries(countsMap);
      const totalChats = countsMap.size;
      let totalMessages = 0;
      countsMap.forEach((count: number) => {
        totalMessages += count;
      });

      reply.send({
        success: true,
        data: {
          counts,
          totalChats,
          totalMessages,
        },
      });
    },
  );

  /**
   * GET /instances/:id/stats/labels
   * Get labels store info
   */
  server.get(
    '/instances/:id/stats/labels',
    {
      schema: {
        description: `Get labels store statistics.

**Returns:**
- \`size\`: Number of labels in store
- \`eventCount\`: Number of label edit events received since connection
- \`lastSyncTime\`: Timestamp of last sync (if available)

**Note:** Labels are only available for WhatsApp Business accounts.`,
        tags: ['Stats'],
        summary: 'Get labels store info',
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
                  size: { type: 'number' },
                  eventCount: { type: 'number' },
                  lastSyncTime: { type: 'string', format: 'date-time', nullable: true },
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
      const client = instanceManager.getClient(params.id);

      if (!client) {
        throw new NotFoundError('Instance');
      }

      const labelsInfo = client.getLabelsStoreInfo();
      reply.send({
        success: true,
        data: {
          size: labelsInfo.size,
          eventCount: labelsInfo.eventCount,
          lastSyncTime: labelsInfo.lastSyncTime?.toISOString() || null,
        },
      });
    },
  );
}
