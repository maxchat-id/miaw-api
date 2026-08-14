/**
 * Chat and Presence Routes (v2)
 *
 * GET /instances/:instanceId/chats
 * GET /instances/:instanceId/chats/:chatJid/messages
 * PUT /instances/:instanceId/chats/:chatJid/presence
 * PUT /instances/:instanceId/presence
 * PUT|DELETE /instances/:instanceId/chats/:chatJid/archive
 * PUT|DELETE /instances/:instanceId/chats/:chatJid/pin
 * PUT|DELETE /instances/:instanceId/chats/:chatJid/mute
 * PUT    /instances/:instanceId/chats/:chatJid/read-state
 * DELETE /instances/:instanceId/chats/:chatJid/messages
 * DELETE /instances/:instanceId/chats/:chatJid
 *
 * v1 modelled chat presence as three verb routes — `/typing/:to`,
 * `/recording/:to`, `/stop-typing/:to` — which are three spellings of one
 * setting. v2 makes it a single writable sub-resource whose value says which
 * state to publish, so adding a state later does not add a route.
 *
 * Account-wide presence keeps its own route because it is not scoped to a
 * chat: it is what every contact sees.
 *
 * The archive, pin, mute, read-state and deletion routes have no v1
 * equivalent; they are new here. Each flag is a sub-resource set with PUT and
 * cleared with DELETE, so repeating a request is harmless.
 */

import { FastifyInstance } from 'fastify';
import type { MiawClient } from 'miaw-core';
import { createAuthMiddleware } from '../../middleware/auth';
import {
  ApiError,
  NotFoundError,
  BadRequestError,
  ServiceUnavailableError,
} from '../../utils/errorHandler';

const instanceParams = {
  type: 'object',
  required: ['instanceId'],
  properties: { instanceId: { type: 'string' } },
};

