/**
 * Graceful shutdown handler
 *
 * Stops accepting new requests, then cleans up long-lived resources
 * (WhatsApp clients, webhook timers) before exiting. A watchdog forces
 * exit if cleanup hangs, and repeated signals are ignored.
 */

export interface ShutdownDeps {
  server: { close: () => Promise<void> };
  instanceManager: { dispose: () => Promise<void> };
  webhookDispatcher: { dispose: () => void };
  logger: { info: (obj: unknown, msg?: string) => void; error: (obj: unknown, msg?: string) => void };
  exit: (code: number) => void;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Build a shutdown function bound to the given dependencies.
 * The returned function is safe to register on multiple signals; only
 * the first invocation runs, subsequent ones are ignored.
 */
export function createShutdownHandler(deps: ShutdownDeps): (signal: string) => Promise<void> {
  let shuttingDown = false;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    deps.logger.info({ signal }, 'Graceful shutdown started');

    const watchdog = setTimeout(() => {
      deps.logger.error({ timeoutMs }, 'Shutdown timed out, forcing exit');
      deps.exit(1);
    }, timeoutMs);
    // Do not let the watchdog keep the process alive on its own.
    if (typeof (watchdog as { unref?: () => void }).unref === 'function') {
      (watchdog as { unref: () => void }).unref();
    }

    try {
      await deps.server.close();
      await deps.instanceManager.dispose();
      deps.webhookDispatcher.dispose();
      clearTimeout(watchdog);
      deps.logger.info({ signal }, 'Graceful shutdown complete');
      deps.exit(0);
    } catch (err) {
      clearTimeout(watchdog);
      deps.logger.error({ err }, 'Error during graceful shutdown');
      deps.exit(1);
    }
  };
}
