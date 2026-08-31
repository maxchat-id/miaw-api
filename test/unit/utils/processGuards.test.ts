/**
 * Unit tests for process-level guards
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { installUnhandledRejectionGuard } from '../../../src/utils/processGuards';

function makeDeps() {
  const target = new EventEmitter();
  const logger = { error: vi.fn() };
  return { target, logger };
}

describe('installUnhandledRejectionGuard', () => {
  it('logs the rejection instead of letting it go unhandled', () => {
    const deps = makeDeps();
    installUnhandledRejectionGuard(deps);

    deps.target.emit('unhandledRejection', new Error('boom'));

    expect(deps.logger.error).toHaveBeenCalledOnce();
    const [payload, msg] = deps.logger.error.mock.calls[0] as [
      { err: Record<string, unknown> },
      string,
    ];
    expect(payload.err.name).toBe('Error');
    expect(payload.err.message).toBe('boom');
    expect(payload.err.stack).toContain('boom');
    expect(msg).toContain('Unhandled promise rejection');
  });

  it('captures the undici cause detail that identifies the source', () => {
    const deps = makeDeps();
    installUnhandledRejectionGuard(deps);

    const cause = Object.assign(new Error('other side closed'), {
      code: 'UND_ERR_SOCKET',
      socket: { localPort: 55560, bytesRead: 101927 },
    });
    deps.target.emit('unhandledRejection', new TypeError('terminated', { cause }));

    const [payload] = deps.logger.error.mock.calls[0] as [{ err: Record<string, unknown> }];
    expect(payload.err.name).toBe('TypeError');
    expect(payload.err.cause).toMatchObject({
      message: 'other side closed',
      code: 'UND_ERR_SOCKET',
      socket: { localPort: 55560 },
    });
  });

  it('handles a non-Error rejection reason', () => {
    const deps = makeDeps();
    installUnhandledRejectionGuard(deps);

    deps.target.emit('unhandledRejection', 'plain string');

    const [payload] = deps.logger.error.mock.calls[0] as [{ err: Record<string, unknown> }];
    expect(payload.err).toEqual({ type: 'string', value: 'plain string' });
  });

  it('stops logging once uninstalled', () => {
    const deps = makeDeps();
    const uninstall = installUnhandledRejectionGuard(deps);

    uninstall();
    deps.target.emit('unhandledRejection', new Error('boom'));

    expect(deps.logger.error).not.toHaveBeenCalled();
    expect(deps.target.listenerCount('unhandledRejection')).toBe(0);
  });
});