const chatParams = {
  type: 'object',
  required: ['instanceId', 'chatJid'],
  properties: {
    instanceId: { type: 'string' },
    chatJid: {
      type: 'string',
      minLength: 1,
      description: 'Chat JID, or a phone number which is resolved to one.',
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

export async function chatRoutesV2(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', createAuthMiddleware());

  server.get(
    '/instances/:instanceId/chats',
    {
      schema: {
        description:
          'List chats from the in-memory store, populated by WhatsApp history sync. ' +
          'Returns an empty collection until a sync has completed.',
        tags: ['Chats'],
        summary: 'List chats',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const client = requireConnectedClient(server, instanceId);

      const result = await client.fetchAllChats();
      if (!result.success) {
        throw new BadRequestError('Failed to fetch chats', { error: result.error });
      }

      const items = result.chats ?? [];
      reply.send({ success: true, data: { items, total: items.length } });
    },
  );

  server.get(
    '/instances/:instanceId/chats/:chatJid/messages',
    {
      schema: {
        description:
          'List the messages held for a chat. Use POST .../message-history-loads first ' +
          'to pull older messages from WhatsApp into the store.',
        tags: ['Chats'],
        summary: 'List chat messages',
        params: chatParams,
      },
    },
    async (request, reply) => {
      const { instanceId, chatJid } = request.params as {
        instanceId: string;
        chatJid: string;
      };
      const client = requireConnectedClient(server, instanceId);

      const result = await client.getChatMessages(chatJid);
      if (!result.success) {
        throw new BadRequestError('Failed to fetch chat messages', { error: result.error });
      }

      const items = result.messages ?? [];
      reply.send({ success: true, data: { items, total: items.length } });
    },
  );

  server.put(
    '/instances/:instanceId/chats/:chatJid/presence',
    {
      schema: {
        description:
          'Publish your presence in a chat: typing, recording a voice note, or neither. ' +
          'Replaces the v1 /typing, /recording and /stop-typing routes.',
        tags: ['Chats'],
        summary: 'Set chat presence',
        params: chatParams,
        body: {
          type: 'object',
          required: ['state'],
          additionalProperties: false,
          properties: {
            state: { type: 'string', enum: ['typing', 'recording', 'paused'] },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, chatJid } = request.params as {
        instanceId: string;
        chatJid: string;
      };
      const { state } = request.body as { state: 'typing' | 'recording' | 'paused' };
      const client = requireConnectedClient(server, instanceId);

      try {
        if (state === 'typing') {
          await client.sendTyping(chatJid);
        } else if (state === 'recording') {
          await client.sendRecording(chatJid);
        } else {
          await client.stopTyping(chatJid);
        }
        reply.send({ success: true, data: { chatJid, state } });
      } catch (err: any) {
        failed('set chat presence', err);
      }
    },
  );

  server.put(
    '/instances/:instanceId/presence',
    {
      schema: {
        description: 'Set account-wide presence, which is what every contact sees',
        tags: ['Chats'],
        summary: 'Set account presence',
        params: instanceParams,
        body: {
          type: 'object',
          required: ['status'],
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['available', 'unavailable'] },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const { status } = request.body as { status: 'available' | 'unavailable' };
      const client = requireConnectedClient(server, instanceId);

      try {
        await client.setPresence(status);
        // v1 answered data: { success: true }, which said nothing the envelope
        // did not already say.
        reply.send({ success: true, data: { status } });
      } catch (err: any) {
        failed('set presence', err);
      }
    },
  );

  // Flags a chat carries. Each is a sub-resource: PUT sets it, DELETE clears
  // it, so a caller that does not know the current state cannot get it wrong.
  const flags = [
    {
      path: 'archive',
      noun: 'archive',
      field: 'archived',
      set: (client: MiawClient, jid: string) => client.archiveChat(jid),
      clear: (client: MiawClient, jid: string) => client.unarchiveChat(jid),
    },
    {
      path: 'pin',
      noun: 'pin',
      field: 'pinned',
      set: (client: MiawClient, jid: string) => client.pinChat(jid),
      clear: (client: MiawClient, jid: string) => client.unpinChat(jid),
    },
  ];

  for (const flag of flags) {
    server.put(
      `/instances/:instanceId/chats/:chatJid/${flag.path}`,
      {
        schema: {
          description: `Set the ${flag.noun} on a chat`,
          tags: ['Chats'],
          summary: `Set ${flag.path}`,
          params: chatParams,
        },
      },
      async (request, reply) => {
        const { instanceId, chatJid } = request.params as {
          instanceId: string;
          chatJid: string;
        };
        const client = requireConnectedClient(server, instanceId);

        try {
          const result = await flag.set(client, chatJid);
          if (!result.success) {
            throw new BadRequestError(`Failed to set ${flag.noun}`, { error: result.error });
          }
          reply.send({ success: true, data: { chatJid, [flag.field]: true } });
        } catch (err: any) {
          failed(`set ${flag.noun}`, err);
        }
      },
    );

    server.delete(
      `/instances/:instanceId/chats/:chatJid/${flag.path}`,
      {
        schema: {
          description: `Clear the ${flag.noun} on a chat`,
          tags: ['Chats'],
          summary: `Clear ${flag.path}`,
          params: chatParams,
        },
      },
      async (request, reply) => {
        const { instanceId, chatJid } = request.params as {
          instanceId: string;
          chatJid: string;
        };
        const client = requireConnectedClient(server, instanceId);

        try {
          const result = await flag.clear(client, chatJid);
          if (!result.success) {
            throw new BadRequestError(`Failed to clear ${flag.noun}`, { error: result.error });
          }
          reply.send({ success: true, data: { chatJid, [flag.field]: false } });
        } catch (err: any) {
          failed(`clear ${flag.noun}`, err);
        }
      },
    );
  }

  server.put(
    '/instances/:instanceId/chats/:chatJid/mute',
    {
      schema: {
        description:
          'Mute a chat for a while. WhatsApp stores an expiry, not a flag, so the ' +
          'duration is part of the request.',
        tags: ['Chats'],
        summary: 'Set mute',
        params: chatParams,
        body: {
          type: 'object',
          nullable: true,
          additionalProperties: false,
          properties: {
            durationMs: {
              type: 'integer',
              minimum: 1000,
              default: 8 * 60 * 60 * 1000,
              description: 'Defaults to 8 hours, matching miaw-core.',
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, chatJid } = request.params as {
        instanceId: string;
        chatJid: string;
      };
      const { durationMs } = (request.body ?? {}) as { durationMs?: number };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.muteChat(chatJid, durationMs);
        if (!result.success) {
          throw new BadRequestError('Failed to mute chat', { error: result.error });
        }
        reply.send({ success: true, data: { chatJid, muted: true, durationMs } });
      } catch (err: any) {
        failed('mute chat', err);
      }
    },
  );

  server.delete(
    '/instances/:instanceId/chats/:chatJid/mute',
    {
      schema: {
        description: 'Unmute a chat',
        tags: ['Chats'],
        summary: 'Clear mute',
        params: chatParams,
      },
    },
    async (request, reply) => {
      const { instanceId, chatJid } = request.params as {
        instanceId: string;
        chatJid: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.unmuteChat(chatJid);
        if (!result.success) {
          throw new BadRequestError('Failed to unmute chat', { error: result.error });
        }
        reply.send({ success: true, data: { chatJid, muted: false } });
      } catch (err: any) {
        failed('unmute chat', err);
      }
    },
  );

  server.put(
    '/instances/:instanceId/chats/:chatJid/read-state',
    {
      schema: {
        description:
          'Mark a chat read or unread. This is the chat-level badge, not a per-message ' +
          'read receipt — for that use PUT /messages/:messageId/read-receipt.',
        tags: ['Chats'],
        summary: 'Set read state',
        params: chatParams,
        body: {
          type: 'object',
          required: ['state'],
          additionalProperties: false,
          properties: { state: { type: 'string', enum: ['read', 'unread'] } },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, chatJid } = request.params as {
        instanceId: string;
        chatJid: string;
      };
      const { state } = request.body as { state: 'read' | 'unread' };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result =
          state === 'read'
            ? await client.markChatRead(chatJid)
            : await client.markChatUnread(chatJid);
        if (!result.success) {
          throw new BadRequestError(`Failed to mark chat ${state}`, { error: result.error });
        }
        reply.send({ success: true, data: { chatJid, state } });
      } catch (err: any) {
        failed(`mark chat ${state}`, err);
      }
    },
  );

  server.delete(
    '/instances/:instanceId/chats/:chatJid/messages',
    {
      schema: {
        description: 'Clear a chat, deleting its messages but keeping the chat itself',
        tags: ['Chats'],
        summary: 'Clear chat messages',
        params: chatParams,
      },
    },
    async (request, reply) => {
      const { instanceId, chatJid } = request.params as {
        instanceId: string;
        chatJid: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.clearChat(chatJid);
        if (!result.success) {
          throw new BadRequestError('Failed to clear chat', { error: result.error });
        }
        reply.send({ success: true, data: { chatJid, cleared: true } });
      } catch (err: any) {
        failed('clear chat', err);
      }
    },
  );

  server.delete(
    '/instances/:instanceId/chats/:chatJid',
    {
      schema: {
        description: 'Delete a chat, removing it from the list along with its messages',
        tags: ['Chats'],
        summary: 'Delete chat',
        params: chatParams,
      },
    },
    async (request, reply) => {
      const { instanceId, chatJid } = request.params as {
        instanceId: string;
        chatJid: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.deleteChat(chatJid);
        if (!result.success) {
          throw new BadRequestError('Failed to delete chat', { error: result.error });
        }
        reply.send({ success: true, data: { chatJid, deleted: true } });
      } catch (err: any) {
        failed('delete chat', err);
      }
    },
  );
}
