/**
 * v2 business: labels attach with PUT so a repeat is harmless, edit and delete
 * hide miaw-core's upsert encoding, and the catalog nests reads and writes
 * under one `catalog/` parent.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { registerSchemas } from '../../../src/schemas/index.js';
import { errorHandler } from '../../../src/utils/errorHandler.js';
import { labelRoutesV2 } from '../../../src/routes/v2/labels.js';
import { catalogRoutesV2 } from '../../../src/routes/v2/catalog.js';

const PREFIX = '/api/v2';
const CHAT = '628111@s.whatsapp.net';
const C = encodeURIComponent(CHAT);

describe('v2 business (labels + catalog)', () => {
  let server: FastifyInstance;
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let status: string;

  beforeEach(async () => {
    status = 'connected';
    client = {
      fetchAllLabels: vi.fn(async () => ({
        success: true,
        labels: [{ id: '1', name: 'Prospek', color: 3 }],
      })),
      addLabel: vi.fn(async () => ({ success: true, labelId: '1' })),
      getChatsByLabel: vi.fn(async () => [CHAT]),
      addChatLabel: vi.fn(async () => ({ success: true })),
      removeChatLabel: vi.fn(async () => ({ success: true })),
      addMessageLabel: vi.fn(async () => ({ success: true })),
      removeMessageLabel: vi.fn(async () => ({ success: true })),
      getCatalog: vi.fn(async () => ({
        success: true,
        products: [{ id: 'p1', name: 'Kopi' }],
        nextCursor: 'CUR',
      })),
      getCollections: vi.fn(async () => [{ id: 'c1', name: 'Minuman' }]),
      createProduct: vi.fn(async () => ({ success: true, productId: 'p1' })),
      updateProduct: vi.fn(async () => ({ success: true })),
      deleteProducts: vi.fn(async () => ({ success: true, deletedCount: 2 })),
    };

    server = Fastify({ logger: false });
    server.setErrorHandler(errorHandler);
    server.decorate('instanceManager', {
      getClient: vi.fn(() => client),
      getInstance: vi.fn(() => ({ instanceId: 'bot', status })),
    } as any);
    registerSchemas(server);
    await server.register(
      async (api) => {
        await api.register(labelRoutesV2);
        await api.register(catalogRoutesV2);
      },
      { prefix: PREFIX },
    );
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    vi.clearAllMocks();
  });

  const call = (method: string, url: string, payload?: unknown) =>
    server.inject({
      method: method as any,
      url: `${PREFIX}${url}`,
      headers: { 'x-api-key': config.apiKey },
      ...(payload === undefined ? {} : { payload }),
    });

  it('lists labels and labelled chats as { items, total }', async () => {
    expect((await call('GET', '/instances/bot/labels')).json().data.total).toBe(1);
    expect((await call('GET', '/instances/bot/labels/1/chats')).json().data).toEqual({
      items: [CHAT],
      total: 1,
    });
  });

  it('creates a label with 201', async () => {
    const res = await call('POST', '/instances/bot/labels', { name: 'Prospek', color: 3 });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.labelId).toBe('1');
    expect(client.addLabel).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Prospek', color: 3, deleted: false }),
    );
  });

  it('rejects a colour outside the WhatsApp palette', async () => {
    const res = await call('POST', '/instances/bot/labels', { name: 'Prospek', color: 42 });

    expect(res.statusCode).toBe(400);
    expect(client.addLabel).not.toHaveBeenCalled();
  });

  it('hides the upsert encoding behind PATCH and DELETE', async () => {
    await call('PATCH', '/instances/bot/labels/1', { name: 'Prospek Panas', color: 5 });
    expect(client.addLabel).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1', name: 'Prospek Panas', color: 5, deleted: false }),
    );

    const deleted = await call('DELETE', '/instances/bot/labels/1');
    expect(deleted.json().data).toEqual({ labelId: '1', deleted: true });
    expect(client.addLabel).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: '1', deleted: true }),
    );
  });

  it('attaches and detaches a chat label idempotently with PUT/DELETE', async () => {
    const attached = await call('PUT', `/instances/bot/chats/${C}/labels/1`);
    expect(attached.json().data).toEqual({ chatJid: CHAT, labelId: '1', attached: true });
    expect(client.addChatLabel).toHaveBeenCalledWith(CHAT, '1');

    const detached = await call('DELETE', `/instances/bot/chats/${C}/labels/1`);
    expect(detached.json().data.attached).toBe(false);
  });

  it('requires the chat when labelling a message', async () => {
    const missing = await call('PUT', '/instances/bot/messages/MSG-1/labels/1');
    expect(missing.statusCode).toBe(400);
    expect(client.addMessageLabel).not.toHaveBeenCalled();

    const ok = await call('PUT', `/instances/bot/messages/MSG-1/labels/1?chatJid=${C}`);
    expect(ok.statusCode).toBe(200);
    expect(client.addMessageLabel).toHaveBeenCalledWith(CHAT, 'MSG-1', '1');
  });

  it('returns the catalog cursor inside data', async () => {
    const res = await call('GET', '/instances/bot/catalog/products?limit=5');

    expect(res.json().data).toEqual({
      items: [{ id: 'p1', name: 'Kopi' }],
      total: 1,
      nextCursor: 'CUR',
    });
    expect(client.getCatalog).toHaveBeenCalledWith(undefined, 5, undefined);
  });

  it('creates and updates a product under catalog/', async () => {
    const body = { name: 'Kopi', description: 'arabika', price: 25000, currency: 'IDR' };

    const created = await call('POST', '/instances/bot/catalog/products', body);
    expect(created.statusCode).toBe(201);
    expect(created.json().data.productId).toBe('p1');

    const updated = await call('PATCH', '/instances/bot/catalog/products/p1', body);
    expect(updated.statusCode).toBe(200);
    expect(client.updateProduct).toHaveBeenCalledWith('p1', expect.objectContaining(body));
  });

  it('deletes one product as a batch of one', async () => {
    const res = await call('DELETE', '/instances/bot/catalog/products/p1');

    expect(res.json().data).toEqual({ productId: 'p1', deleted: true });
    expect(client.deleteProducts).toHaveBeenCalledWith(['p1']);
  });

  it('reports how many of a bulk deletion actually landed', async () => {
    const res = await call('POST', '/instances/bot/catalog/product-deletions', {
      productIds: ['p1', 'p2', 'p3'],
    });

    // Asked for three, WhatsApp dropped two. The count is the answer.
    expect(res.json().data).toEqual({ requested: 3, deletedCount: 2 });
  });

  it('lists collections', async () => {
    const res = await call('GET', '/instances/bot/catalog/collections');

    expect(res.json().data).toEqual({ items: [{ id: 'c1', name: 'Minuman' }], total: 1 });
  });

  it('surfaces soft failures as 400 and a down instance as 503', async () => {
    client.createProduct.mockResolvedValue({ success: false, error: 'catalog disabled' });
    const soft = await call('POST', '/instances/bot/catalog/products', {
      name: 'Kopi',
      description: 'arabika',
      price: 25000,
      currency: 'IDR',
    });
    expect(soft.statusCode).toBe(400);

    status = 'disconnected';
    expect((await call('GET', '/instances/bot/labels')).statusCode).toBe(503);
  });
});
