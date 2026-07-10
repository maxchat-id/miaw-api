/**
 * Miaw API Server
 * REST API wrapper for miaw-core
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import ScalarApiReference from '@scalar/fastify-api-reference';
import { config } from './config';
import { registerRoutes } from './routes';
import { registerSchemas } from './schemas';
import { InstanceManager } from './services/InstanceManager';
import { WebhookDispatcher } from './services/WebhookDispatcher';
import { errorHandler } from './utils/errorHandler';
import { createShutdownHandler } from './utils/shutdown';

/**
 * Create and configure Fastify server
 */
export async function createServer(): Promise<FastifyInstance> {
  const server: FastifyInstance = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.logLevel === 'debug'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'reqId,responseTime',
              },
            }
          : undefined,
    },
  });

  // Register plugins
  await server.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
  });

  await server.register(swagger, {
    openapi: {
      info: {
        title: 'Miaw API',
        description: 'REST API wrapper for miaw-core - Multiple Instance of App WhatsApp',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://localhost:${config.port}`,
          description: 'Development server',
        },
      ],
      tags: [
        { name: 'Instances', description: 'Create and manage WhatsApp instances' },
        { name: 'Connection', description: 'Connect, disconnect, and check instance status' },
        {
          name: 'Data',
          description:
            'Fetch contacts, groups, profile, labels, chats, and messages from in-memory store',
        },
        {
          name: 'Messaging',
          description: 'Send text, media, and manage messages (edit, delete, react, forward)',
        },
        { name: 'Contacts', description: 'Check phone numbers and get contact information' },
        { name: 'Groups', description: 'Create and manage WhatsApp groups' },
        { name: 'Profile', description: 'Update profile picture, name, and status' },
        { name: 'Presence', description: 'Presence, typing indicators, and read receipts' },
        { name: 'Webhooks', description: 'Configure webhooks for real-time events' },
        {
          name: 'Business',
          description: 'WhatsApp Business features (labels, catalog, newsletters)',
        },
        { name: 'Health', description: 'API health check' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            description: 'API key sent as `Authorization: Bearer <key>`',
          },
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'API key sent as `X-API-Key: <key>`',
          },
        },
      },
      security: [{ bearerAuth: [] }, { apiKey: [] }],
    },
  });

  await server.register(ScalarApiReference, {
    routePrefix: '/docs',
    configuration: {
      title: 'Miaw API Documentation',
      spec: {
        url: '/documentation/json',
      },
    },
  });

  // Register schemas
  registerSchemas(server);

  // Register error handler
  setErrorHandler(server);

  // Register health check
  server.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Check if the API is running',
        security: [], // public endpoint — no auth (overrides global security)
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'number' },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      return { status: 'ok', timestamp: Date.now() };
    },
  );

  // Serve OpenAPI JSON spec
  server.get('/documentation/json', async (_request, _reply) => {
    return server.swagger();
  });

  // Create instance manager (shared across requests)
  const instanceManager = new InstanceManager({
    sessionPath: config.sessionPath,
    webhookSecret: config.webhookSecret,
    webhookTimeout: config.webhookTimeout,
    webhookMaxRetries: config.webhookMaxRetries,
    webhookRetryDelay: config.webhookRetryDelay,
  });

  // Create webhook dispatcher
  const webhookDispatcher = new WebhookDispatcher({
    secret: config.webhookSecret,
    timeout: config.webhookTimeout,
    maxRetries: config.webhookMaxRetries,
    retryDelay: config.webhookRetryDelay,
  });

  // Connect instance manager webhook events to dispatcher
  instanceManager.on('webhook', (url: string, payload: any) => {
    webhookDispatcher.queue(url, payload);
  });

  // Decorate server with instance manager
  server.decorate('instanceManager', instanceManager);
  server.decorate('webhookDispatcher', webhookDispatcher);

  // Register API routes (pass instanceManager for v0.9.0 routes)
  await registerRoutes(server, instanceManager);

  return server;
}

/**
 * Set global error handler
 */
function setErrorHandler(server: FastifyInstance): void {
  server.setErrorHandler((error: unknown, request, reply) => {
    // errorHandler already sends the response, no need to call reply.send again
    errorHandler(error as Error, request, reply);
  });
}

/**
 * Start the server
 */
export async function startServer(): Promise<void> {
  const server = await createServer();

  try {
    await server.listen({ port: config.port, host: config.host });
    server.log.info(`Server listening on http://${config.host}:${config.port}`);
    server.log.info(`API documentation available at http://${config.host}:${config.port}/docs`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown on termination signals
  const shutdown = createShutdownHandler({
    server,
    instanceManager: server.instanceManager,
    webhookDispatcher: server.webhookDispatcher,
    logger: server.log,
    exit: (code) => process.exit(code),
  });
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Start server if run directly
if (require.main === module) {
  startServer();
}
