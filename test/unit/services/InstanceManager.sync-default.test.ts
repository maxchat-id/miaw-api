/**
 * Unit tests for the server-wide syncFullHistory default.
 *
 * The default comes from MIAW_SYNC_FULL_HISTORY and applies to instances that
 * did not pick a value themselves — including the ones the gateway provisions
 * through ensureInstance(), which is where the setting was previously
 * unreachable. An explicit per-instance value always wins, so a tenant can be
 * exempted without changing the deployment.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const coreMock = vi.hoisted(() => ({ options: [] as any[] }));

vi.mock('miaw-core', () => {
  class MiawClient {
    on = vi.fn().mockReturnThis();
    removeAllListeners = vi.fn();
    disconnect = vi.fn();
    connect = vi.fn().mockResolvedValue(undefined);
    constructor(opts: unknown) {
      coreMock.options.push(opts);
    }
  }
  return {
    MiawClient,
    validateProxyConfig: () => true,
    maskProxyUrl: (proxy: string) => proxy,
  };
});

import { InstanceManager } from '../../../src/services/InstanceManager';

let sessionPath: string;

function makeManager(defaultSyncFullHistory?: boolean): InstanceManager {
  return new InstanceManager({
    sessionPath,
    webhookSecret: 'test-secret',
    webhookTimeout: 1000,
    webhookMaxRetries: 3,
    defaultSyncFullHistory,
  });
}

describe('server-wide syncFullHistory default', () => {
  beforeEach(async () => {
    coreMock.options.length = 0;
    sessionPath = await fs.mkdtemp(path.join(os.tmpdir(), 'miaw-sync-default-'));
  });

  afterEach(async () => {
    await fs.rm(sessionPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  it('applies to an instance that did not choose a value', async () => {
    await makeManager(false).createInstance({ instanceId: 'bot' });

    expect(coreMock.options[0]).toMatchObject({ instanceId: 'bot', syncFullHistory: false });
  });

  it('is overridden by an explicit per-instance value', async () => {
    await makeManager(false).createInstance({
      instanceId: 'bot',
      clientOptions: { syncFullHistory: true },
    });

    expect(coreMock.options[0]).toMatchObject({ syncFullHistory: true });
  });

  it('is overridden when the instance explicitly opts out', async () => {
    await makeManager(true).createInstance({
      instanceId: 'bot',
      clientOptions: { syncFullHistory: false },
    });

    expect(coreMock.options[0]).toMatchObject({ syncFullHistory: false });
  });

  it('leaves syncFullHistory untouched when no default is configured', async () => {
    await makeManager(undefined).createInstance({ instanceId: 'bot' });

    expect(coreMock.options[0]).not.toHaveProperty('syncFullHistory');
  });

  it('applies to instances rebuilt by restore()', async () => {
    await fs.writeFile(
      path.join(sessionPath, 'instances.json'),
      JSON.stringify([{ instanceId: 'bot' }]),
    );

    await makeManager(false).restore();

    expect(coreMock.options).toHaveLength(1);
    expect(coreMock.options[0]).toMatchObject({ instanceId: 'bot', syncFullHistory: false });
  });
});
