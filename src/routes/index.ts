/**
 * Routes Registry
 * Register all API routes
 *
 * Two contracts are served side by side:
 *
 * - **v1** — the historical shape, mounted unprefixed at the root. Frozen:
 *   existing consumers depend on these exact paths and payloads.
 * - **v2** — the normalized contract, mounted under `/api/v2`. Every 2xx
 *   response is wrapped in `successEnvelope`, and collections carry their
 *   pagination metadata inside `data`.
 *
 * A route module is shared by both mounts when its v1 shape already matches
 * the v2 contract; otherwise the v2 variant lives under `./v2/`. Modules are
 * ported one at a time, so `registerV2Routes` is deliberately shorter than
 * `registerV1Routes` until the port completes.
 */

import { FastifyInstance } from 'fastify';
import { InstanceManager } from '../services/InstanceManager';
import { instanceRoutes } from './instances';
import { connectionRoutes } from './connection';
import { messagingRoutes } from './messaging';
import { contactRoutes } from './contacts';
import { groupRoutes } from './groups';
import { profileRoutes } from './profile';
import { presenceRoutes } from './presence';
import { webhookRoutes } from './webhooks';
import { businessRoutes } from './business';
import { newsletterRoutes } from './newsletters';
import { basicGetsRoutes } from './basic-gets';
import { sessionRoutes } from './session';
import { proxyRoutes } from './proxies';

export const V2_PREFIX = '/api/v2';

/**
 * Register both contracts.
 */
export async function registerRoutes(
  server: FastifyInstance,
  instanceManager: InstanceManager,
): Promise<void> {
  await registerV1Routes(server, instanceManager);
  await registerV2Routes(server);
}

/**
 * v1 — unprefixed, unchanged.
 */
export async function registerV1Routes(
  server: FastifyInstance,
  instanceManager: InstanceManager,
): Promise<void> {
  // Instance management routes
  await server.register(instanceRoutes);

  // Connection routes
  await server.register(connectionRoutes);

  // Messaging routes
  await server.register(messagingRoutes);

  // Contact routes
  await server.register(contactRoutes);

  // Group routes
  await server.register(groupRoutes);

  // Profile routes
  await server.register(profileRoutes);

  // Presence & UX routes
  await server.register(presenceRoutes);

  // Webhook management routes
  await server.register(webhookRoutes);

  // Business features routes
  await server.register(businessRoutes);

  // Newsletter routes (v0.13.0)
  await server.register(newsletterRoutes);

  // Basic GET operations routes (v0.9.0)
  await server.register(async (server) => {
    await basicGetsRoutes(server, instanceManager);
  });

  // Session lifecycle & stats routes (v0.15.0)
  await server.register(sessionRoutes);

  // Proxy pool inspection and per-instance proxy management
  await server.register(proxyRoutes);
}

/**
 * v2 — normalized contract under `/api/v2`.
 *
 * The `onRoute` hook stamps `successEnvelope` onto every 2xx response so a
 * ported handler cannot accidentally ship a bare payload. It only fires for
 * routes registered inside this scope.
 */
export async function registerV2Routes(server: FastifyInstance): Promise<void> {
  await server.register(
    async (api) => {
      api.addHook('onRoute', (route) => {
        route.schema = {
          ...route.schema,
          response: {
            ...(route.schema?.response ?? {}),
            '2xx': { $ref: 'successEnvelope#' },
          },
        };
      });

      // Ported so far: proxy management. Its v1 paths already match the v2
      // contract, so the same module serves both mounts.
      await api.register(proxyRoutes);
    },
    { prefix: V2_PREFIX },
  );
}
