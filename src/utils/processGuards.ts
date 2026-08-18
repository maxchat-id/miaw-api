/**
 * Process-level guards
 *
 * Node exits on an unhandled promise rejection. In this process a single
 * dropped socket in a background fetch (Baileys' media download path emits
 * `TypeError: terminated` / `UND_ERR_SOCKET` with no application frames) is
 * therefore enough to kill every WhatsApp session at once. The guard logs the
 * rejection with enough detail to identify its source and keeps the process
 * alive.
 */

export interface RejectionGuardDeps {
  logger: {
    error: (obj: unknown, msg?: string) => void;
  };
  /** Injectable for tests; defaults to the real process. */
  target?: Pick<NodeJS.EventEmitter, 'on' | 'off'>;
}

/**
 * Flatten a rejection reason into something a pino logger can render.
 *
 * The interesting detail for these rejections lives on `cause` (undici's
 * `code` and its `socket` fields), which is not part of a stack trace.
 */
function describeReason(reason: unknown): Record<string, unknown> {
  if (!(reason instanceof Error)) {
    return { type: typeof reason, value: String(reason) };
  }

  const described: Record<string, unknown> = {
    name: reason.name,
    message: reason.message,
    code: (reason as { code?: unknown }).code,
    stack: reason.stack,
  };

  const cause = (reason as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    described.cause = {
      name: cause.name,
      message: cause.message,
      code: (cause as { code?: unknown }).code,
      socket: (cause as { socket?: unknown }).socket,
      stack: cause.stack,
    };
  } else if (cause !== undefined) {
    described.cause = { type: typeof cause, value: String(cause) };
  }

  return described;
}

/**
 * Register an `unhandledRejection` listener that logs instead of exiting.
 * Returns an uninstall function so the listener can be released on close.
 */
export function installUnhandledRejectionGuard(deps: RejectionGuardDeps): () => void {
  const target = deps.target ?? process;

  const onUnhandledRejection = (reason: unknown): void => {
    deps.logger.error(
      { err: describeReason(reason) },
      'Unhandled promise rejection — process kept alive',
    );
  };

  target.on('unhandledRejection', onUnhandledRejection);

  return () => {
    target.off('unhandledRejection', onUnhandledRejection);
  };
}
