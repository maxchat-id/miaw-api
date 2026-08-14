/**
 * Connection Routes (v2)
 *
 * PUT    /instances/:instanceId/connection           - Connect
 * DELETE /instances/:instanceId/connection           - Disconnect
 * POST   /instances/:instanceId/connection-restarts  - Restart
 * GET    /instances/:instanceId/connection           - Connection status
 *
 * Differences from v1: connection is a sub-resource acted on with PUT/DELETE
 * instead of `/connect` and `/disconnect` verbs, and a restart is a POST to a
 * collection of restarts. `needsPairing` is carried over from v1 — callers
 * rely on it to distinguish a fresh scan from a transient reconnect.
 */

import { FastifyInstance } from 'fastify';
import { createAuthMiddleware } from '../../middleware/auth';
import { NotFoundError, ServiceUnavailableError } from '../../utils/errorHandler';

const instanceParams = {
  type: 'object',
  required: ['instanceId'],
  properties: { instanceId: { type: 'string' } },
};

export async function connectionRoutesV2(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', createAuthMiddleware());

  server.put(
    '/instances/:instanceId/connection',
    {
      schema: {
        description:
          'Connect instance to WhatsApp. When a QR scan is required, pull it from ' +
          '/instances/:instanceId/authentication/qr-code or listen on the webhook.',
        tags: ['Connection'],
        summary: 'Connect instance',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const client = server.instanceManager.getClient(instanceId);

      if (!client) {
        throw new NotFoundError('Instance');
      }

      try {
        await client.connect();
      } catch (err: any) {
        throw new ServiceUnavailableError(err.message);
      }

      const status = server.instanceManager.getInstance(instanceId)?.status ?? 'connecting';
      reply.send({
        success: true,
        data: { status: status === 'connected' ? 'connected' : status },
      });
    },
  );

  server.delete(
    '/instances/:instanceId/connection',
    {
      schema: {
        description:
          'Disconnect instance from WhatsApp. The session is preserved; reconnect with PUT.',
        tags: ['Connection'],
        summary: 'Disconnect instance',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const client = server.instanceManager.getClient(instanceId);

      if (!client) {
        throw new NotFoundError('Instance');
      }

      await client.disconnect();
      reply.send({ success: true, data: { connected: false } });
    },
  );

  server.post(
    '/instances/:instanceId/connection-restarts',
    {
      schema: {
        description: 'Restart the instance connection. Useful when the socket is stale.',
        tags: ['Connection'],
        summary: 'Restart instance',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const client = server.instanceManager.getClient(instanceId);

      if (!client) {
        throw new NotFoundError('Instance');
      }

      try {
        await client.disconnect();
      } catch {
        // Already down - the restart is the point, not the teardown.
      }
      await client.connect();

      reply.send({ success: true, data: { restarted: true } });
    },
  );

  server.get(
    '/instances/:instanceId/connection',
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
        summary: 'Get connection status',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const instance = server.instanceManager.getInstance(instanceId);

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
          // True only when a fresh QR scan is required (never during a
          // transient reconnect), so callers can hold `ready` on reconnect.
          needsPairing: instance.status === 'qr_required',
        },
      });
    },
  );
}
