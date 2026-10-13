/**
 * Unit tests for instance registry durability.
 *
 * Seen in production on 2026-08-19: a 439-byte registry landed on top of a
 * 711-byte one without truncating it, leaving `]  {` mid-file. The file then
 * failed to parse, and `restore()` treated the parse error as "no registry yet"
 * and started with zero instances — silently.
 *
 * `persist()` is invoked as `void this.persist()` from three call sites, so two
 * writes can be in flight at once. Each `fs.writeFile` opens its own descriptor
 * with O_TRUNC: if B truncates while A is still writing, A's tail survives past
 * B's shorter content and the file is left malformed. The tests below force
 * that interleaving deterministically by splitting each write in two.
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
  });
}

const registryPath = () => path.join(sessionPath, 'instances.json');

async function readRegistry(): Promise<any[]> {
  return JSON.parse(await fs.readFile(registryPath(), 'utf8'));
}

/**
 * Replace writeFile with a version that truncates, writes half, yields, then
 * writes the rest — the shape of a real large write that the event loop can
 * interleave. Serialised writers stay correct under this; unserialised ones
 * corrupt the file.
 */
function splitEveryWriteInTwo(): void {
  vi.spyOn(fs, 'writeFile').mockImplementation((async (file: any, data: any) => {
    const text = String(data);
    const handle = await fs.open(file, 'w');
    try {
      const half = Math.ceil(text.length / 2);
      await handle.write(text.slice(0, half), 0, 'utf8');
      await new Promise((resolve) => setTimeout(resolve, 5));
      await handle.write(text.slice(half), half, 'utf8');
    } finally {
      await handle.close();
    }
  }) as any);
}

describe('instance registry durability', () => {
  beforeEach(async () => {
    coreMock.options.length = 0;
    sessionPath = await fs.mkdtemp(path.join(os.tmpdir(), 'miaw-registry-durability-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // restore() leaves background connects/persists in flight, which can
    // recreate files mid-teardown; retry rather than fail on ENOTEMPTY.
    await fs.rm(sessionPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  it('stays parseable when two writes overlap', async () => {
    const manager = makeManager();
    // A long first entry, so a shorter follow-up write cannot fully cover it.
    await manager.createInstance({
      instanceId: 'instance-with-a-deliberately-long-identifier-0000000000',
      webhookUrl: 'https://gateway.example.test/service/miaw/long-identifier-0000000000',
    });
    await vi.waitFor(readRegistry);

    splitEveryWriteInTwo();

    await Promise.all([
      manager.createInstance({ instanceId: 'b' }),
      manager.createInstance({ instanceId: 'c' }),
    ]);

    const registry = await vi.waitFor(async () => {
      const current = await readRegistry();
      expect(current).toHaveLength(3);
      return current;
    });

    expect(registry.map((e) => e.instanceId)).toContain('b');
    expect(registry.map((e) => e.instanceId)).toContain('c');
  });

  it('never exposes a half-written registry to a concurrent reader', async () => {
    const manager = makeManager();
    await manager.createInstance({ instanceId: 'seed-instance-with-a-long-name-000000' });
    await vi.waitFor(readRegistry);

    splitEveryWriteInTwo();

    const failures: string[] = [];
    let reading = true;
    const reader = (async () => {
      while (reading) {
        try {
          JSON.parse(await fs.readFile(registryPath(), 'utf8'));
        } catch (err: any) {
          if (err?.code !== 'ENOENT') {
            failures.push(String(err?.message ?? err));
          }
        }
        await new Promise((resolve) => setImmediate(resolve));
      }
    })();

    await Promise.all(
      Array.from({ length: 6 }, (_, i) => manager.createInstance({ instanceId: `bot-${i}` })),
    );
    await vi.waitFor(async () => {
      const current = await readRegistry();
      expect(current).toHaveLength(7);
    });
    reading = false;
    await reader;

    expect(failures).toEqual([]);
  });

  it('leaves no temporary file behind after writing', async () => {
    const manager = makeManager();
    await manager.createInstance({ instanceId: 'bot' });
    await vi.waitFor(readRegistry);

    const leftovers = (await fs.readdir(sessionPath)).filter((f) => f.includes('.tmp'));

    expect(leftovers).toEqual([]);
  });
});
