/**
 * Label Routes (v2) — WhatsApp Business
 *
 * GET    /instances/:instanceId/labels
 * POST   /instances/:instanceId/labels
 * PATCH  /instances/:instanceId/labels/:labelId
 * DELETE /instances/:instanceId/labels/:labelId
 * GET    /instances/:instanceId/labels/:labelId/chats
 * PUT    /instances/:instanceId/chats/:chatJid/labels/:labelId
 * DELETE /instances/:instanceId/chats/:chatJid/labels/:labelId
 * PUT    /instances/:instanceId/messages/:messageId/labels/:labelId
 * DELETE /instances/:instanceId/messages/:messageId/labels/:labelId
 *
 * Attaching a label used POST in v1, which reads as "create a new attachment"
 * even though attaching the same label twice is the same state. v2 uses PUT so
 * the request can be repeated safely.
 *
 * miaw-core has no separate edit or delete call: `addLabel` upserts by id and a
 * delete is an upsert carrying `deleted: true`. v2 exposes that as PATCH and
 * DELETE so callers do not have to know the encoding.
 */

import { FastifyInstance } from 'fastify';
import type { MiawClient, Label } from 'miaw-core';
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

const labelParams = {
  type: 'object',
  required: ['instanceId', 'labelId'],
  properties: {
    instanceId: { type: 'string' },
    labelId: { type: 'string', minLength: 1 },
  },
};

const chatLabelParams = {
  type: 'object',
  required: ['instanceId', 'chatJid', 'labelId'],
  properties: {
    instanceId: { type: 'string' },
    chatJid: { type: 'string', minLength: 1 },
    labelId: { type: 'string', minLength: 1 },
  },
};

// miaw-core needs the chat to locate the message, and the message id alone
// does not carry it. Query rather than body so DELETE stays bodyless.
const chatJidQuery = {
  type: 'object',
  required: ['chatJid'],
  properties: {
    chatJid: { type: 'string', minLength: 1, description: 'Chat the message belongs to.' },
  },
};

const messageLabelParams = {
  type: 'object',
  required: ['instanceId', 'messageId', 'labelId'],
  properties: {
    instanceId: { type: 'string' },
    messageId: { type: 'string', minLength: 1 },
    labelId: { type: 'string', minLength: 1 },
  },
};

