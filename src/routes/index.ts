/**
 * Routes Registry
 * Register all API routes
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

/**
 * Register all routes
 */
export async function registerRoutes(
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
}
