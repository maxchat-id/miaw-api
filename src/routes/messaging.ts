/**
 * Messaging Routes
 * POST /instances/:id/send-text - Send text message
 * POST /instances/:id/send-media - Send media (image, video, audio, document)
 * PATCH /instances/:id/messages/edit - Edit message
 * DELETE /instances/:id/messages/:messageId - Delete message
 * POST /instances/:id/messages/reaction - React to message
 * DELETE /instances/:id/messages/:messageId/reaction - Remove reaction from message
 * DELETE /instances/:id/messages/:messageId/local - Delete message for self only
 * POST /instances/:id/messages/forward - Forward message
 * GET /instances/:id/messages/:messageId/media - Download media from message
 * GET /instances/:id/chats/:jid/messages/load - Load more messages from history
 * POST /instances/:id/messages/image - Send image message
 * POST /instances/:id/messages/video - Send video message
 * POST /instances/:id/messages/audio - Send audio message
 * POST /instances/:id/messages/document - Send document message
 */

import { FastifyInstance } from 'fastify';
import type { MiawClient, MiawMessage } from 'miaw-core';
import { createAuthMiddleware } from '../middleware/auth';
import { NotFoundError, BadRequestError, ServiceUnavailableError } from '../utils/errorHandler';

/**
 * Helper to find a message by ID across all chats or within a specific chat.
 * miaw-core's message operations need the full MiawMessage (with `raw`), so
 * we reconstruct it from the in-memory message store.
 * @param client - MiawClient instance
 * @param messageId - Message ID to find
 * @param chatJid - Optional chat JID to search in (speeds up lookup)
 * @returns The message object or null if not found
 */
async function findMessageById(
  client: MiawClient,
  messageId: string,
  chatJid?: string,
): Promise<MiawMessage | null> {
  if (chatJid) {
    // If chatJid is provided, search only in that chat
    const chatResult = await client.getChatMessages(chatJid);
    if (chatResult.success && chatResult.messages) {
      return chatResult.messages.find((m) => m.id === messageId) || null;
    }
  } else {
    // Search through all chats (less efficient)
    const messageCounts = client.getMessageCounts();
    for (const jid of messageCounts.keys()) {
      const chatResult = await client.getChatMessages(jid);
      if (chatResult.success && chatResult.messages) {
        const found = chatResult.messages.find((m) => m.id === messageId);
        if (found) {
          return found;
        }
      }
    }
  }
  return null;
}

/**
 * Resolve a message by ID or throw NotFound.
 */
async function requireMessage(
  client: MiawClient,
  messageId: string,
  chatJid?: string,
): Promise<MiawMessage> {
  const message = await findMessageById(client, messageId, chatJid);
  if (!message) {
    throw new NotFoundError('Message');
  }
  return message;
}

/**
 * Resolve an optional `quoted` messageId to a MiawMessage for reply support.
 */
async function resolveQuotedMessage(
  client: MiawClient,
  quotedId: string | undefined,
  chatJid?: string,
): Promise<MiawMessage | undefined> {
  if (!quotedId) {
    return undefined;
  }
  return requireMessage(client, quotedId, chatJid);
}

/**
 * Register messaging routes
 */
