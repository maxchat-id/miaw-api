/**
 * Fastify module augmentation
 *
 * Types the decorators added in server.ts so route handlers can access
 * `server.instanceManager` / `server.webhookDispatcher` with full type
 * checking instead of an `(server as any)` cast.
 */

import 'fastify';
import { InstanceManager } from '../services/InstanceManager';
import { WebhookDispatcher } from '../services/WebhookDispatcher';

declare module 'fastify' {
  interface FastifyInstance {
    instanceManager: InstanceManager;
    webhookDispatcher: WebhookDispatcher;
  }
}
