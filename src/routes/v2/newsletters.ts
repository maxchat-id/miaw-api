/**
 * Newsletter (Channel) Routes (v2)
 *
 * POST   /instances/:instanceId/newsletters
 * GET    /instances/:instanceId/newsletters/:newsletterId
 * PATCH  /instances/:instanceId/newsletters/:newsletterId
 * DELETE /instances/:instanceId/newsletters/:newsletterId
 * GET    /instances/:instanceId/newsletters/:newsletterId/messages
 * POST   /instances/:instanceId/newsletters/:newsletterId/messages/{text,image,video}
 * PUT|DELETE /instances/:instanceId/newsletters/:newsletterId/follow
 * PUT|DELETE /instances/:instanceId/newsletters/:newsletterId/mute
 * PUT    /instances/:instanceId/newsletters/:newsletterId/updates-subscription
 * PUT|DELETE /instances/:instanceId/newsletters/:newsletterId/picture
 * GET    /instances/:instanceId/newsletters/:newsletterId/subscribers
 * GET    /instances/:instanceId/newsletters/:newsletterId/admins/count
 * PATCH  /instances/:instanceId/newsletters/:newsletterId/owner
 * DELETE /instances/:instanceId/newsletters/:newsletterId/admins/:adminJid
 * PUT|DELETE /instances/:instanceId/newsletters/:newsletterId/messages/:messageId/reaction
 *
 * Follow, mute and picture were POST-to-set and DELETE-to-unset in v1, which
 * made setting a state that is already set read as creating a duplicate. PUT
 * makes those safe to repeat. Name and description had a route each; one PATCH
 * now covers both, matching how groups and profiles work here.
 *
 * Most miaw-core newsletter calls answer with a bare boolean rather than a
 * result object, so `false` is the only signal that the operation failed. Each
 * handler turns that into a 400 instead of reporting a success that did not
 * happen.
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

const newsletterParams = {
  type: 'object',
  required: ['instanceId', 'newsletterId'],
  properties: {
    instanceId: { type: 'string' },
    newsletterId: { type: 'string', minLength: 1 },
  },
};

const newsletterMessageParams = {
  type: 'object',
  required: ['instanceId', 'newsletterId', 'messageId'],
  properties: {
    instanceId: { type: 'string' },
    newsletterId: { type: 'string', minLength: 1 },
    messageId: { type: 'string', minLength: 1 },
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

/**
 * miaw-core reports most newsletter operations as a bare boolean, with no
 * error string to pass on. A false is still a failure and must not be
 * answered with 200.
 */
function requireOk(ok: boolean, what: string): void {
  if (!ok) {
    throw new BadRequestError(`Failed to ${what}`, {
      error: 'WhatsApp rejected the operation, or the newsletter is not accessible',
    });
  }
}