export async function messagingRoutes(server: FastifyInstance): Promise<void> {
  // All routes require authentication
  server.addHook('onRequest', createAuthMiddleware());

  /**
   * POST /instances/:id/send-text
   * Send text message
   */
  server.post(
    '/instances/:id/send-text',
    {
      schema: {
        description: 'Send a text message',
        tags: ['Messaging'],
        summary: 'Send text message',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'sendText#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  messageId: { type: 'string' },
                  to: { type: 'string' },
                  timestamp: { type: 'number' },
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
                  details: { type: 'object' },
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
        to: string;
        text: string;
        chatJid?: string;
        quoted?: string;
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

      const quoted = await resolveQuotedMessage(client, body.quoted, body.chatJid);

      try {
        const result = await client.sendText(body.to, body.text, quoted ? { quoted } : undefined);

        if (!result.success) {
          throw new BadRequestError('Failed to send message', { error: result.error });
        }

        reply.send({
          success: true,
          data: {
            messageId: result.messageId,
            to: body.to,
            timestamp: Date.now(),
          },
        });
      } catch (err: unknown) {
        if (err instanceof BadRequestError) {
          throw err;
        }
        throw new BadRequestError('Failed to send message', { error: (err as Error).message });
      }
    },
  );

  /**
   * POST /instances/:id/send-media
   * Send media message (image, video, audio, document)
   */
  server.post(
    '/instances/:id/send-media',
    {
      schema: {
        description: 'Send a media message (image, video, audio, document)',
        tags: ['Messaging'],
        summary: 'Send media message',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'sendMedia#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  messageId: { type: 'string' },
                  to: { type: 'string' },
                  timestamp: { type: 'number' },
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
                  details: { type: 'object' },
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
        to: string;
        media: string;
        caption?: string;
        fileName?: string;
        mimetype?: string;
        viewOnce?: boolean;
        ptt?: boolean;
        gifPlayback?: boolean;
        chatJid?: string;
        quoted?: string;
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

      const quoted = await resolveQuotedMessage(client, body.quoted, body.chatJid);
      const mime = body.mimetype || '';

      try {
        // miaw-core has no generic sendMedia; dispatch by mimetype.
        let result;
        if (mime.startsWith('image/')) {
          result = await client.sendImage(body.to, body.media, {
            caption: body.caption,
            viewOnce: body.viewOnce,
            quoted,
          });
        } else if (mime.startsWith('video/')) {
          result = await client.sendVideo(body.to, body.media, {
            caption: body.caption,
            viewOnce: body.viewOnce,
            gifPlayback: body.gifPlayback,
            quoted,
          });
        } else if (mime.startsWith('audio/')) {
          result = await client.sendAudio(body.to, body.media, {
            ptt: body.ptt,
            mimetype: body.mimetype,
            quoted,
          });
        } else {
          result = await client.sendDocument(body.to, body.media, {
            caption: body.caption,
            fileName: body.fileName,
            mimetype: body.mimetype,
            quoted,
          });
        }

        if (!result.success) {
          throw new BadRequestError('Failed to send media', { error: result.error });
        }

        reply.send({
          success: true,
          data: {
            messageId: result.messageId,
            to: body.to,
            timestamp: Date.now(),
          },
        });
      } catch (err: any) {
        if (err instanceof BadRequestError) {
          throw err;
        }
        throw new BadRequestError('Failed to send media', { error: err.message });
      }
    },
  );

  /**
   * PATCH /instances/:id/messages/edit
   * Edit a text message
   */
  server.patch(
    '/instances/:id/messages/edit',
    {
      schema: {
        description: 'Edit a previously sent text message',
        tags: ['Messaging'],
        summary: 'Edit message',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'editMessage#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  messageId: { type: 'string' },
                  timestamp: { type: 'number' },
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
        messageId: string;
        text: string;
        chatJid?: string;
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

      const message = await requireMessage(client, body.messageId, body.chatJid);

      try {
        const result = await client.editMessage(message, body.text);

        reply.send({
          success: true,
          data: {
            messageId: result.messageId || body.messageId,
            timestamp: Date.now(),
          },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to edit message', { error: err.message });
      }
    },
  );

  /**
   * DELETE /instances/:id/messages/:messageId
   * Delete a message
   */
  server.delete(
    '/instances/:id/messages/:messageId',
    {
      schema: {
        description: 'Delete a message (for everyone or for me)',
        tags: ['Messaging'],
        summary: 'Delete message',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            messageId: { type: 'string' },
          },
          required: ['id', 'messageId'],
        },
        querystring: {
          type: 'object',
          properties: {
            forMe: {
              type: 'boolean',
              default: false,
              description: 'Delete only for me (true) or for everyone (false)',
            },
            chatJid: {
              type: 'string',
              description: 'Chat JID the message belongs to (speeds up lookup)',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
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
      const params = request.params as { id: string; messageId: string };
      const query = request.query as { forMe?: boolean; chatJid?: string };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      const message = await requireMessage(client, params.messageId, query.chatJid);

      try {
        if (query.forMe) {
          await client.deleteMessageForMe(message);
        } else {
          await client.deleteMessage(message);
        }

        reply.send({
          success: true,
          message: query.forMe ? 'Message deleted for me' : 'Message deleted for everyone',
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to delete message', { error: err.message });
      }
    },
  );

  /**
   * POST /instances/:id/messages/reaction
   * React to a message with emoji
   */
  server.post(
    '/instances/:id/messages/reaction',
    {
      schema: {
        description: 'React to a message with an emoji (send empty emoji to remove)',
        tags: ['Messaging'],
        summary: 'React to message',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'reactionMessage#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  messageId: { type: 'string' },
                  emoji: { type: 'string' },
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
        messageId: string;
        emoji: string;
        chatJid?: string;
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

      const message = await requireMessage(client, body.messageId, body.chatJid);

      try {
        await client.sendReaction(message, body.emoji);

        reply.send({
          success: true,
          data: {
            messageId: body.messageId,
            emoji: body.emoji || '(removed)',
          },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to react to message', { error: err.message });
      }
    },
  );

  /**
   * DELETE /instances/:id/messages/:messageId/reaction
   * Remove reaction from a message
   */
  server.delete(
    '/instances/:id/messages/:messageId/reaction',
    {
      schema: {
        description: 'Remove reaction from a message',
        tags: ['Messaging'],
        summary: 'Remove reaction',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            messageId: { type: 'string' },
          },
          required: ['id', 'messageId'],
        },
        querystring: {
          type: 'object',
          properties: {
            chatJid: {
              type: 'string',
              description: 'Optional chat JID to speed up message lookup',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
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
                  details: { type: 'object' },
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
      const params = request.params as { id: string; messageId: string };
      const query = request.query as { chatJid?: string };

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
        // Find the message in the store
        const message = await findMessageById(client, params.messageId, query.chatJid);

        if (!message) {
          throw new NotFoundError('Message');
        }

        const result = await client.removeReaction(message);

        if (!result.success) {
          throw new BadRequestError('Failed to remove reaction', { error: result.error });
        }

        reply.send({
          success: true,
          message: 'Reaction removed',
        });
      } catch (err: any) {
        if (err.code === 'NOT_FOUND' || err.code === 'BAD_REQUEST') {
          throw err;
        }
        throw new BadRequestError('Failed to remove reaction', { error: err.message });
      }
    },
  );

  /**
   * DELETE /instances/:id/messages/:messageId/local
   * Delete a message for self only (local deletion)
   */
  server.delete(
    '/instances/:id/messages/:messageId/local',
    {
      schema: {
        description:
          'Delete a message for yourself only (local deletion, does not affect other participants)',
        tags: ['Messaging'],
        summary: 'Delete message locally',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            messageId: { type: 'string' },
          },
          required: ['id', 'messageId'],
        },
        querystring: {
          type: 'object',
          properties: {
            chatJid: {
              type: 'string',
              description: 'Optional chat JID to speed up message lookup',
            },
            deleteMedia: {
              type: 'boolean',
              default: true,
              description: 'Whether to also delete associated media files (default: true)',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
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
                  details: { type: 'object' },
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
      const params = request.params as { id: string; messageId: string };
      const query = request.query as { chatJid?: string; deleteMedia?: boolean };

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
        // Find the message in the store
        const message = await findMessageById(client, params.messageId, query.chatJid);

        if (!message) {
          throw new NotFoundError('Message');
        }

        const deleteMedia = query.deleteMedia !== false; // default true
        const success = await client.deleteMessageForMe(message, deleteMedia);

        if (!success) {
          throw new BadRequestError('Failed to delete message locally');
        }

        reply.send({
          success: true,
          message: 'Message deleted locally',
        });
      } catch (err: any) {
        if (err.code === 'NOT_FOUND' || err.code === 'BAD_REQUEST') {
          throw err;
        }
        throw new BadRequestError('Failed to delete message locally', { error: err.message });
      }
    },
  );

  /**
   * POST /instances/:id/messages/forward
   * Forward a message to one or more recipients
   */
  server.post(
    '/instances/:id/messages/forward',
    {
      schema: {
        description: 'Forward a message to one or more recipients',
        tags: ['Messaging'],
        summary: 'Forward message',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'forwardMessage#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  forwarded: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        to: { type: 'string' },
                        messageId: { type: 'string' },
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
                  details: { type: 'object' },
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
        messageId: string;
        to: string[];
        chatJid?: string;
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

      const message = await requireMessage(client, body.messageId, body.chatJid);

      try {
        // forwardMessage targets one recipient; fan out over the list.
        const forwarded = [];
        for (const recipient of body.to) {
          const result = await client.forwardMessage(message, recipient);
          forwarded.push({ to: recipient, messageId: result.messageId });
        }

        reply.send({
          success: true,
          data: { forwarded },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to forward message', { error: err.message });
      }
    },
  );

  /**
   * GET /instances/:id/messages/:messageId/media
   * Download media from a message
   */
  server.get(
    '/instances/:id/messages/:messageId/media',
    {
      schema: {
        description: 'Download media from a message (image, video, audio, document, sticker)',
        tags: ['Messaging'],
        summary: 'Download media',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            messageId: { type: 'string' },
          },
          required: ['id', 'messageId'],
        },
        querystring: {
          type: 'object',
          properties: {
            chatJid: {
              type: 'string',
              description: 'Optional chat JID to speed up message lookup',
            },
          },
        },
        response: {
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
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
      const params = request.params as { id: string; messageId: string };
      const query = request.query as { chatJid?: string };

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
        // Find the message in the store using helper
        const message = await findMessageById(client, params.messageId, query.chatJid);

        if (!message) {
          throw new NotFoundError('Message');
        }

        // Check if it's a media message
        const mediaTypes = ['image', 'video', 'audio', 'document', 'sticker'];
        if (!mediaTypes.includes(message.type)) {
          throw new BadRequestError('Message is not a media message', {
            type: message.type,
            supportedTypes: mediaTypes,
          });
        }

        // Download the media
        const buffer = await client.downloadMedia(message);

        if (!buffer) {
          throw new BadRequestError('Failed to download media', {
            error: 'Media download returned null - media may be expired or unavailable',
          });
        }

        // Determine content type
        const mimetypeMap: Record<string, string> = {
          image: 'image/jpeg',
          video: 'video/mp4',
          audio: 'audio/ogg',
          document: 'application/octet-stream',
          sticker: 'image/webp',
        };
        const contentType =
          message.media?.mimetype || mimetypeMap[message.type] || 'application/octet-stream';

        // Set appropriate headers
        reply.header('Content-Type', contentType);
        reply.header('Content-Length', buffer.length);
        if (message.media?.fileName) {
          reply.header('Content-Disposition', `attachment; filename="${message.media.fileName}"`);
        }

        return reply.send(buffer);
      } catch (err: any) {
        if (err.code === 'NOT_FOUND' || err.code === 'BAD_REQUEST') {
          throw err;
        }
        throw new BadRequestError('Failed to download media', { error: err.message });
      }
    },
  );

  /**
   * GET /instances/:id/chats/:jid/messages/load
   * Load more messages from chat history
   */
  server.get(
    '/instances/:id/chats/:jid/messages/load',
    {
      schema: {
        description:
          'Load more messages from chat history (pagination). Fetches older messages beyond what is currently in memory.',
        tags: ['Messaging'],
        summary: 'Load more messages',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            jid: { type: 'string', description: 'Chat JID (phone@s.whatsapp.net or groupId@g.us)' },
          },
          required: ['id', 'jid'],
        },
        querystring: {
          type: 'object',
          properties: {
            count: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              default: 50,
              description: 'Number of messages to load (1-50, default: 50)',
            },
            timeout: {
              type: 'integer',
              minimum: 5000,
              maximum: 60000,
              default: 30000,
              description: 'Timeout in milliseconds (5000-60000, default: 30000)',
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
                  messagesLoaded: { type: 'integer', description: 'Number of messages loaded' },
                  hasMore: { type: 'boolean', description: 'Whether more messages are available' },
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
      const query = request.query as { count?: number; timeout?: number };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      const count = query.count || 50;
      const timeout = query.timeout || 30000;

      try {
        const result = await client.loadMoreMessages(params.jid, count, timeout);

        reply.send({
          success: true,
          data: {
            messagesLoaded: result.messagesLoaded,
            hasMore: result.hasMore,
          },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to load more messages', { error: err.message });
      }
    },
  );

  /**
   * POST /instances/:id/messages/image
   * Send an image message
   */
  server.post(
    '/instances/:id/messages/image',
    {
      schema: {
        description: 'Send an image message',
        tags: ['Messaging'],
        summary: 'Send image',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'sendImage#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  messageId: { type: 'string' },
                  to: { type: 'string' },
                  timestamp: { type: 'number' },
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
                  details: { type: 'object' },
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
        to: string;
        image: string;
        caption?: string;
        viewOnce?: boolean;
        chatJid?: string;
        quoted?: string;
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

      const quoted = await resolveQuotedMessage(client, body.quoted, body.chatJid);

      try {
        const result = await client.sendImage(body.to, body.image, {
          caption: body.caption,
          viewOnce: body.viewOnce,
          quoted,
        });

        if (!result.success) {
          throw new BadRequestError('Failed to send image', { error: result.error });
        }

        reply.send({
          success: true,
          data: {
            messageId: result.messageId,
            to: body.to,
            timestamp: Date.now(),
          },
        });
      } catch (err: any) {
        if (err.code === 'BAD_REQUEST') {
          throw err;
        }
        throw new BadRequestError('Failed to send image', { error: err.message });
      }
    },
  );

  /**
   * POST /instances/:id/messages/video
   * Send a video message
   */
  server.post(
    '/instances/:id/messages/video',
    {
      schema: {
        description: 'Send a video message',
        tags: ['Messaging'],
        summary: 'Send video',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'sendVideo#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  messageId: { type: 'string' },
                  to: { type: 'string' },
                  timestamp: { type: 'number' },
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
                  details: { type: 'object' },
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
        to: string;
        video: string;
        caption?: string;
        viewOnce?: boolean;
        gifPlayback?: boolean;
        ptv?: boolean;
        chatJid?: string;
        quoted?: string;
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

      const quoted = await resolveQuotedMessage(client, body.quoted, body.chatJid);

      try {
        const result = await client.sendVideo(body.to, body.video, {
          caption: body.caption,
          viewOnce: body.viewOnce,
          gifPlayback: body.gifPlayback,
          ptv: body.ptv,
          quoted,
        });

        if (!result.success) {
          throw new BadRequestError('Failed to send video', { error: result.error });
        }

        reply.send({
          success: true,
          data: {
            messageId: result.messageId,
            to: body.to,
            timestamp: Date.now(),
          },
        });
      } catch (err: any) {
        if (err.code === 'BAD_REQUEST') {
          throw err;
        }
        throw new BadRequestError('Failed to send video', { error: err.message });
      }
    },
  );

  /**
   * POST /instances/:id/messages/audio
   * Send an audio message
   */
  server.post(
    '/instances/:id/messages/audio',
    {
      schema: {
        description: 'Send an audio message',
        tags: ['Messaging'],
        summary: 'Send audio',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'sendAudio#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  messageId: { type: 'string' },
                  to: { type: 'string' },
                  timestamp: { type: 'number' },
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
                  details: { type: 'object' },
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
        to: string;
        audio: string;
        ptt?: boolean;
        mimetype?: string;
        chatJid?: string;
        quoted?: string;
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

      const quoted = await resolveQuotedMessage(client, body.quoted, body.chatJid);

      try {
        const result = await client.sendAudio(body.to, body.audio, {
          ptt: body.ptt,
          mimetype: body.mimetype,
          quoted,
        });

        if (!result.success) {
          throw new BadRequestError('Failed to send audio', { error: result.error });
        }

        reply.send({
          success: true,
          data: {
            messageId: result.messageId,
            to: body.to,
            timestamp: Date.now(),
          },
        });
      } catch (err: any) {
        if (err.code === 'BAD_REQUEST') {
          throw err;
        }
        throw new BadRequestError('Failed to send audio', { error: err.message });
      }
    },
  );

  /**
   * POST /instances/:id/messages/document
   * Send a document message
   */
  server.post(
    '/instances/:id/messages/document',
    {
      schema: {
        description: 'Send a document message',
        tags: ['Messaging'],
        summary: 'Send document',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'sendDocument#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  messageId: { type: 'string' },
                  to: { type: 'string' },
                  timestamp: { type: 'number' },
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
                  details: { type: 'object' },
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
        to: string;
        document: string;
        caption?: string;
        fileName?: string;
        mimetype?: string;
        chatJid?: string;
        quoted?: string;
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

      const quoted = await resolveQuotedMessage(client, body.quoted, body.chatJid);

      try {
        const result = await client.sendDocument(body.to, body.document, {
          caption: body.caption,
          fileName: body.fileName,
          mimetype: body.mimetype,
          quoted,
        });

        if (!result.success) {
          throw new BadRequestError('Failed to send document', { error: result.error });
        }

        reply.send({
          success: true,
          data: {
            messageId: result.messageId,
            to: body.to,
            timestamp: Date.now(),
          },
        });
      } catch (err: any) {
        if (err.code === 'BAD_REQUEST') {
          throw err;
        }
        throw new BadRequestError('Failed to send document', { error: err.message });
      }
    },
  );
}
