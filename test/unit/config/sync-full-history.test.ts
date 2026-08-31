/**
 * Unit tests for the MIAW_SYNC_FULL_HISTORY default.
 *
 * `syncFullHistory` is accepted per instance at creation time only, so every
 * instance the gateway provisions is born with miaw-core's default (full sync
 * on) unless someone remembers to edit the registry. On staging that cost
 * 17m38s of dead HTTP per first connect. This env var sets the default for
 * every instance; an explicit per-instance value still wins.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const originalEnv = { ...process.env };

describe('MIAW_SYNC_FULL_HISTORY', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MIAW_SYNC_FULL_HISTORY;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('is undefined when unset, leaving the core default in place', async () => {
    const { config } = await import('../../../src/config');

    expect(config.defaultSyncFullHistory).toBeUndefined();
  });

  it('reads "false" as false', async () => {
    process.env.MIAW_SYNC_FULL_HISTORY = 'false';

    const { config } = await import('../../../src/config');

    expect(config.defaultSyncFullHistory).toBe(false);
  });

  it('reads "true" as true', async () => {
    process.env.MIAW_SYNC_FULL_HISTORY = 'true';

    const { config } = await import('../../../src/config');

    expect(config.defaultSyncFullHistory).toBe(true);
  });

  it('ignores surrounding whitespace and casing', async () => {
    process.env.MIAW_SYNC_FULL_HISTORY = '  FALSE  ';

    const { config } = await import('../../../src/config');

    expect(config.defaultSyncFullHistory).toBe(false);
  });

  it('rejects a value that is neither true nor false', async () => {
    process.env.MIAW_SYNC_FULL_HISTORY = 'off';

    await expect(import('../../../src/config')).rejects.toThrow(/MIAW_SYNC_FULL_HISTORY/);
  });
});
