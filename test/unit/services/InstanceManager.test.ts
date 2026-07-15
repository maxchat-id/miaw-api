/**
 * Unit tests for InstanceManager service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock miaw-core so createInstance does not spin up a real WhatsApp client
vi.mock('miaw-core', () => {
  class MiawClient {
    on = vi.fn();
    removeAllListeners = vi.fn();
    disconnect = vi.fn();
    constructor(_opts: unknown) {}
  }
  return { MiawClient };
});

import { InstanceManager } from '../../../src/services/InstanceManager';

describe('InstanceManager.updateWebhook', () => {
  let manager: InstanceManager;

  beforeEach(() => {
    manager = new InstanceManager({
      sessionPath: './sessions',
      webhookSecret: 'test-secret',
      webhookTimeout: 1000,
      webhookMaxRetries: 3,
      webhookRetryDelay: 1000,
    });
  });

  it('updates webhookUrl and recomputes webhookEnabled', async () => {
    await manager.createInstance({ instanceId: 'bot' });

    const state = manager.updateWebhook('bot', {
      webhookUrl: 'https://example.test/hook',
    });

    expect(state.webhookUrl).toBe('https://example.test/hook');
    expect(state.webhookEnabled).toBe(true);
  });

  it('updates webhookEvents without touching webhookUrl', async () => {
    await manager.createInstance({
      instanceId: 'bot',
      webhookUrl: 'https://example.test/hook',
    });

    const state = manager.updateWebhook('bot', {
      webhookEvents: ['message', 'qr'],
    });

    expect(state.webhookEvents).toEqual(['message', 'qr']);
    expect(state.webhookUrl).toBe('https://example.test/hook');
    expect(state.webhookEnabled).toBe(true);
  });

  it('clears the webhook when webhookUrl is null', async () => {
    await manager.createInstance({
      instanceId: 'bot',
      webhookUrl: 'https://example.test/hook',
    });

    const state = manager.updateWebhook('bot', { webhookUrl: null });

    expect(state.webhookUrl).toBeUndefined();
    expect(state.webhookEnabled).toBe(false);
  });

  it('leaves fields unchanged when not provided', async () => {
    await manager.createInstance({
      instanceId: 'bot',
      webhookUrl: 'https://example.test/hook',
      webhookEvents: ['message'],
    });

    const state = manager.updateWebhook('bot', {});

    expect(state.webhookUrl).toBe('https://example.test/hook');
    expect(state.webhookEvents).toEqual(['message']);
  });

  it('throws when the instance does not exist', () => {
    expect(() => manager.updateWebhook('missing', { webhookUrl: 'https://x.test' })).toThrow(
      'not found',
    );
  });
});

describe('InstanceManager QR caching (C4/C5)', () => {
  const handlerFor = (client: unknown, event: string) => {
    const on = (client as { on: { mock: { calls: [string, (arg?: unknown) => void][] } } }).on;
    const call = on.mock.calls.find(([e]) => e === event);
    if (!call) throw new Error(`no handler for ${event}`);
    return call[1];
  };

  it('caches lastQr on the qr event and clears it on connect', async () => {
    const manager = new InstanceManager({
      sessionPath: './sessions',
      webhookSecret: 'test-secret',
      webhookTimeout: 1000,
      webhookMaxRetries: 3,
      webhookRetryDelay: 1000,
    });
    await manager.createInstance({ instanceId: 'bot' });
    const client = manager.getClient('bot');

    handlerFor(client, 'qr')('QR-STRING');
    expect(manager.getInstance('bot')?.lastQr).toBe('QR-STRING');
    expect(manager.getInstance('bot')?.status).toBe('qr_required');

    handlerFor(client, 'connection')('connected');
    expect(manager.getInstance('bot')?.lastQr).toBeUndefined();
    expect(manager.getInstance('bot')?.status).toBe('connected');
  });
});
