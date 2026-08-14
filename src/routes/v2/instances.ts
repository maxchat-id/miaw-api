/**
 * Instance Management Routes (v2)
 *
 * POST   /instances                                  - Create instance
 * GET    /instances                                  - List instances
 * GET    /instances/:instanceId                      - Get instance
 * DELETE /instances/:instanceId                      - Delete instance
 * GET    /instances/:instanceId/authentication/qr-code - Pull the cached QR
 *
 * Differences from v1: the path parameter is `:instanceId` (not `:id`), the
 * list returns `{ items, total }`, and the QR moved from `/qr` to
 * `/authentication/qr-code`. Webhook configuration lives in `./webhooks.ts`.
 * The v1 SSRF check on webhook URLs is kept — it is a local guarantee, not a
 * contract detail.
 */

import { FastifyInstance } from 'fastify';
import type { InstanceClientOptions, WebhookEvent } from '../../types';
import { config } from '../../config';
import { createAuthMiddleware } from '../../middleware/auth';
import { ConflictError, NotFoundError } from '../../utils/errorHandler';
import { assertSafeWebhookUrl } from '../../utils/ssrf';

const instanceParams = {
  type: 'object',
  required: ['instanceId'],
  properties: { instanceId: { type: 'string' } },
};

export async function instanceRoutesV2(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', createAuthMiddleware());

  server.post(
    '/instances',
    {
      schema: {
        description: 'Create a new WhatsApp instance',
        tags: ['Instances'],
        summary: 'Create instance',
        body: { $ref: 'createInstance#' },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        instanceId: string;
        webhookUrl?: string;
        webhookEvents?: WebhookEvent[];
        clientOptions?: InstanceClientOptions;
      };

      if (body.webhookUrl) {
        await assertSafeWebhookUrl(body.webhookUrl, config.webhookSsrfAllowlist);
      }

      try {
        const state = await server.instanceManager.createInstance(body);
        reply.status(201).send({ success: true, data: state });
      } catch (err: any) {
        if (err.message?.includes('already exists')) {
          throw new ConflictError(`Instance ${body.instanceId} already exists`);
        }
        throw err;
      }
    },
  );

  server.get(
    '/instances',
    {
      schema: {
        description: 'List all WhatsApp instances',
        tags: ['Instances'],
        summary: 'List instances',
      },
    },
    async (_request, reply) => {
      const items = server.instanceManager.listInstances();
      reply.send({ success: true, data: { items, total: items.length } });
    },
  );

  server.get(
    '/instances/:instanceId',
    {
      schema: {
        description: 'Get instance details',
        tags: ['Instances'],
        summary: 'Get instance',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const instance = server.instanceManager.getInstance(instanceId);

      if (!instance) {
        throw new NotFoundError('Instance');
      }

      reply.send({ success: true, data: instance });
    },
  );

  server.delete(
    '/instances/:instanceId',
    {
      schema: {
        description: 'Delete a WhatsApp instance',
        tags: ['Instances'],
        summary: 'Delete instance',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };

      try {
        await server.instanceManager.deleteInstance(instanceId);
        reply.send({ success: true, data: { deleted: true } });
      } catch (err: any) {
        if (err.message?.includes('not found')) {
          throw new NotFoundError('Instance');
        }
        throw err;
      }
    },
  );

  server.get(
    '/instances/:instanceId/authentication/qr-code',
    {
      schema: {
        description:
          'Get the last QR code for pairing (cached from the qr event). ' +
          'Returns 404 once the instance is connected and the QR has been cleared.',
        tags: ['Instances'],
        summary: 'Get current qr-code',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const instance = server.instanceManager.getInstance(instanceId);

      if (!instance) {
        throw new NotFoundError('Instance');
      }
      if (!instance.lastQr) {
        throw new NotFoundError('QR code');
      }

      reply.send({
        success: true,
        data: { qr: instance.lastQr, status: instance.status },
      });
    },
  );
}
