/**
 * Message Mutation Routes (v2)
 *
 * PATCH  /instances/:instanceId/messages/:messageId
 * DELETE /instances/:instanceId/messages/:messageId
 * PUT    /instances/:instanceId/messages/:messageId/reaction
 * DELETE /instances/:instanceId/messages/:messageId/reaction
 * POST   /instances/:instanceId/messages/:messageId/forward
 * GET    /instances/:instanceId/messages/:messageId/media
 * PUT|DELETE /instances/:instanceId/messages/:messageId/star
 * PUT    /instances/:instanceId/messages/:messageId/read-receipt
 * POST   /instances/:instanceId/chats/:chatJid/message-history-loads
 *
 * v1 addressed the target message through the request body on some routes
 * (`/messages/edit`, `/messages/reaction`, `/messages/forward`) and through the
 * path on others. v2 always puts it in the path, so every mutation reads as an
 * action on one addressable message.
 *
 * Two v1 response shapes are dropped because they cannot pass the envelope:
 * bare `{ success, message }` (no `data`), and `data: { success: ... }`, which
 * buries a second success flag inside the payload.
 */

import { FastifyInstance } from 'fastify';
import type { MiawClient, MiawMessage } from 'miaw-core';
import { createAuthMiddleware } from '../../middleware/auth';
import {
  ApiError,
  NotFoundError,
  BadRequestError,
  ServiceUnavailableError,
} from '../../utils/errorHandler';

const messageParams = {
  type: 'object',
  required: ['instanceId', 'messageId'],
  properties: {
    instanceId: { type: 'string' },
    messageId: { type: 'string' },
  },
};

const chatJidQuery = {
  type: 'object',
  properties: {
    chatJid: {
      type: 'string',
      description: 'Narrows the message lookup to one chat instead of scanning every chat.',
    },
  },
};

function requireConnectedClient(server: FastifyInstance, instanceId: string): MiawClient {
  const client = server.instanceManager.getClient(instanceId);
  const instance = server.instanceManager.getInstance(instanceId);

  if (!client || !instance) {
    throw new NotFoundError('Instance');
  }
  if (instance.status !== 'connected') {
    throw new ServiceUnavailableError('Instance is not connected');
  }
  return client;
}

/**
 * miaw-core's message operations need the full MiawMessage (with `raw`), which
 * only exists in the in-memory store — an id alone is not enough. Without
 * `chatJid` every chat has to be scanned, so callers should pass it.
 */
async function requireMessage(
  client: MiawClient,
  messageId: string,
  chatJid?: string,
): Promise<MiawMessage> {
  const jids = chatJid ? [chatJid] : [...client.getMessageCounts().keys()];

  for (const jid of jids) {
    const result = await client.getChatMessages(jid);
    const found = result.success ? result.messages?.find((m) => m.id === messageId) : undefined;
    if (found) {
      return found;
    }
  }
  throw new NotFoundError('Message');
}

/**
 * Normalize an unexpected error into a 400, while letting anything we already
 * classified (404, 503, or a 400 that carries its own message and details)
 * travel to the error handler untouched.
 */
function failed(what: string, err: any): never {
  if (err instanceof ApiError) {
    throw err;
  }
  throw new BadRequestError(`Failed to ${what}`, { error: err?.message });
}

