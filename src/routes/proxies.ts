import type { FastifyInstance } from 'fastify';
import type { ProxyConfig } from 'miaw-core';
import { validateProxyConfig } from 'miaw-core';
import { createAuthMiddleware } from '../middleware/auth.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
} from '../utils/errorHandler.js';
import { testProxy, type ProxyInput } from '../services/ProxyService.js';

const instanceParams = {
  type: 'object',
  required: ['instanceId'],
  properties: {
    instanceId: { type: 'string' },
  },
};

export async function proxyRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', createAuthMiddleware());

  server.get(
    '/proxy-pool',
    {
      schema: {
        tags: ['Proxies'],
        summary: 'Inspect the configured proxy pool',
      },
    },
    async () => ({
      success: true,
      data: server.proxyPool.getStatus(),
    }),
  );

  server.post(
    '/proxy-pool/reloads',
    {
      schema: {
        tags: ['Proxies'],
        summary: 'Reload the configured proxy pool',
      },
    },
    async () => {
      if (!server.proxyPool.enabled) {
        throw new ConflictError('Proxy pool is not configured');
      }

      try {
        return {
          success: true,
          data: await server.proxyPool.reload(),
        };
      } catch (error) {
        server.log.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'On-demand proxy pool reload failed',
        );
        throw new ServiceUnavailableError(
          'Proxy pool reload failed; the previous pool remains active',
        );
      }
    },
  );

  server.post(
    '/proxy-tests',
    {
      schema: {
        tags: ['Proxies'],
        summary: 'Test a proxy without creating an instance',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['proxy'],
          properties: {
            proxy: { $ref: 'proxyConfig#' },
            timeoutMs: {
              type: 'integer',
              minimum: 1000,
              maximum: 30000,
              default: 10000,
            },
          },
        },
      },
    },
    async (request) => {
      const body = request.body as {
        proxy: ProxyInput;
        timeoutMs?: number;
      };
      if (!validateProxyConfig(body.proxy)) {
        throw new BadRequestError('Invalid proxy configuration');
      }
      return {
        success: true,
        data: await testProxy(body.proxy, body.timeoutMs),
      };
    },
  );

  server.get(
    '/instances/:instanceId/proxy',
    {
      schema: {
        tags: ['Proxies'],
        summary: 'Get an instance proxy',
        params: instanceParams,
      },
    },
    async (request) => {
      const { instanceId } = request.params as { instanceId: string };
      try {
        return {
          success: true,
          data: server.instanceManager.getProxy(instanceId),
        };
      } catch (error) {
        throw mapInstanceProxyError(error);
      }
    },
  );

  server.put(
    '/instances/:instanceId/proxy',
    {
      schema: {
        tags: ['Proxies'],
        summary: 'Replace a disconnected instance proxy',
        params: instanceParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['proxy'],
          properties: {
            proxy: { $ref: 'proxyConfig#' },
          },
        },
      },
    },
    async (request) => {
      const { instanceId } = request.params as { instanceId: string };
      const { proxy } = request.body as { proxy: ProxyConfig | string };
      if (!validateProxyConfig(proxy)) {
        throw new BadRequestError('Invalid proxy configuration');
      }
      try {
        return {
          success: true,
          data: await server.instanceManager.replaceProxy(instanceId, proxy),
        };
      } catch (error) {
        throw mapInstanceProxyError(error);
      }
    },
  );

  server.delete(
    '/instances/:instanceId/proxy',
    {
      schema: {
        tags: ['Proxies'],
        summary: 'Remove an instance proxy override',
        params: instanceParams,
      },
    },
    async (request) => {
      const { instanceId } = request.params as { instanceId: string };
      try {
        return {
          success: true,
          data: await server.instanceManager.replaceProxy(instanceId),
        };
      } catch (error) {
        throw mapInstanceProxyError(error);
      }
    },
  );
}

function mapInstanceProxyError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('not found')) return new NotFoundError('Instance');
  if (message.includes('must be disconnected')) {
    return new ConflictError(message);
  }
  if (message.includes('Invalid proxy configuration')) {
    return new BadRequestError('Invalid proxy configuration');
  }
  return error instanceof Error ? error : new Error(message);
}
