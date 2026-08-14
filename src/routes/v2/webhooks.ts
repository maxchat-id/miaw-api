/**
 * Webhook Routes (v2)
 *
 * GET   /instances/:instanceId/webhook        - Current webhook configuration
 * PATCH /instances/:instanceId/webhook        - Update URL and/or events
 * GET   /instances/:instanceId/webhook/stats  - Delivery statistics
 * POST  /instances/:instanceId/webhook-tests  - Queue a test delivery
 *
 * v1 read the webhook configuration only as part of the instance payload and
 * named the other two routes `/webhook/status` and `/webhook/test`. v2 makes
 * the configuration its own readable resource and turns a test into a created
 * item in a `webhook-tests` collection.
 *
 * The SSRF check on update is a local guarantee and runs here too: a webhook
 * URL is a server-side fetch target, so accepting one unchecked would let a
 * caller aim the dispatcher at internal addresses.
 */

import { FastifyInstance } from 'fastify';
import type { WebhookEvent } from '../../types';
import { config } from '../../config';
import { createAuthMiddleware } from '../../middleware/auth';
import { NotFoundError, BadRequestError, ServiceUnavailableError } from '../../utils/errorHandler';
import { assertSafeWebhookUrl } from '../../utils/ssrf';

const instanceParams = {
  type: 'object',
  required: ['instanceId'],
  properties: { instanceId: { type: 'string' } },
};

export async function webhookRoutesV2(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', createAuthMiddleware());

  server.get(
    '/instances/:instanceId/webhook',
    {
      schema: {
        description: 'Get the webhook configuration for an instance',
        tags: ['Webhooks'],
        summary: 'Get webhook configuration',
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
          webhookUrl: instance.webhookUrl ?? null,
          webhookEvents: instance.webhookEvents ?? [],
          webhookEnabled: instance.webhookEnabled,
        },
      });
    },
  );

  server.patch(
    '/instances/:instanceId/webhook',
    {
      schema: {
        description: 'Update instance webhook settings (URL and/or events)',
        tags: ['Webhooks'],
        summary: 'Update webhook configuration',
        params: instanceParams,
        body: { $ref: 'updateInstance#' },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const body = request.body as {
        webhookUrl?: string | null;
        webhookEvents?: WebhookEvent[];
      };

      if (body.webhookUrl) {
        await assertSafeWebhookUrl(body.webhookUrl, config.webhookSsrfAllowlist);
      }

      try {
        const state = server.instanceManager.updateWebhook(instanceId, body);
        reply.send({ success: true, data: state });
      } catch (err: any) {
        if (err.message?.includes('not found')) {
          throw new NotFoundError('Instance');
        }
        throw err;
      }
    },
  );

  server.get(
    '/instances/:instanceId/webhook/stats',
    {
      schema: {
        description: 'Get webhook delivery statistics for an instance',
        tags: ['Webhooks'],
        summary: 'Get webhook delivery stats',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const instance = server.instanceManager.getInstance(instanceId);

      if (!instance) {
        throw new NotFoundError('Instance');
      }
      if (!server.webhookDispatcher) {
        throw new ServiceUnavailableError('Webhook dispatcher not available');
      }

      reply.send({
        success: true,
        data: {
          instanceId,
          webhookUrl: instance.webhookUrl ?? null,
          webhookEvents: instance.webhookEvents ?? [],
          stats: server.webhookDispatcher.getStats(),
        },
      });
    },
  );

  server.post(
    '/instances/:instanceId/webhook-tests',
    {
      schema: {
        description:
          'Queue a test event for delivery to the configured webhook URL. ' +
          'Returns once the event is queued; delivery and retries happen in the background.',
        tags: ['Webhooks'],
        summary: 'Queue a test webhook delivery',
        params: instanceParams,
        body: {
          type: 'object',
          // The only field has a default, so a bodyless POST is meaningful.
          // Without nullable, Fastify rejects it with 'body must be object'.
          nullable: true,
          additionalProperties: false,
          properties: { event: { type: 'string', minLength: 1, default: 'test' } },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const { event = 'test' } = (request.body ?? {}) as { event?: string };

      const instance = server.instanceManager.getInstance(instanceId);
      if (!instance) {
        throw new NotFoundError('Instance');
      }
      if (!instance.webhookUrl) {
        throw new BadRequestError('No webhook URL configured for this instance');
      }
      if (!server.webhookDispatcher) {
        throw new ServiceUnavailableError('Webhook dispatcher not available');
      }

      const testEvent = {
        event,
        instanceId,
        timestamp: Date.now(),
        data: { test: true, message: 'This is a test webhook from Miaw API' },
      };

      try {
        // v1 slept 2s here to "wait for delivery", which held the request open
        // without ever reporting the outcome — the dispatcher retries in the
        // background either way. Read /webhook/stats for the result instead.
        await server.webhookDispatcher.queue(instance.webhookUrl, testEvent);
      } catch (err: any) {
        throw new BadRequestError('Failed to queue test webhook', { error: err.message });
      }

      reply.status(202).send({
        success: true,
        data: { queued: true, webhookUrl: instance.webhookUrl, testEvent },
      });
    },
  );
}
