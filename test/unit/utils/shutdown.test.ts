/**
 * Unit tests for graceful shutdown handler
 */

import { describe, it, expect, vi } from 'vitest';
import { createShutdownHandler } from '../../../src/utils/shutdown';

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    server: { close: vi.fn().mockResolvedValue(undefined) },
    instanceManager: { dispose: vi.fn().mockResolvedValue(undefined) },
    webhookDispatcher: { dispose: vi.fn() },
    logger: { info: vi.fn(), error: vi.fn() },
    exit: vi.fn(),
    timeoutMs: 1000,
    ...overrides,
  };
}

describe('createShutdownHandler', () => {
  it('closes server, disposes services in order, then exits 0', async () => {
    const deps = makeDeps();
    const shutdown = createShutdownHandler(deps as never);

    await shutdown('SIGTERM');

    expect(deps.server.close).toHaveBeenCalledOnce();
    expect(deps.instanceManager.dispose).toHaveBeenCalledOnce();
    expect(deps.webhookDispatcher.dispose).toHaveBeenCalledOnce();
    expect(deps.exit).toHaveBeenCalledWith(0);

    const closeOrder = deps.server.close.mock.invocationCallOrder[0];
    const instOrder = deps.instanceManager.dispose.mock.invocationCallOrder[0];
    const webhookOrder = deps.webhookDispatcher.dispose.mock.invocationCallOrder[0];
    expect(closeOrder).toBeLessThan(instOrder);
    expect(instOrder).toBeLessThan(webhookOrder);
  });

  it('ignores a second signal (idempotent)', async () => {
    const deps = makeDeps();
    const shutdown = createShutdownHandler(deps as never);

    await shutdown('SIGTERM');
    await shutdown('SIGINT');

    expect(deps.server.close).toHaveBeenCalledOnce();
    expect(deps.exit).toHaveBeenCalledOnce();
  });

  it('exits 1 when cleanup throws', async () => {
    const deps = makeDeps({
      instanceManager: { dispose: vi.fn().mockRejectedValue(new Error('boom')) },
    });
    const shutdown = createShutdownHandler(deps as never);

    await shutdown('SIGTERM');

    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it('force-exits 1 when cleanup hangs past the timeout', async () => {
    vi.useFakeTimers();
    const deps = makeDeps({
      server: { close: vi.fn().mockReturnValue(new Promise(() => {})) },
      timeoutMs: 5000,
    });
    const shutdown = createShutdownHandler(deps as never);

    void shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(5000);

    expect(deps.exit).toHaveBeenCalledWith(1);
    vi.useRealTimers();
  });
});
