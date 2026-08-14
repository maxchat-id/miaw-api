/**
 * Chat and Presence Routes (v2)
 *
 * GET /instances/:instanceId/chats
 * GET /instances/:instanceId/chats/:chatJid/messages
 * PUT /instances/:instanceId/chats/:chatJid/presence
 * PUT /instances/:instanceId/presence
 *
 * v1 modelled chat presence as three verb routes — `/typing/:to`,
 * `/recording/:to`, `/stop-typing/:to` — which are three spellings of one
 * setting. v2 makes it a single writable sub-resource whose value says which
 * state to publish, so adding a state later does not add a route.
 *
 * Account-wide presence keeps its own route because it is not scoped to a
 * chat: it is what every contact sees.
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
}
