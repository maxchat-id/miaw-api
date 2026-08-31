/**
 * Catalog Routes (v2) — WhatsApp Business
 *
 * GET    /instances/:instanceId/catalog/products
 * POST   /instances/:instanceId/catalog/products
 * PATCH  /instances/:instanceId/catalog/products/:productId
 * DELETE /instances/:instanceId/catalog/products/:productId
 * GET    /instances/:instanceId/catalog/collections
 * POST   /instances/:instanceId/catalog/product-deletions
 *
 * v1 nested the reads under the writes — `/products/catalog` and
 * `/products/collections` sat alongside `POST /products` — so `products` meant
 * both the collection and a sub-path. v2 puts everything under `catalog/`,
 * where `products` and `collections` are siblings.
 *
 * Deleting products is bulk-only in miaw-core, so v1 exposed just a batch
 * DELETE on the collection with ids in the body. v2 keeps the batch as an
 * explicit `product-deletions` resource and adds the single-product DELETE
 * that callers expect, implemented as a batch of one.
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

const productParams = {
  type: 'object',
  required: ['instanceId', 'productId'],
  properties: {
    instanceId: { type: 'string' },
    productId: { type: 'string', minLength: 1 },
  },
};

const productBody = {
  type: 'object',
  required: ['name', 'description', 'price', 'currency'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    price: { type: 'number', minimum: 0 },
    currency: { type: 'string', minLength: 3, maxLength: 3 },
    imageUrls: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      description: 'Must be publicly reachable — WhatsApp fetches them itself.',
    },
    isHidden: { type: 'boolean' },
    retailerId: { type: 'string' },
  },
};

interface ProductBody {
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrls?: string[];
  isHidden?: boolean;
  retailerId?: string;
}

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

export async function catalogRoutesV2(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', createAuthMiddleware());

  server.get(
    '/instances/:instanceId/catalog/products',
    {
      schema: {
        description:
          'List catalog products. Omit businessJid to read your own catalog. ' +
          'Pagination is cursor-based; nextCursor comes back inside data.',
        tags: ['Business'],
        summary: 'List products',
        params: instanceParams,
        querystring: {
          type: 'object',
          properties: {
            businessJid: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
            cursor: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const {
        businessJid,
        limit = 10,
        cursor,
      } = request.query as {
        businessJid?: string;
        limit?: number;
        cursor?: string;
      };
      const client = requireConnectedClient(server, instanceId);

      const result = await client.getCatalog(businessJid, limit, cursor);
      if (!result.success) {
        throw new BadRequestError('Failed to fetch catalog', { error: result.error });
      }

      const items = result.products ?? [];
      reply.send({
        success: true,
        data: { items, total: items.length, nextCursor: result.nextCursor ?? null },
      });
    },
  );

  server.post(
    '/instances/:instanceId/catalog/products',
    {
      schema: {
        description: 'Add a product to the catalog',
        tags: ['Business'],
        summary: 'Create product',
        params: instanceParams,
        body: productBody,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const body = request.body as ProductBody;
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.createProduct(body);
        if (!result.success) {
          throw new BadRequestError('Failed to create product', { error: result.error });
        }
        reply.status(201).send({ success: true, data: { productId: result.productId } });
      } catch (err: any) {
        failed('create product', err);
      }
    },
  );

  server.patch(
    '/instances/:instanceId/catalog/products/:productId',
    {
      schema: {
        description:
          'Update a product. miaw-core replaces the whole product, so every field is required.',
        tags: ['Business'],
        summary: 'Update product',
        params: productParams,
        body: productBody,
      },
    },
    async (request, reply) => {
      const { instanceId, productId } = request.params as {
        instanceId: string;
        productId: string;
      };
      const body = request.body as ProductBody;
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.updateProduct(productId, body);
        if (!result.success) {
          throw new BadRequestError('Failed to update product', { error: result.error });
        }
        reply.send({ success: true, data: { productId } });
      } catch (err: any) {
        failed('update product', err);
      }
    },
  );

  server.delete(
    '/instances/:instanceId/catalog/products/:productId',
    {
      schema: {
        description: 'Remove one product from the catalog',
        tags: ['Business'],
        summary: 'Delete product',
        params: productParams,
      },
    },
    async (request, reply) => {
      const { instanceId, productId } = request.params as {
        instanceId: string;
        productId: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        // miaw-core only deletes in bulk; a single delete is a batch of one.
        const result = await client.deleteProducts([productId]);
        if (!result.success) {
          throw new BadRequestError('Failed to delete product', { error: result.error });
        }
        reply.send({ success: true, data: { productId, deleted: true } });
      } catch (err: any) {
        failed('delete product', err);
      }
    },
  );

  server.post(
    '/instances/:instanceId/catalog/product-deletions',
    {
      schema: {
        description: 'Remove several products in one call',
        tags: ['Business'],
        summary: 'Delete products in bulk',
        params: instanceParams,
        body: {
          type: 'object',
          required: ['productIds'],
          additionalProperties: false,
          properties: {
            productIds: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', minLength: 1 },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const { productIds } = request.body as { productIds: string[] };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.deleteProducts(productIds);
        if (!result.success) {
          throw new BadRequestError('Failed to delete products', { error: result.error });
        }
        // WhatsApp may drop fewer than asked, so the count is the answer.
        reply.send({
          success: true,
          data: { requested: productIds.length, deletedCount: result.deletedCount ?? 0 },
        });
      } catch (err: any) {
        failed('delete products', err);
      }
    },
  );

  server.get(
    '/instances/:instanceId/catalog/collections',
    {
      schema: {
        description: 'List catalog collections. Omit businessJid to read your own catalog.',
        tags: ['Business'],
        summary: 'List collections',
        params: instanceParams,
        querystring: {
          type: 'object',
          properties: {
            businessJid: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 51 },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const { businessJid, limit = 51 } = request.query as {
        businessJid?: string;
        limit?: number;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const items = (await client.getCollections(businessJid, limit)) ?? [];
        reply.send({ success: true, data: { items, total: items.length } });
      } catch (err: any) {
        failed('fetch collections', err);
      }
    },
  );
}