const labelColor = {
  type: 'integer',
  minimum: 0,
  maximum: 19,
  description: 'WhatsApp label palette index.',
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

export async function labelRoutesV2(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', createAuthMiddleware());

  server.get(
    '/instances/:instanceId/labels',
    {
      schema: {
        description: 'List the labels of a WhatsApp Business account',
        tags: ['Business'],
        summary: 'List labels',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const client = requireConnectedClient(server, instanceId);

      const result = await client.fetchAllLabels();
      if (!result.success) {
        throw new BadRequestError('Failed to fetch labels', { error: result.error });
      }

      const items = result.labels ?? [];
      reply.send({ success: true, data: { items, total: items.length } });
    },
  );

  server.post(
    '/instances/:instanceId/labels',
    {
      schema: {
        description: 'Create a label',
        tags: ['Business'],
        summary: 'Create label',
        params: instanceParams,
        body: {
          type: 'object',
          required: ['name', 'color'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
            color: labelColor,
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const { name, color } = request.body as { name: string; color: number };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.addLabel({
          name,
          color: color as Label['color'],
          deleted: false,
        });
        if (!result.success) {
          throw new BadRequestError('Failed to create label', { error: result.error });
        }
        reply.status(201).send({ success: true, data: { labelId: result.labelId, name, color } });
      } catch (err: any) {
        failed('create label', err);
      }
    },
  );

  server.patch(
    '/instances/:instanceId/labels/:labelId',
    {
      schema: {
        description: 'Rename a label or change its color',
        tags: ['Business'],
        summary: 'Update label',
        params: labelParams,
        body: {
          type: 'object',
          // miaw-core upserts the whole label, so both fields are needed to
          // avoid silently resetting the one that was left out.
          required: ['name', 'color'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
            color: labelColor,
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, labelId } = request.params as {
        instanceId: string;
        labelId: string;
      };
      const { name, color } = request.body as { name: string; color: number };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.addLabel({
          id: labelId,
          name,
          color: color as Label['color'],
          deleted: false,
        });
        if (!result.success) {
          throw new BadRequestError('Failed to update label', { error: result.error });
        }
        reply.send({ success: true, data: { labelId, name, color } });
      } catch (err: any) {
        failed('update label', err);
      }
    },
  );

  server.delete(
    '/instances/:instanceId/labels/:labelId',
    {
      schema: {
        description: 'Delete a label',
        tags: ['Business'],
        summary: 'Delete label',
        params: labelParams,
      },
    },
    async (request, reply) => {
      const { instanceId, labelId } = request.params as {
        instanceId: string;
        labelId: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        // A delete is an upsert flagged deleted - that encoding is miaw-core's,
        // and callers should not have to know it.
        const result = await client.addLabel({
          id: labelId,
          name: '',
          color: 0 as Label['color'],
          deleted: true,
        });
        if (!result.success) {
          throw new BadRequestError('Failed to delete label', { error: result.error });
        }
        reply.send({ success: true, data: { labelId, deleted: true } });
      } catch (err: any) {
        failed('delete label', err);
      }
    },
  );

  server.get(
    '/instances/:instanceId/labels/:labelId/chats',
    {
      schema: {
        description: 'List the chats carrying a label',
        tags: ['Business'],
        summary: 'List labelled chats',
        params: labelParams,
      },
    },
    async (request, reply) => {
      const { instanceId, labelId } = request.params as {
        instanceId: string;
        labelId: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const items = (await client.getChatsByLabel(labelId)) ?? [];
        reply.send({ success: true, data: { items, total: items.length } });
      } catch (err: any) {
        failed('list labelled chats', err);
      }
    },
  );

  server.put(
    '/instances/:instanceId/chats/:chatJid/labels/:labelId',
    {
      schema: {
        description: 'Attach a label to a chat',
        tags: ['Business'],
        summary: 'Label a chat',
        params: chatLabelParams,
      },
    },
    async (request, reply) => {
      const { instanceId, chatJid, labelId } = request.params as {
        instanceId: string;
        chatJid: string;
        labelId: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.addChatLabel(chatJid, labelId);
        if (!result.success) {
          throw new BadRequestError('Failed to label chat', { error: result.error });
        }
        reply.send({ success: true, data: { chatJid, labelId, attached: true } });
      } catch (err: any) {
        failed('label chat', err);
      }
    },
  );

  server.delete(
    '/instances/:instanceId/chats/:chatJid/labels/:labelId',
    {
      schema: {
        description: 'Detach a label from a chat',
        tags: ['Business'],
        summary: 'Unlabel a chat',
        params: chatLabelParams,
      },
    },
    async (request, reply) => {
      const { instanceId, chatJid, labelId } = request.params as {
        instanceId: string;
        chatJid: string;
        labelId: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.removeChatLabel(chatJid, labelId);
        if (!result.success) {
          throw new BadRequestError('Failed to unlabel chat', { error: result.error });
        }
        reply.send({ success: true, data: { chatJid, labelId, attached: false } });
      } catch (err: any) {
        failed('unlabel chat', err);
      }
    },
  );

  server.put(
    '/instances/:instanceId/messages/:messageId/labels/:labelId',
    {
      schema: {
        description: 'Attach a label to a message',
        tags: ['Business'],
        summary: 'Label a message',
        params: messageLabelParams,
        querystring: chatJidQuery,
      },
    },
    async (request, reply) => {
      const { instanceId, messageId, labelId } = request.params as {
        instanceId: string;
        messageId: string;
        labelId: string;
      };
      const { chatJid } = request.query as { chatJid: string };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.addMessageLabel(chatJid, messageId, labelId);
        if (!result.success) {
          throw new BadRequestError('Failed to label message', { error: result.error });
        }
        reply.send({ success: true, data: { chatJid, messageId, labelId, attached: true } });
      } catch (err: any) {
        failed('label message', err);
      }
    },
  );

  server.delete(
    '/instances/:instanceId/messages/:messageId/labels/:labelId',
    {
      schema: {
        description: 'Detach a label from a message',
        tags: ['Business'],
        summary: 'Unlabel a message',
        params: messageLabelParams,
        querystring: chatJidQuery,
      },
    },
    async (request, reply) => {
      const { instanceId, messageId, labelId } = request.params as {
        instanceId: string;
        messageId: string;
        labelId: string;
      };
      const { chatJid } = request.query as { chatJid: string };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.removeMessageLabel(chatJid, messageId, labelId);
        if (!result.success) {
          throw new BadRequestError('Failed to unlabel message', { error: result.error });
        }
        reply.send({ success: true, data: { chatJid, messageId, labelId, attached: false } });
      } catch (err: any) {
        failed('unlabel message', err);
      }
    },
  );
}
