/**
 * Test Server Access
 *
 * The server itself is started once per run by ../global-setup.ts. These
 * helpers exist because most test files call startTestServer() in beforeAll;
 * they now just wait for the shared server rather than starting a second one,
 * which would fail with EADDRINUSE and, on teardown, close the server other
 * files are still using.
 */

import { HttpClient } from './http.js';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 3000);
const API_KEY = process.env.API_KEY ?? 'test-api-key-for-integration-tests';

export const BASE_URL = `http://${HOST}:${PORT}`;

/**
 * Resolve once the shared server answers. Kept async and awaited by callers so
 * a misconfigured run fails here with a clear message instead of as a pile of
 * "fetch failed" assertions.
 */
export async function startTestServer(timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      await fetch(`${BASE_URL}/health`);
      return;
    } catch (err) {
      if (Date.now() > deadline) {
        throw new Error(
          `No API server on ${BASE_URL} after ${timeoutMs}ms. ` +
            'It is started by test/integration/global-setup.ts.',
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

/**
 * A no-op: the shared server outlives every individual file and is closed by
 * the global teardown.
 */
export async function stopTestServer(): Promise<void> {
  // Intentionally empty.
}

export function createTestClient(): HttpClient {
  return new HttpClient(
    BASE_URL,
    {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    30000,
  );
}
