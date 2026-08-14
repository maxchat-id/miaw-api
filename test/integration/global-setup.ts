/**
 * One API server for the whole integration run.
 *
 * The suite is split between files that start the server themselves through
 * helpers/server.ts and files that simply fetch http://127.0.0.1:3000 and
 * assume something is listening. Per-file lifecycles cannot satisfy both: the
 * first file to finish would close the server out from under the rest.
 *
 * Starting it here instead means every file sees a live server, and the ones
 * calling startTestServer() find the port already served and leave it alone.
 */

import { rmSync } from 'node:fs';

const HOST = '127.0.0.1';
const PORT = 3000;

export default async function setup() {
  process.env.PORT = String(PORT);
  process.env.HOST = HOST;
  process.env.API_KEY = 'test-api-key-for-integration-tests';
  process.env.WEBHOOK_SECRET = 'test-webhook-secret';
  process.env.SESSION_PATH = './test-sessions';
  process.env.LOG_LEVEL = 'error';

  // The webhook test servers (helpers/webhook.ts, ports 3001 and 3002) listen on loopback, which the
  // SSRF guard blocks by default. Allowlisting those two host:ports is exactly
  // what the setting exists for and keeps the guard active everywhere else.
  process.env.WEBHOOK_SSRF_ALLOWLIST = '127.0.0.1:3001,127.0.0.1:3002';

  // Instances are persisted to a registry and restored on start, so leftovers
  // from an earlier run would reconnect to WhatsApp and flood the output.
  rmSync(process.env.SESSION_PATH, { recursive: true, force: true });

  // Imported after the env is set: src/config reads process.env at module load.
  const { createServer } = await import('../../src/server.js');
  const server = await createServer();
  await server.listen({ host: HOST, port: PORT });

  return async () => {
    await server.close();
  };
}
