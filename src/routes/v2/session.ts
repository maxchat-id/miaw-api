/**
 * Session and Runtime Routes (v2)
 *
 * DELETE /instances/:instanceId/authentication - Log out of WhatsApp
 * DELETE /instances/:instanceId/session        - Delete the stored credentials
 * GET    /instances/:instanceId/runtime        - Read the tunable options
 * PATCH  /instances/:instanceId/runtime        - Change them on a live client
 * DELETE /instances/:instanceId/runtime        - Dispose the in-process client
 * GET    /instances/:instanceId/stats/messages
 * GET    /instances/:instanceId/stats/labels
 *
 * v1 spelled these as verbs — `POST /logout`, `POST /dispose`, `DELETE
 * /session` — so two operations that both destroy something used different
 * methods. v2 makes each one a DELETE on the thing being destroyed, which also
 * makes the difference between them legible:
 *
 * - `authentication` is the pairing with WhatsApp. Deleting it tells WhatsApp
 *   to forget this device; the next connect needs a fresh QR scan.
 * - `session` is the credentials on disk. Deleting it drops the local copy.
 * - `runtime` is the client object in this process. Deleting it frees sockets
 *   and timers while leaving the stored session intact, so a later connect
 *   resumes without a scan.
 *
 * Two v1 responses could not pass the envelope: `{ success, message }` with no
 * `data` at all, and `{ success, message, data }` where the message carried
 * the outcome. Both now report the outcome inside `data`.
 */

import { FastifyInstance } from 'fastify';
import type { MiawClient, RuntimeOptions } from 'miaw-core';
import { createAuthMiddleware } from '../../middleware/auth';
import { NotFoundError, ServiceUnavailableError } from '../../utils/errorHandler';

const instanceParams = {
  type: 'object',
  required: ['instanceId'],
  properties: { instanceId: { type: 'string' } },
};

/**
 * These routes act on a client that may well be disconnected — that is often
 * the point — so unlike the messaging routes they only require the client to
 * exist.
 */
function requireClient(server: FastifyInstance, instanceId: string): MiawClient {
  const client = server.instanceManager.getClient(instanceId);
  if (!client) {
    throw new NotFoundError('Instance');
  }
  return client;
}

export async function sessionRoutesV2(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', createAuthMiddleware());

  server.delete(
    '/instances/:instanceId/authentication',
    {
      schema: {
        description:
          'Log out of WhatsApp and clear the session. The device is unlinked, so the ' +
          'next connect requires a fresh QR scan.',
        tags: ['Session'],
        summary: 'Log out',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const client = requireClient(server, instanceId);

      try {
        await client.logout();
      } catch (err: any) {
        throw new ServiceUnavailableError(err.message);
      }

      reply.send({ success: true, data: { loggedOut: true, sessionCleared: true } });
    },
  );

  server.delete(
    '/instances/:instanceId/session',
    {
      schema: {
        description:
          'Delete the stored credentials without logging out at WhatsApp. The next ' +
          'connect requires a fresh QR scan.',
        tags: ['Session'],
        summary: 'Clear stored session',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const client = requireClient(server, instanceId);

      // Nothing to clear is not an error; the caller wanted it gone and it is.
      const cleared = client.clearSession();

      reply.send({ success: true, data: { cleared } });
    },
  );

  server.delete(
    '/instances/:instanceId/runtime',
    {
      schema: {
        description:
          'Dispose the in-process client, freeing its sockets and timers. The stored ' +
          'session survives, so a later connect resumes without a scan.',
        tags: ['Session'],
        summary: 'Dispose runtime',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const client = requireClient(server, instanceId);

      try {
        await client.dispose();
      } catch (err: any) {
        throw new ServiceUnavailableError(err.message);
      }

      reply.send({ success: true, data: { disposed: true, sessionPreserved: true } });
    },
  );

  server.get(
    '/instances/:instanceId/stats/messages',
    {
      schema: {
        description: 'Message counts per chat, from the in-memory store',
        tags: ['Session'],
        summary: 'Message store stats',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const client = requireClient(server, instanceId);

      const counts = client.getMessageCounts();
      let totalMessages = 0;
      counts.forEach((count: number) => {
        totalMessages += count;
      });

      reply.send({
        success: true,
        data: {
          counts: Object.fromEntries(counts),
          totalChats: counts.size,
          totalMessages,
        },
      });
    },
  );

  server.get(
    '/instances/:instanceId/stats/labels',
    {
      schema: {
        description: 'Label store size and last sync time',
        tags: ['Session'],
        summary: 'Label store stats',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const client = requireClient(server, instanceId);

      const info = client.getLabelsStoreInfo();

      reply.send({
        success: true,
        data: {
          size: info.size,
          eventCount: info.eventCount,
          lastSyncTime: info.lastSyncTime?.toISOString() ?? null,
        },
      });
    },
  );

  server.get(
    '/instances/:instanceId/runtime',
    {
      schema: {
        description:
          'Read the options that can be changed on a running client. Transport settings ' +
          'are absent by design: proxy, agent and browser are bound when the socket is ' +
          'built, so changing one needs a rebuild — see PUT .../proxy.',
        tags: ['Session'],
        summary: 'Get runtime options',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const client = requireClient(server, instanceId);

      reply.send({ success: true, data: client.getRuntimeOptions() });
    },
  );

  server.patch(
    '/instances/:instanceId/runtime',
    {
      schema: {
        description:
          'Change options on a running client. The reconnect values apply from the next ' +
          'attempt onward — one already scheduled keeps the delay it was scheduled with.',
        tags: ['Session'],
        summary: 'Update runtime options',
        params: instanceParams,
        body: {
          type: 'object',
          additionalProperties: false,
          // An empty patch would report success while changing nothing.
          minProperties: 1,
          properties: {
            debug: { type: 'boolean' },
            autoReconnect: { type: 'boolean' },
            maxReconnectAttempts: {
              type: 'integer',
              minimum: 0,
              description: 'Omit or use a large value for "keep trying".',
            },
            reconnectDelay: {
              type: 'integer',
              minimum: 100,
              maximum: 600000,
              description: 'Base delay in ms; the backoff doubles it per attempt.',
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const patch = request.body as Partial<RuntimeOptions>;
      const client = requireClient(server, instanceId);

      reply.send({ success: true, data: client.setRuntimeOptions(patch) });
    },
  );
}
