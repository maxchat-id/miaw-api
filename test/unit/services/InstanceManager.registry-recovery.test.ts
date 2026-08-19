/**
 * Unit tests for instance registry recovery.
 *
 * `restore()` used to wrap the read and the parse in one `try { } catch { return }`,
 * so a malformed registry was indistinguishable from "no registry yet". On
 * staging 2026-08-19 that turned a corrupt file into a silent start with zero
 * instances — and the next persist() would have overwritten what was left.
 *
 * A missing file is still a normal first boot. A malformed one must be loud,
 * must try the backup, and must never be quietly replaced by an empty registry.
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

const registryPath = () => path.join(sessionPath, 'instances.json');
const backupPath = () => path.join(sessionPath, 'instances.json.bak');

/** The exact shape seen on staging: a shorter write left over a longer one. */
const MALFORMED = '[\n  {\n    "instanceId": "bot"\n  }\n]  {\n    "instanceId": "ghost"\n  }\n]\n';

describe('instance registry recovery', () => {
  beforeEach(async () => {
    coreMock.options.length = 0;
    sessionPath = await fs.mkdtemp(path.join(os.tmpdir(), 'miaw-registry-recovery-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // restore() leaves background connects/persists in flight, which can
    // recreate files mid-teardown; retry rather than fail on ENOTEMPTY.
    await fs.rm(sessionPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  it('writes a backup alongside the registry', async () => {
    const manager = makeManager();
    await manager.createInstance({ instanceId: 'bot' });

    const backup = await vi.waitFor(async () =>
      JSON.parse(await fs.readFile(backupPath(), 'utf8')),
    );

    expect(backup).toEqual(JSON.parse(await fs.readFile(registryPath(), 'utf8')));
  });

  it('treats a missing registry as a normal first boot', async () => {
    const manager = makeManager();

    await expect(manager.restore()).resolves.toBeUndefined();
    expect(coreMock.options).toHaveLength(0);
  });

  it('recovers the instances from the backup when the registry is malformed', async () => {
    await fs.writeFile(
      backupPath(),
      JSON.stringify([{ instanceId: 'bot', clientOptions: { syncFullHistory: false } }]),
    );
    await fs.writeFile(registryPath(), MALFORMED);

    await makeManager().restore();

    expect(coreMock.options).toHaveLength(1);
    expect(coreMock.options[0]).toMatchObject({ instanceId: 'bot', syncFullHistory: false });
  });

  it('refuses to start with an empty registry when the file is malformed and no backup exists', async () => {
    await fs.writeFile(registryPath(), MALFORMED);

    await expect(makeManager().restore()).rejects.toThrow();
    expect(coreMock.options).toHaveLength(0);
  });

  it('leaves the malformed registry on disk instead of overwriting it', async () => {
    await fs.writeFile(registryPath(), MALFORMED);

    await makeManager()
      .restore()
      .catch(() => undefined);

    expect(await fs.readFile(registryPath(), 'utf8')).toBe(MALFORMED);
  });
});