export async function newsletterRoutesV2(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', createAuthMiddleware());

  server.post(
    '/instances/:instanceId/newsletters',
    {
      schema: {
        description: 'Create a newsletter (channel)',
        tags: ['Newsletters'],
        summary: 'Create newsletter',
        params: instanceParams,
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
            description: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const { name, description } = request.body as { name: string; description?: string };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.createNewsletter(name, description);
        if (!result.success) {
          throw new BadRequestError('Failed to create newsletter', { error: result.error });
        }
        reply
          .status(201)
          .send({ success: true, data: { newsletterId: result.newsletterId, name } });
      } catch (err: any) {
        failed('create newsletter', err);
      }
    },
  );

  server.get(
    '/instances/:instanceId/newsletters/:newsletterId',
    {
      schema: {
        description: 'Get newsletter metadata',
        tags: ['Newsletters'],
        summary: 'Get newsletter',
        params: newsletterParams,
      },
    },
    async (request, reply) => {
      const { instanceId, newsletterId } = request.params as {
        instanceId: string;
        newsletterId: string;
      };
      const client = requireConnectedClient(server, instanceId);

      const metadata = await client.getNewsletterMetadata(newsletterId);
      if (!metadata) {
        throw new NotFoundError('Newsletter');
      }

      reply.send({ success: true, data: metadata });
    },
  );

  server.patch(
    '/instances/:instanceId/newsletters/:newsletterId',
    {
      schema: {
        description: 'Update the newsletter name and/or description',
        tags: ['Newsletters'],
        summary: 'Update newsletter',
        params: newsletterParams,
        body: {
          type: 'object',
          additionalProperties: false,
          // An empty patch would report success while changing nothing.
          minProperties: 1,
          properties: {
            name: { type: 'string', minLength: 1 },
            description: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, newsletterId } = request.params as {
        instanceId: string;
        newsletterId: string;
      };
      const body = request.body as { name?: string; description?: string };
      const client = requireConnectedClient(server, instanceId);

      const updated: Record<string, string> = {};

      try {
        // Reported field by field: if the description fails after the name
        // landed, the caller can tell which half is live.
        if (body.name !== undefined) {
          requireOk(await client.updateNewsletterName(newsletterId, body.name), 'update name');
          updated.name = body.name;
        }
        if (body.description !== undefined) {
          const ok = await client.updateNewsletterDescription(newsletterId, body.description);
          if (!ok) {
            throw new BadRequestError('Failed to update description', { updated });
          }
          updated.description = body.description;
        }
      } catch (err: any) {
        failed('update newsletter', err);
      }

      reply.send({ success: true, data: updated });
    },
  );

  server.delete(
    '/instances/:instanceId/newsletters/:newsletterId',
    {
      schema: {
        description: 'Delete a newsletter you own',
        tags: ['Newsletters'],
        summary: 'Delete newsletter',
        params: newsletterParams,
      },
    },
    async (request, reply) => {
      const { instanceId, newsletterId } = request.params as {
        instanceId: string;
        newsletterId: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        requireOk(await client.deleteNewsletter(newsletterId), 'delete newsletter');
        reply.send({ success: true, data: { newsletterId, deleted: true } });
      } catch (err: any) {
        failed('delete newsletter', err);
      }
    },
  );

  server.get(
    '/instances/:instanceId/newsletters/:newsletterId/messages',
    {
      schema: {
        description: 'Fetch newsletter messages',
        tags: ['Newsletters'],
        summary: 'List newsletter messages',
        params: newsletterParams,
        querystring: {
          type: 'object',
          properties: {
            count: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
            since: { type: 'integer', description: 'Unix timestamp lower bound.' },
            after: { type: 'integer', default: 0, description: 'Server message id to read past.' },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, newsletterId } = request.params as {
        instanceId: string;
        newsletterId: string;
      };
      const {
        count = 50,
        since,
        after = 0,
      } = request.query as { count?: number; since?: number; after?: number };
      const client = requireConnectedClient(server, instanceId);

      const result = await client.fetchNewsletterMessages(newsletterId, count, since, after);
      if (!result.success) {
        throw new BadRequestError('Failed to fetch newsletter messages', { error: result.error });
      }

      const items = result.messages ?? [];
      reply.send({
        success: true,
        data: { items, total: items.length, nextCursor: result.nextCursor ?? null },
      });
    },
  );

  const sendRoutes = [
    {
      kind: 'text' as const,
      field: 'text',
      summary: 'Post text',
      send: (client: MiawClient, id: string, body: any) =>
        client.sendNewsletterMessage(id, body.text),
    },
    {
      kind: 'image' as const,
      field: 'image',
      summary: 'Post image',
      send: (client: MiawClient, id: string, body: any) =>
        client.sendNewsletterImage(id, body.image, body.caption),
    },
    {
      kind: 'video' as const,
      field: 'video',
      summary: 'Post video',
      send: (client: MiawClient, id: string, body: any) =>
        client.sendNewsletterVideo(id, body.video, body.caption),
    },
  ];

  for (const route of sendRoutes) {
    server.post(
      `/instances/:instanceId/newsletters/:newsletterId/messages/${route.kind}`,
      {
        schema: {
          description: `Post ${route.kind} to a newsletter`,
          tags: ['Newsletters'],
          summary: route.summary,
          params: newsletterParams,
          body: {
            type: 'object',
            required: [route.field],
            additionalProperties: false,
            properties: {
              [route.field]: { type: 'string', minLength: 1 },
              ...(route.kind === 'text' ? {} : { caption: { type: 'string' } }),
            },
          },
        },
      },
      async (request, reply) => {
        const { instanceId, newsletterId } = request.params as {
          instanceId: string;
          newsletterId: string;
        };
        const client = requireConnectedClient(server, instanceId);

        try {
          const result = await route.send(client, newsletterId, request.body);
          // Same soft-failure guard as the chat send routes: miaw-core reports
          // a rejected post as { success: false } rather than throwing.
          if (!result.success) {
            throw new BadRequestError(`Failed to post ${route.kind}`, { error: result.error });
          }
          reply.send({
            success: true,
            data: { newsletterId, messageId: result.messageId, timestamp: Date.now() },
          });
        } catch (err: any) {
          failed(`post ${route.kind}`, err);
        }
      },
    );
  }

  const toggles = [
    {
      path: 'follow',
      summary: 'follow',
      on: (client: MiawClient, id: string) => client.followNewsletter(id),
      off: (client: MiawClient, id: string) => client.unfollowNewsletter(id),
      field: 'following',
    },
    {
      path: 'mute',
      summary: 'mute',
      on: (client: MiawClient, id: string) => client.muteNewsletter(id),
      off: (client: MiawClient, id: string) => client.unmuteNewsletter(id),
      field: 'muted',
    },
  ];

  for (const toggle of toggles) {
    server.put(
      `/instances/:instanceId/newsletters/:newsletterId/${toggle.path}`,
      {
        schema: {
          description: `Start to ${toggle.summary} a newsletter. Repeating this is harmless.`,
          tags: ['Newsletters'],
          summary: `Set ${toggle.path}`,
          params: newsletterParams,
        },
      },
      async (request, reply) => {
        const { instanceId, newsletterId } = request.params as {
          instanceId: string;
          newsletterId: string;
        };
        const client = requireConnectedClient(server, instanceId);

        try {
          requireOk(await toggle.on(client, newsletterId), `${toggle.summary} newsletter`);
          reply.send({ success: true, data: { newsletterId, [toggle.field]: true } });
        } catch (err: any) {
          failed(`${toggle.summary} newsletter`, err);
        }
      },
    );

    server.delete(
      `/instances/:instanceId/newsletters/:newsletterId/${toggle.path}`,
      {
        schema: {
          description: `Stop to ${toggle.summary} a newsletter.`,
          tags: ['Newsletters'],
          summary: `Clear ${toggle.path}`,
          params: newsletterParams,
        },
      },
      async (request, reply) => {
        const { instanceId, newsletterId } = request.params as {
          instanceId: string;
          newsletterId: string;
        };
        const client = requireConnectedClient(server, instanceId);

        try {
          requireOk(await toggle.off(client, newsletterId), `un${toggle.summary} newsletter`);
          reply.send({ success: true, data: { newsletterId, [toggle.field]: false } });
        } catch (err: any) {
          failed(`un${toggle.summary} newsletter`, err);
        }
      },
    );
  }

  server.put(
    '/instances/:instanceId/newsletters/:newsletterId/updates-subscription',
    {
      schema: {
        description: 'Subscribe to live updates for a newsletter. Updates arrive on the webhook.',
        tags: ['Newsletters'],
        summary: 'Subscribe to updates',
        params: newsletterParams,
      },
    },
    async (request, reply) => {
      const { instanceId, newsletterId } = request.params as {
        instanceId: string;
        newsletterId: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        requireOk(await client.subscribeNewsletterUpdates(newsletterId), 'subscribe to updates');
        reply.send({ success: true, data: { newsletterId, subscribed: true } });
      } catch (err: any) {
        failed('subscribe to updates', err);
      }
    },
  );

  server.put(
    '/instances/:instanceId/newsletters/:newsletterId/picture',
    {
      schema: {
        description: 'Set the newsletter picture from a URL, file path, or data URI',
        tags: ['Newsletters'],
        summary: 'Set newsletter picture',
        params: newsletterParams,
        body: {
          type: 'object',
          required: ['url'],
          additionalProperties: false,
          properties: { url: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, newsletterId } = request.params as {
        instanceId: string;
        newsletterId: string;
      };
      const { url } = request.body as { url: string };
      const client = requireConnectedClient(server, instanceId);

      try {
        requireOk(await client.updateNewsletterPicture(newsletterId, url), 'set picture');
        reply.send({ success: true, data: { newsletterId, updated: true } });
      } catch (err: any) {
        failed('set newsletter picture', err);
      }
    },
  );

  server.delete(
    '/instances/:instanceId/newsletters/:newsletterId/picture',
    {
      schema: {
        description: 'Remove the newsletter picture',
        tags: ['Newsletters'],
        summary: 'Remove newsletter picture',
        params: newsletterParams,
      },
    },
    async (request, reply) => {
      const { instanceId, newsletterId } = request.params as {
        instanceId: string;
        newsletterId: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        requireOk(await client.removeNewsletterPicture(newsletterId), 'remove picture');
        reply.send({ success: true, data: { newsletterId, removed: true } });
      } catch (err: any) {
        failed('remove newsletter picture', err);
      }
    },
  );

  server.get(
    '/instances/:instanceId/newsletters/:newsletterId/subscribers',
    {
      schema: {
        description: 'Get subscriber information for a newsletter',
        tags: ['Newsletters'],
        summary: 'Get subscribers',
        params: newsletterParams,
      },
    },
    async (request, reply) => {
      const { instanceId, newsletterId } = request.params as {
        instanceId: string;
        newsletterId: string;
      };
      const client = requireConnectedClient(server, instanceId);

      const info = await client.getNewsletterSubscribers(newsletterId);
      if (!info) {
        throw new NotFoundError('Newsletter');
      }

      reply.send({ success: true, data: info });
    },
  );

  server.get(
    '/instances/:instanceId/newsletters/:newsletterId/admins/count',
    {
      schema: {
        description: 'Count the admins of a newsletter',
        tags: ['Newsletters'],
        summary: 'Count admins',
        params: newsletterParams,
      },
    },
    async (request, reply) => {
      const { instanceId, newsletterId } = request.params as {
        instanceId: string;
        newsletterId: string;
      };
      const client = requireConnectedClient(server, instanceId);

      const count = await client.getNewsletterAdminCount(newsletterId);
      if (count === null) {
        throw new NotFoundError('Newsletter');
      }

      reply.send({ success: true, data: { newsletterId, count } });
    },
  );

  server.patch(
    '/instances/:instanceId/newsletters/:newsletterId/owner',
    {
      schema: {
        description:
          'Transfer ownership. This is irreversible from this account: the new owner ' +
          'must transfer it back.',
        tags: ['Newsletters'],
        summary: 'Change owner',
        params: newsletterParams,
        body: {
          type: 'object',
          required: ['newOwnerJid'],
          additionalProperties: false,
          properties: { newOwnerJid: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, newsletterId } = request.params as {
        instanceId: string;
        newsletterId: string;
      };
      const { newOwnerJid } = request.body as { newOwnerJid: string };
      const client = requireConnectedClient(server, instanceId);

      try {
        requireOk(await client.changeNewsletterOwner(newsletterId, newOwnerJid), 'change owner');
        reply.send({ success: true, data: { newsletterId, owner: newOwnerJid } });
      } catch (err: any) {
        failed('change newsletter owner', err);
      }
    },
  );

  server.delete(
    '/instances/:instanceId/newsletters/:newsletterId/admins/:adminJid',
    {
      schema: {
        description: 'Demote an admin back to a regular subscriber',
        tags: ['Newsletters'],
        summary: 'Demote admin',
        params: {
          type: 'object',
          required: ['instanceId', 'newsletterId', 'adminJid'],
          properties: {
            instanceId: { type: 'string' },
            newsletterId: { type: 'string', minLength: 1 },
            adminJid: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, newsletterId, adminJid } = request.params as {
        instanceId: string;
        newsletterId: string;
        adminJid: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        requireOk(await client.demoteNewsletterAdmin(newsletterId, adminJid), 'demote admin');
        reply.send({ success: true, data: { newsletterId, adminJid, demoted: true } });
      } catch (err: any) {
        failed('demote newsletter admin', err);
      }
    },
  );

  server.put(
    '/instances/:instanceId/newsletters/:newsletterId/messages/:messageId/reaction',
    {
      schema: {
        description: 'React to a newsletter message',
        tags: ['Newsletters'],
        summary: 'Set reaction',
        params: newsletterMessageParams,
        body: {
          type: 'object',
          required: ['emoji'],
          additionalProperties: false,
          properties: { emoji: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, newsletterId, messageId } = request.params as {
        instanceId: string;
        newsletterId: string;
        messageId: string;
      };
      const { emoji } = request.body as { emoji: string };
      const client = requireConnectedClient(server, instanceId);

      try {
        requireOk(
          await client.reactToNewsletterMessage(newsletterId, messageId, emoji),
          'react to message',
        );
        reply.send({ success: true, data: { newsletterId, messageId, emoji } });
      } catch (err: any) {
        failed('react to newsletter message', err);
      }
    },
  );

  server.delete(
    '/instances/:instanceId/newsletters/:newsletterId/messages/:messageId/reaction',
    {
      schema: {
        description: 'Remove your reaction from a newsletter message',
        tags: ['Newsletters'],
        summary: 'Remove reaction',
        params: newsletterMessageParams,
      },
    },
    async (request, reply) => {
      const { instanceId, newsletterId, messageId } = request.params as {
        instanceId: string;
        newsletterId: string;
        messageId: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        // miaw-core has no separate removal call; an empty emoji clears it.
        requireOk(
          await client.reactToNewsletterMessage(newsletterId, messageId, ''),
          'remove reaction',
        );
        reply.send({ success: true, data: { newsletterId, messageId, removed: true } });
      } catch (err: any) {
        failed('remove newsletter reaction', err);
      }
    },
  );
}
