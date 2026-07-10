/**
 * Test Data Constants
 */

export const TEST_CONFIG = {
  API_URL: 'http://127.0.0.1:3000',
  API_KEY: 'test-api-key-for-integration-tests',
  INSTANCE_ID: 'integration-test-bot',
  SESSION_PATH: './test-sessions',
  WEBHOOK_SECRET: 'test-webhook-secret',

  // Test contacts (replace with real numbers for testing)
  TEST_CONTACT_A: '6281234567890',
  TEST_CONTACT_B: '6280987654321',

  // Test group (optional - for group management tests)
  TEST_GROUP_JID: '', // e.g., '123456789@g.us'
  TEST_GROUP_INVITE: '', // e.g., 'ABC123Def456' (invite code)

  // Timeouts
  CONNECT_TIMEOUT: 120000,
  MESSAGE_TIMEOUT: 30000,
  WEBHOOK_TIMEOUT: 5000,
} as const;

export const VALID_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TEST_CONFIG.API_KEY}`,
};

export const INVALID_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer invalid-key',
};
