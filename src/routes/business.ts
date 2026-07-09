/**
 * Business Features Routes
 * POST /instances/:id/labels - Create label
 * DELETE /instances/:id/labels/:labelId - Delete label
 * POST /instances/:id/chats/:jid/labels/:labelId - Add label to chat
 * DELETE /instances/:id/chats/:jid/labels/:labelId - Remove label from chat
 * POST /instances/:id/messages/:messageId/labels/:labelId - Add label to message
 * DELETE /instances/:id/messages/:messageId/labels/:labelId - Remove label from message
 * GET /instances/:id/labels/:labelId/chats - Get chats by label (Phase 13)
 * GET /instances/:id/products/catalog - Get product catalog
 * GET /instances/:id/products/collections - Get product collections
 * POST /instances/:id/products - Create product (Phase 13)
 * PATCH /instances/:id/products/:productId - Update product (Phase 13)
 * DELETE /instances/:id/products - Delete products (Phase 13)
 */

import { FastifyInstance } from 'fastify';
import type { MiawClient, Label } from 'miaw-core';
import { createAuthMiddleware } from '../middleware/auth';
import { NotFoundError, BadRequestError, ServiceUnavailableError } from '../utils/errorHandler';

/**
 * Register business features routes
 */
export async function businessRoutes(server: FastifyInstance): Promise<void> {
  // All routes require authentication
  server.addHook('onRequest', createAuthMiddleware());

  // ===================== LABEL MANAGEMENT =====================

  /**
   * POST /instances/:id/labels
   * Create or edit a label
   */
  server.post(
    '/instances/:id/labels',
    {
      schema: {
        description: 'Create or edit a label (WhatsApp Business only)',
        tags: ['Business'],
        summary: 'Create/edit label',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          required: ['name', 'color'],
          properties: {
            id: { type: 'string', description: 'Label ID (required for edit)' },
            name: { type: 'string', minLength: 1, maxLength: 50 },
            color: { type: 'integer', minimum: 0, maximum: 19 },
            predefinedId: { type: 'string' },
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
                  labelId: { type: 'string' },
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
      const body = request.body as {
        id?: string;
        name: string;
        color: number;
        predefinedId?: string;
      };

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
        const result = await client.addLabel({
          id: body.id || '',
          name: body.name,
          color: body.color,
          deleted: false,
          predefinedId: body.predefinedId as unknown as Label['predefinedId'],
        });

        reply.send({
          success: true,
          data: {
            success: result.success,
            labelId: result.labelId,
          },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to create label', { error: err.message });
      }
    }
  );

  /**
   * DELETE /instances/:id/labels/:labelId
   * Delete a label
   */
  server.delete(
    '/instances/:id/labels/:labelId',
    {
      schema: {
        description: 'Delete a label (WhatsApp Business only)',
        tags: ['Business'],
        summary: 'Delete label',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            labelId: { type: 'string' },
          },
          required: ['id', 'labelId'],
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
      const params = request.params as { id: string; labelId: string };

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
        // Delete by setting deleted flag to true
        const result = await client.addLabel({
          id: params.labelId,
          name: '',
          color: 0,
          deleted: true,
        });

        reply.send({
          success: true,
          data: {
            success: result.success,
          },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to delete label', { error: err.message });
      }
    }
  );

  /**
   * POST /instances/:id/chats/:jid/labels/:labelId
   * Add label to chat
   */
  server.post(
    '/instances/:id/chats/:jid/labels/:labelId',
    {
      schema: {
        description: 'Add a label to a chat (WhatsApp Business only)',
        tags: ['Business'],
        summary: 'Add label to chat',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            jid: { type: 'string' },
            labelId: { type: 'string' },
          },
          required: ['id', 'jid', 'labelId'],
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
      const params = request.params as { id: string; jid: string; labelId: string };

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
        const result = await client.addChatLabel(params.jid, params.labelId);

        reply.send({
          success: true,
          data: {
            success: result.success,
          },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to add label to chat', { error: err.message });
      }
    }
  );

  /**
   * DELETE /instances/:id/chats/:jid/labels/:labelId
   * Remove label from chat
   */
  server.delete(
    '/instances/:id/chats/:jid/labels/:labelId',
    {
      schema: {
        description: 'Remove a label from a chat (WhatsApp Business only)',
        tags: ['Business'],
        summary: 'Remove label from chat',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            jid: { type: 'string' },
            labelId: { type: 'string' },
          },
          required: ['id', 'jid', 'labelId'],
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
      const params = request.params as { id: string; jid: string; labelId: string };

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
        const result = await client.removeChatLabel(params.jid, params.labelId);

        reply.send({
          success: true,
          data: {
            success: result.success,
          },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to remove label from chat', {
          error: err.message,
        });
      }
    }
  );

  /**
   * POST /instances/:id/messages/:messageId/labels/:labelId
   * Add label to message
   */
  server.post(
    '/instances/:id/messages/:messageId/labels/:labelId',
    {
      schema: {
        description: 'Add a label to a message (WhatsApp Business only)',
        tags: ['Business'],
        summary: 'Add label to message',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            messageId: { type: 'string' },
            labelId: { type: 'string' },
          },
          required: ['id', 'messageId', 'labelId'],
        },
        body: {
          type: 'object',
          required: ['jid'],
          properties: {
            jid: { type: 'string', description: 'Chat JID where the message is' },
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
      const params = request.params as { id: string; messageId: string; labelId: string };
      const body = request.body as { jid: string };

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
        const result = await client.addMessageLabel(body.jid, params.messageId, params.labelId);

        reply.send({
          success: true,
          data: {
            success: result.success,
          },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to add label to message', {
          error: err.message,
        });
      }
    }
  );

  /**
   * DELETE /instances/:id/messages/:messageId/labels/:labelId
   * Remove label from message
   */
  server.delete(
    '/instances/:id/messages/:messageId/labels/:labelId',
    {
      schema: {
        description: 'Remove a label from a message (WhatsApp Business only)',
        tags: ['Business'],
        summary: 'Remove label from message',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            messageId: { type: 'string' },
            labelId: { type: 'string' },
          },
          required: ['id', 'messageId', 'labelId'],
        },
        body: {
          type: 'object',
          required: ['jid'],
          properties: {
            jid: { type: 'string', description: 'Chat JID where the message is' },
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
      const params = request.params as { id: string; messageId: string; labelId: string };
      const body = request.body as { jid: string };

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
        const result = await client.removeMessageLabel(body.jid, params.messageId, params.labelId);

        reply.send({
          success: true,
          data: {
            success: result.success,
          },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to remove label from message', {
          error: err.message,
        });
      }
    }
  );

  /**
   * GET /instances/:id/labels/:labelId/chats
   * Get all chats associated with a label
   */
  server.get(
    '/instances/:id/labels/:labelId/chats',
    {
      schema: {
        description: 'Get all chats associated with a label (WhatsApp Business only)',
        tags: ['Business'],
        summary: 'Get chats by label',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            labelId: { type: 'string' },
          },
          required: ['id', 'labelId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  chats: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        jid: { type: 'string' },
                        phone: { type: 'string' },
                        isGroup: { type: 'boolean' },
                        name: { type: 'string' },
                        unreadCount: { type: 'number' },
                        lastMessageTimestamp: { type: 'number' },
                        isArchived: { type: 'boolean' },
                        isPinned: { type: 'boolean' },
                      },
                    },
                  },
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
      const params = request.params as { id: string; labelId: string };

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
        // getChatsByLabel is synchronous in miaw-core
        const chats = client.getChatsByLabel(params.labelId);

        reply.send({
          success: true,
          data: {
            chats,
            count: chats.length,
          },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to get chats by label', { error: err.message });
      }
    }
  );

  // ===================== PRODUCT CATALOG =====================

  /**
   * GET /instances/:id/products/catalog
   * Get product catalog
   */
  server.get(
    '/instances/:id/products/catalog',
    {
      schema: {
        description: 'Get product catalog from a WhatsApp Business account',
        tags: ['Business'],
        summary: 'Get product catalog',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        querystring: {
          type: 'object',
          properties: {
            businessJid: { type: 'string', description: 'Business JID (default: your own)' },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 10 },
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
                  isCatalog: { type: 'boolean' },
                  limit: { type: 'number' },
                  products: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        description: { type: 'string' },
                        price: { type: 'number' },
                        images: { type: 'array' },
                        url: { type: 'string' },
                        retailerId: { type: 'string' },
                        count: { type: 'number' },
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
      const query = request.query as { businessJid?: string; limit?: number };

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
        const catalog = await client.getCatalog(query.businessJid, query.limit);

        reply.send({
          success: true,
          data: catalog,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to get product catalog', { error: err.message });
      }
    }
  );

  /**
   * GET /instances/:id/products/collections
   * Get product collections
   */
  server.get(
    '/instances/:id/products/collections',
    {
      schema: {
        description: 'Get product collections from a WhatsApp Business account',
        tags: ['Business'],
        summary: 'Get product collections',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        querystring: {
          type: 'object',
          properties: {
            businessJid: { type: 'string', description: 'Business JID (default: your own)' },
          },
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
                    id: { type: 'string' },
                    name: { type: 'string' },
                    products: {
                      type: 'array',
                      items: {
                        type: 'object',
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
      const query = request.query as { businessJid?: string };

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
        const collections = await client.getCollections(query.businessJid);

        reply.send({
          success: true,
          data: collections,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to get product collections', {
          error: err.message,
        });
      }
    }
  );

  /**
   * POST /instances/:id/products
   * Create a new product in the catalog
   */
  server.post(
    '/instances/:id/products',
    {
      schema: {
        description: 'Create a new product in the catalog (WhatsApp Business only)',
        tags: ['Business'],
        summary: 'Create product',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: { $ref: 'createProduct' },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  productId: { type: 'string' },
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
      const body = request.body as {
        name: string;
        description: string;
        price: number;
        currency: string;
        imageUrls?: string[];
        isHidden?: boolean;
        retailerId?: string;
        url?: string;
        originCountryCode?: string;
      };

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
        const result = await client.createProduct({
          name: body.name,
          description: body.description,
          price: body.price,
          currency: body.currency,
          imageUrls: body.imageUrls,
          isHidden: body.isHidden,
          retailerId: body.retailerId,
          url: body.url,
          originCountryCode: body.originCountryCode,
        });

        if (!result.success) {
          throw new BadRequestError('Failed to create product', { error: result.error });
        }

        reply.send({
          success: true,
          data: {
            success: result.success,
            productId: result.productId,
          },
        });
      } catch (err: any) {
        if (err instanceof BadRequestError) throw err;
        throw new BadRequestError('Failed to create product', { error: err.message });
      }
    }
  );

  /**
   * PATCH /instances/:id/products/:productId
   * Update an existing product in the catalog
   */
  server.patch(
    '/instances/:id/products/:productId',
    {
      schema: {
        description: 'Update an existing product in the catalog (WhatsApp Business only)',
        tags: ['Business'],
        summary: 'Update product',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            productId: { type: 'string' },
          },
          required: ['id', 'productId'],
        },
        body: { $ref: 'updateProduct' },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  productId: { type: 'string' },
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
      const params = request.params as { id: string; productId: string };
      const body = request.body as {
        name?: string;
        description?: string;
        price?: number;
        currency?: string;
        imageUrls?: string[];
        isHidden?: boolean;
        retailerId?: string;
        url?: string;
        originCountryCode?: string;
      };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      // Build options object with only provided fields
      const options: any = {};
      if (body.name !== undefined) options.name = body.name;
      if (body.description !== undefined) options.description = body.description;
      if (body.price !== undefined) options.price = body.price;
      if (body.currency !== undefined) options.currency = body.currency;
      if (body.imageUrls !== undefined) options.imageUrls = body.imageUrls;
      if (body.isHidden !== undefined) options.isHidden = body.isHidden;
      if (body.retailerId !== undefined) options.retailerId = body.retailerId;
      if (body.url !== undefined) options.url = body.url;
      if (body.originCountryCode !== undefined) options.originCountryCode = body.originCountryCode;

      try {
        const result = await client.updateProduct(params.productId, options);

        if (!result.success) {
          throw new BadRequestError('Failed to update product', { error: result.error });
        }

        reply.send({
          success: true,
          data: {
            success: result.success,
            productId: result.productId,
          },
        });
      } catch (err: any) {
        if (err instanceof BadRequestError) throw err;
        throw new BadRequestError('Failed to update product', { error: err.message });
      }
    }
  );

  /**
   * DELETE /instances/:id/products
   * Delete one or more products from the catalog
   */
  server.delete(
    '/instances/:id/products',
    {
      schema: {
        description: 'Delete one or more products from the catalog (WhatsApp Business only)',
        tags: ['Business'],
        summary: 'Delete products',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: { $ref: 'deleteProducts' },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  deletedCount: { type: 'number' },
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
      const body = request.body as { productIds: string[] };

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
        const result = await client.deleteProducts(body.productIds);

        if (!result.success) {
          throw new BadRequestError('Failed to delete products', { error: result.error });
        }

        reply.send({
          success: true,
          data: {
            success: result.success,
            deletedCount: result.deletedCount,
          },
        });
      } catch (err: any) {
        if (err instanceof BadRequestError) throw err;
        throw new BadRequestError('Failed to delete products', { error: err.message });
      }
    }
  );

  // Newsletter endpoints moved to src/routes/newsletters.ts (Phase 12)
}