export async function messagingMutationRoutesV2(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', createAuthMiddleware());

  server.patch(
    '/instances/:instanceId/messages/:messageId',
    {
      schema: {
        description: 'Edit a message you sent',
        tags: ['Messaging'],
        summary: 'Edit message',
        params: messageParams,
        querystring: chatJidQuery,
        body: {
          type: 'object',
          required: ['text'],
          additionalProperties: false,
          properties: { text: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, messageId } = request.params as {
        instanceId: string;
        messageId: string;
      };
      const { chatJid } = request.query as { chatJid?: string };
      const { text } = request.body as { text: string };

      const client = requireConnectedClient(server, instanceId);
      const message = await requireMessage(client, messageId, chatJid);

      try {
        const result = await client.editMessage(message, text);
        reply.send({
          success: true,
          data: { messageId: result.messageId || messageId, timestamp: Date.now() },
        });
      } catch (err: any) {
        failed('edit message', err);
      }
    },
  );

  server.delete(
    '/instances/:instanceId/messages/:messageId',
    {
      schema: {
        description: 'Delete a message for everyone, or only for yourself with scope=me',
        tags: ['Messaging'],
        summary: 'Delete message',
        params: messageParams,
        querystring: {
          type: 'object',
          properties: {
            chatJid: chatJidQuery.properties.chatJid,
            scope: { type: 'string', enum: ['everyone', 'me'], default: 'everyone' },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, messageId } = request.params as {
        instanceId: string;
        messageId: string;
      };
      const { chatJid, scope = 'everyone' } = request.query as {
        chatJid?: string;
        scope?: 'everyone' | 'me';
      };

      const client = requireConnectedClient(server, instanceId);
      const message = await requireMessage(client, messageId, chatJid);

      try {
        if (scope === 'me') {
          await client.deleteMessageForMe(message);
        } else {
          await client.deleteMessage(message);
        }
        reply.send({ success: true, data: { deleted: true, scope } });
      } catch (err: any) {
        failed('delete message', err);
      }
    },
  );

  server.put(
    '/instances/:instanceId/messages/:messageId/reaction',
    {
      schema: {
        description: 'React to a message with an emoji',
        tags: ['Messaging'],
        summary: 'Set reaction',
        params: messageParams,
        querystring: chatJidQuery,
        body: {
          type: 'object',
          required: ['emoji'],
          additionalProperties: false,
          properties: { emoji: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, messageId } = request.params as {
        instanceId: string;
        messageId: string;
      };
      const { chatJid } = request.query as { chatJid?: string };
      const { emoji } = request.body as { emoji: string };

      const client = requireConnectedClient(server, instanceId);
      const message = await requireMessage(client, messageId, chatJid);

      try {
        await client.sendReaction(message, emoji);
        reply.send({ success: true, data: { messageId, emoji } });
      } catch (err: any) {
        failed('react to message', err);
      }
    },
  );

  server.delete(
    '/instances/:instanceId/messages/:messageId/reaction',
    {
      schema: {
        description: 'Remove your reaction from a message',
        tags: ['Messaging'],
        summary: 'Remove reaction',
        params: messageParams,
        querystring: chatJidQuery,
      },
    },
    async (request, reply) => {
      const { instanceId, messageId } = request.params as {
        instanceId: string;
        messageId: string;
      };
      const { chatJid } = request.query as { chatJid?: string };

      const client = requireConnectedClient(server, instanceId);
      const message = await requireMessage(client, messageId, chatJid);

      try {
        const result = await client.removeReaction(message);
        if (!result.success) {
          throw new BadRequestError('Failed to remove reaction', { error: result.error });
        }
        reply.send({ success: true, data: { messageId, removed: true } });
      } catch (err: any) {
        failed('remove reaction', err);
      }
    },
  );

  server.post(
    '/instances/:instanceId/messages/:messageId/forward',
    {
      schema: {
        description: 'Forward a message to one or more recipients',
        tags: ['Messaging'],
        summary: 'Forward message',
        params: messageParams,
        querystring: chatJidQuery,
        body: {
          type: 'object',
          required: ['to'],
          additionalProperties: false,
          properties: {
            to: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', minLength: 1 },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, messageId } = request.params as {
        instanceId: string;
        messageId: string;
      };
      const { chatJid } = request.query as { chatJid?: string };
      const { to } = request.body as { to: string[] };

      const client = requireConnectedClient(server, instanceId);
      const message = await requireMessage(client, messageId, chatJid);

      try {
        const forwarded = [];
        for (const recipient of to) {
          const result = await client.forwardMessage(message, recipient);
          forwarded.push({ to: recipient, messageId: result.messageId });
        }
        reply.send({ success: true, data: { forwarded } });
      } catch (err: any) {
        failed('forward message', err);
      }
    },
  );

  const MIME_BY_TYPE: Record<string, string> = {
    image: 'image/jpeg',
    video: 'video/mp4',
    audio: 'audio/ogg',
    document: 'application/octet-stream',
    sticker: 'image/webp',
  };

  server.get(
    '/instances/:instanceId/messages/:messageId/media',
    {
      schema: {
        description: 'Download the media attached to a message',
        tags: ['Messaging'],
        summary: 'Download media',
        params: messageParams,
        querystring: chatJidQuery,
        // Declared so the v2 envelope hook leaves this route alone: the body
        // is the media itself, not a JSON envelope.
        response: {
          200: {
            type: 'string',
            format: 'binary',
            description: 'Raw media bytes',
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, messageId } = request.params as {
        instanceId: string;
        messageId: string;
      };
      const { chatJid } = request.query as { chatJid?: string };

      const client = requireConnectedClient(server, instanceId);
      const message = await requireMessage(client, messageId, chatJid);

      try {
        const buffer = await client.downloadMedia(message);
        if (!buffer) {
          throw new BadRequestError('Failed to download media', {
            error: 'Media download returned null - media may be expired or unavailable',
          });
        }

        reply.header(
          'Content-Type',
          message.media?.mimetype || MIME_BY_TYPE[message.type] || 'application/octet-stream',
        );
        reply.header('Content-Length', buffer.length);
        if (message.media?.fileName) {
          reply.header('Content-Disposition', `attachment; filename="${message.media.fileName}"`);
        }
        return reply.send(buffer);
      } catch (err: any) {
        failed('download media', err);
      }
    },
  );

  server.put(
    '/instances/:instanceId/messages/:messageId/read-receipt',
    {
      schema: {
        description: 'Mark a message as read, sending a read receipt to the sender',
        tags: ['Messaging'],
        summary: 'Send read receipt',
        params: messageParams,
        body: {
          type: 'object',
          required: ['fromJid'],
          additionalProperties: false,
          properties: { fromJid: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, messageId } = request.params as {
        instanceId: string;
        messageId: string;
      };
      const { fromJid } = request.body as { fromJid: string };

      const client = requireConnectedClient(server, instanceId);

      try {
        // markAsRead only needs the key, so no store lookup is required here.
        const read = await client.markAsRead({
          id: messageId,
          raw: { key: { from: fromJid, id: messageId } },
        } as any);
        reply.send({ success: true, data: { messageId, read } });
      } catch (err: any) {
        failed('mark as read', err);
      }
    },
  );

  server.post(
    '/instances/:instanceId/chats/:chatJid/message-history-loads',
    {
      schema: {
        description: 'Load older messages for a chat from WhatsApp history',
        tags: ['Messaging'],
        summary: 'Load message history',
        params: {
          type: 'object',
          required: ['instanceId', 'chatJid'],
          properties: {
            instanceId: { type: 'string' },
            chatJid: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          // Both fields default, so a bodyless POST is meaningful. Without
          // nullable, Fastify rejects it with 'body must be object'.
          nullable: true,
          additionalProperties: false,
          properties: {
            count: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
            timeoutMs: { type: 'integer', minimum: 1000, maximum: 60000, default: 15000 },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, chatJid } = request.params as {
        instanceId: string;
        chatJid: string;
      };
      const { count = 50, timeoutMs = 15000 } = (request.body ?? {}) as {
        count?: number;
        timeoutMs?: number;
      };

      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.loadMoreMessages(chatJid, count, timeoutMs);
        reply.send({
          success: true,
          data: { messagesLoaded: result.messagesLoaded, hasMore: result.hasMore },
        });
      } catch (err: any) {
        failed('load more messages', err);
      }
    },
  );

  // Starring has no v1 route; it is new here. PUT/DELETE rather than a toggle,
  // so setting a state that already holds stays harmless.
  for (const starred of [true, false]) {
    const route = starred ? server.put.bind(server) : server.delete.bind(server);

    route(
      '/instances/:instanceId/messages/:messageId/star',
      {
        schema: {
          description: starred ? 'Star a message' : 'Remove a star from a message',
          tags: ['Messaging'],
          summary: starred ? 'Star message' : 'Unstar message',
          params: messageParams,
          querystring: chatJidQuery,
        },
      },
      async (request, reply) => {
        const { instanceId, messageId } = request.params as {
          instanceId: string;
          messageId: string;
        };
        const { chatJid } = request.query as { chatJid?: string };

        const client = requireConnectedClient(server, instanceId);
        const message = await requireMessage(client, messageId, chatJid);

        try {
          const result = starred
            ? await client.starMessage(message)
            : await client.unstarMessage(message);
          if (!result.success) {
            throw new BadRequestError(`Failed to ${starred ? 'star' : 'unstar'} message`, {
              error: result.error,
            });
          }
          reply.send({ success: true, data: { messageId, starred } });
        } catch (err: any) {
          failed(`${starred ? 'star' : 'unstar'} message`, err);
        }
      },
    );
  }
}
