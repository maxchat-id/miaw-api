/**
 * Integration test environment.
 *
 * Test files read process.env directly for the API key and port. globalSetup
 * runs in the main vitest process, so the env it sets does not reach the
 * workers where tests execute — these have to be set again here.
 *
 * The server's own config comes from globalSetup, not from this file.
 */

process.env.PORT = process.env.PORT ?? '3000';
process.env.HOST = process.env.HOST ?? '127.0.0.1';
process.env.API_KEY = 'test-api-key-for-integration-tests';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.SESSION_PATH = './test-sessions';
process.env.LOG_LEVEL = 'error';
process.env.WEBHOOK_SSRF_ALLOWLIST = '127.0.0.1';
