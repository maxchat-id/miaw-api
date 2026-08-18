/**
 * Unit tests for instance registry persistence
 *
 * clientOptions must survive a restart: without them a restored instance falls
 * back to miaw-core defaults (syncFullHistory defaults to true), so anything
 * set at provisioning time is silently lost on the first restart.
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

function makeManager(): InstanceManager {
  return new InstanceManager({
    sessionPath,
    webhookSecret: 'test-secret',
    webhookTimeout: 1000,
    webhookMaxRetries: 3,
    webhookRetryDelay: 1000,
  });
}

async function readRegistry(): Promise<any[]> {
  return JSON.parse(await fs.readFile(path.join(sessionPath, 'instances.json'), 'utf8'));
}

describe('instance registry persistence', () => {
  beforeEach(async () => {
    coreMock.options.length = 0;
    sessionPath = await fs.mkdtemp(path.join(os.tmpdir(), 'miaw-registry-'));
  });

  afterEach(async () => {
    await fs.rm(sessionPath, { recursive: true, force: true });
  });

  it('persists clientOptions so they survive a restart', async () => {
    const manager = makeManager();
    await manager.createInstance({
      instanceId: 'bot',
      clientOptions: { syncFullHistory: false, autoReconnect: false },
    });

    const registry = await vi.waitFor(readRegistry);

    expect(registry[0].clientOptions).toEqual({
      syncFullHistory: false,
      autoReconnect: false,
    });
  });

  it('omits proxy from the registry file', async () => {
    const manager = makeManager();
    await manager.createInstance({
      instanceId: 'bot',
      clientOptions: {
        syncFullHistory: false,
        proxy: 'http://user:hunter2@proxy.test:8080',
      },
    });

    const registry = await vi.waitFor(readRegistry);

    expect(registry[0].clientOptions).toEqual({ syncFullHistory: false });
    expect(JSON.stringify(registry)).not.toContain('hunter2');
  });

  it('leaves clientOptions undefined when the instance set none', async () => {
    const manager = makeManager();
    await manager.createInstance({ instanceId: 'bot' });

    const registry = await vi.waitFor(readRegistry);

    expect(registry[0].clientOptions).toBeUndefined();
  });

  it('restores the persisted clientOptions onto the rebuilt client', async () => {
    const manager = makeManager();
    await manager.createInstance({
      instanceId: 'bot',
      clientOptions: { syncFullHistory: false },
    });
    await vi.waitFor(readRegistry);

    coreMock.options.length = 0;
    await makeManager().restore();

    expect(coreMock.options).toHaveLength(1);
    expect(coreMock.options[0]).toMatchObject({
      instanceId: 'bot',
      syncFullHistory: false,
    });
  });

  it('rebuilds with core defaults when nothing was persisted (regression guard)', async () => {
    await fs.writeFile(
      path.join(sessionPath, 'instances.json'),
      JSON.stringify([{ instanceId: 'bot', webhookEnabled: false }]),
    );

    await makeManager().restore();

    // No syncFullHistory key at all — miaw-core then defaults it to true.
    expect(coreMock.options[0].syncFullHistory).toBeUndefined();
  });
});
