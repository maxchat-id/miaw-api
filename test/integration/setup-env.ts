/**
 * Integration test environment.
 *
 * `src/config` reads process.env at module load, and the server module graph is
 * imported before any hook in a test file runs. Setting these inside
 * startTestServer() would therefore be too late — the config would already hold
 * the defaults, and every authenticated request would 401. Vitest runs
 * setupFiles before it imports the test module, which is early enough.
 */

import { rmSync } from 'node:fs';

process.env.PORT = process.env.PORT ?? '3000';
process.env.HOST = process.env.HOST ?? '127.0.0.1';
process.env.API_KEY = 'test-api-key-for-integration-tests';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.SESSION_PATH = './test-sessions';
process.env.LOG_LEVEL = 'error';

// Instances are persisted to a registry and restored on server start, so
// leftovers from an earlier run would reconnect to WhatsApp and flood the
// output with QR events. The path is fixed to the value set above so this can
// only ever remove the test scratch directory.
rmSync(process.env.SESSION_PATH, { recursive: true, force: true });
