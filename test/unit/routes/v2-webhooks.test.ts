/**
 * v2 webhooks: configuration is its own readable resource, a test is a queued
 * item rather than a blocking call, and the SSRF guard still runs on update.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { registerSchemas } from '../../../src/schemas/index.js';
import { errorHandler } from '../../../src/utils/errorHandler.js';
import { webhookRoutesV2 } from '../../../src/routes/v2/webhooks.js';

const PREFIX = '/api/v2';

const stateFor = (overrides: Record<string, unknown> = {}) => ({
  instanceId: 'bot',
  status: 'connected',
  webhookUrl: 'https://example.test/hook',
  webhookEvents: ['ready', 'message'],
  webhookEnabled: true,
  ...overrides,
});

describe('v2 webhooks', () => {
  let server: FastifyInstance;
  let manager: Record<string, ReturnType<typeof vi.fn>>;
  let dispatcher: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    manager = {
      getInstance: vi.fn(() => stateFor()),
      updateWebhook: vi.fn(() => stateFor({ webhookEvents: ['ready'] })),
    };
    dispatcher = {
      queue: vi.fn(async () => undefined),
      getStats: vi.fn(() => ({ delivered: 3, failed: 1, pending: 0 })),
    };

    server = Fastify({ logger: false });
    server.setErrorHandler(errorHandler);
    server.decorate('instanceManager', manager as any);
    server.decorate('webhookDispatcher', dispatcher as any);
    registerSchemas(server);
    await server.register(webhookRoutesV2, { prefix: PREFIX });
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

  it('exposes the configuration as a readable resource', async () => {
    const res = await call('GET', '/instances/bot/webhook');

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      webhookUrl: 'https://example.test/hook',
      webhookEvents: ['ready', 'message'],
      webhookEnabled: true,
    });
  });

  it('updates the configuration in place', async () => {
    const res = await call('PATCH', '/instances/bot/webhook', { webhookEvents: ['ready'] });

    expect(res.statusCode).toBe(200);
    expect(manager.updateWebhook).toHaveBeenCalledWith('bot', { webhookEvents: ['ready'] });
  });

  it('keeps the SSRF guard on the update path', async () => {
    const res = await call('PATCH', '/instances/bot/webhook', {
      webhookUrl: 'http://169.254.169.254/latest/meta-data',
    });

    expect(res.statusCode).toBe(400);
    expect(manager.updateWebhook).not.toHaveBeenCalled();
  });

  it('reports delivery stats', async () => {
    const res = await call('GET', '/instances/bot/webhook/stats');

    expect(res.json().data).toMatchObject({
      instanceId: 'bot',
      webhookUrl: 'https://example.test/hook',
      stats: { delivered: 3, failed: 1, pending: 0 },
    });
  });

  it('queues a test without blocking on delivery', async () => {
    const started = Date.now();
    const res = await call('POST', '/instances/bot/webhook-tests', { event: 'ready' });

    expect(res.statusCode).toBe(202);
    expect(res.json().data.queued).toBe(true);
    expect(dispatcher.queue).toHaveBeenCalledWith(
      'https://example.test/hook',
      expect.objectContaining({ event: 'ready', instanceId: 'bot' }),
    );
    // v1 slept 2s inside the handler; this must return promptly.
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('rejects a test when no webhook URL is configured', async () => {
    manager.getInstance.mockReturnValue(stateFor({ webhookUrl: undefined }));

    const res = await call('POST', '/instances/bot/webhook-tests', {});

    expect(res.statusCode).toBe(400);
    expect(dispatcher.queue).not.toHaveBeenCalled();
  });

  it('404s an unknown instance on every route', async () => {
    manager.getInstance.mockReturnValue(null);

    expect((await call('GET', '/instances/nope/webhook')).statusCode).toBe(404);
    expect((await call('GET', '/instances/nope/webhook/stats')).statusCode).toBe(404);
    expect((await call('POST', '/instances/nope/webhook-tests', {})).statusCode).toBe(404);
  });
});
