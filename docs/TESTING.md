# Miaw API - Testing Guide

This guide covers testing the Miaw API, including unit tests and integration tests.

## Table of Contents

1. [Test Overview](#test-overview)
2. [Prerequisites](#prerequisites)
3. [Unit Tests](#unit-tests)
4. [Integration Tests](#integration-tests)
5. [Test Data](#test-data)
6. [Troubleshooting](#troubleshooting)

---

## Test Overview

Miaw API uses **Vitest** as the testing framework.

| Test Type | Location | Purpose | Requirements |
|-----------|----------|---------|--------------|
| Unit Tests | `test/unit/` | Test individual functions/classes in isolation | No external dependencies |
| Integration Tests | `test/integration/` | Test full API with real WhatsApp connection | Requires WhatsApp pairing |

---

## Prerequisites

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **For integration tests only:**
   - Dedicated WhatsApp test number
   - Test contacts with WhatsApp accounts
   - `.env.test` configured (see [Test Data](#test-data))

---

## Unit Tests

Unit tests test individual components in isolation without external dependencies.

### Running Unit Tests

```bash
# Run all unit tests
npm run test:unit

# Run in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### Writing Unit Tests

```typescript
import { describe, it, expect } from '@jest/globals';

describe('MyComponent', () => {
  it('should do something', () => {
    const result = myFunction();
    expect(result).toBe('expected');
  });
});
```

---

## Integration Tests

Integration tests test the full API stack with real WhatsApp connection.

### First-Time Setup

1. **Create test environment file:**
   ```bash
   cp .env.example .env.test
   ```

2. **Edit `.env.test`:**
   ```bash
   API_KEY=test-api-key-for-integration-tests
   WEBHOOK_SECRET=test-webhook-secret
   TEST_CONTACT_A=6281234567890  # Replace with real number
   TEST_CONTACT_B=6280987654321  # Replace with real number
   ```

3. **Run setup test (pair via QR):**
   ```bash
   npm run test:integration -- setup
   ```

   This will:
   - Start the API server on port 3000
   - Create a test instance
   - Generate QR code
   - Wait for you to scan with WhatsApp
   - Save session for future tests

### Running Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific test file
npm run test:integration -- instance
npm run test:integration -- connection
npm run test:integration -- messaging

# Run with verbose output
npm run test:integration -- --reporter=verbose
```

### Test Files

| File | Tests | Description | WhatsApp Required |
|------|-------|-------------|-------------------|
| `setup.test.ts` | 4 | Initial QR pairing and connection | Yes (manual) |
| `instance-management.test.ts` | 15 | Create, list, get, delete instances | No |
| `connection.test.ts` | 10 | Connect, disconnect, restart, status | Optional |
| `messaging.test.ts` | 8 | Send text messages | Yes |
| `messaging-phase2.test.ts` | 35 | Media, edit, delete, reaction, forward | Yes |
| `contacts.test.ts` | 12 | Number validation, contact info | Yes |
| `groups.test.ts` | 25 | Create, manage groups, participants | Yes |
| `profile.test.ts` | 8 | Update profile picture, name, status | Yes |
| `presence.test.ts` | 33 | Presence, typing, read receipts, subscribe | Yes |
| `webhooks.test.ts` | 26 | Webhook config, delivery, signature, retry | Yes |
| `business.test.ts` | 27 | Labels, products, newsletters (Business only) | Yes |
| `basic-gets.test.ts` | 12 | Basic GET operations (contacts, groups, profile, labels, chats, messages) | Yes |

### Skipping Connection-Required Tests

Tests that require WhatsApp connection are marked with `it.skip()`. These will be skipped automatically unless:

1. Instance is connected (check via `GET /instances/:id/status`)
2. Test contacts are configured

---

## Test Data

### Environment Variables (.env.test)

```bash
# API Configuration
PORT=3000
HOST=127.0.0.1
API_KEY=test-api-key-for-integration-tests
WEBHOOK_SECRET=test-webhook-secret

# Test Instance
TEST_INSTANCE_ID=integration-test-bot
TEST_SESSION_PATH=./test-sessions

# Test Contacts (REAL WhatsApp numbers)
TEST_CONTACT_A=6281234567890
TEST_CONTACT_B=6280987654321
TEST_GROUP_JID=123456789@g.us
TEST_GROUP_INVITE=ABC123Def456

# Timeouts
TEST_CONNECT_TIMEOUT=120000
TEST_MESSAGE_TIMEOUT=30000
TEST_WEBHOOK_TIMEOUT=5000

# Test Webhook Server
TEST_WEBHOOK_PORT=3001
```

### Test Contacts

**Required:**
- **Contact A**: Standard WhatsApp user (for messaging tests)
- **Contact B**: Standard WhatsApp user (for group tests)

Both contacts should have added the test number.

---

## Troubleshooting

### Common Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| QR timeout | Setup test fails at QR step | Scan QR faster (< 30 sec) |
| Session expired | Auth errors in tests | Delete `./test-sessions/` and re-run setup |
| Webhook not received | Test fails waiting for event | Check webhook server is running |
| Rate limited | Messages fail with 429 | Add delays, wait before retry |
| Port already in use | Server fails to start | Kill process on port 3000 |

### Session Management

**Session location:** `./test-sessions/`

**Refresh session:**
```bash
# Delete old session
rm -rf ./test-sessions/

# Re-run setup
npm run test:integration -- setup
```

**Check session status:**
```bash
# Get instance status
curl http://localhost:3000/instances/integration-test-bot/status \
  -H "Authorization: Bearer test-api-key-for-integration-tests"
```

### Manual API Testing

```bash
# Health check
curl http://localhost:3000/health

# Create instance
curl -X POST http://localhost:3000/instances \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-api-key-for-integration-tests" \
  -d '{"instanceId": "test-bot"}'

# List instances
curl http://localhost:3000/instances \
  -H "Authorization: Bearer test-api-key-for-integration-tests"

# Connect instance
curl -X POST http://localhost:3000/instances/test-bot/connect \
  -H "Authorization: Bearer test-api-key-for-integration-tests"
```

---

## CI/CD Considerations

Integration tests are **NOT suitable** for automated CI/CD pipelines:

- Requires manual QR scanning
- Requires real WhatsApp connection
- Tests may fail due to network issues
- Rate limiting from WhatsApp
- Session expiration

**Recommended approach:**
1. Run unit tests in CI/CD (fast, no dependencies)
2. Run integration tests locally before releases
3. Run integration tests in staging with manual pairing

---

## Best Practices

1. **Before running tests:**
   - Ensure test contacts are available
   - Verify network connection
   - Check test instance is connected

2. **During tests:**
   - Don't use the test phone for other activities
   - Let tests complete fully
   - Monitor webhook server logs

3. **After tests:**
   - Review test results
   - Clean up test groups if needed
   - Update test documentation

4. **Maintenance:**
   - Rotate test contacts periodically
   - Re-pair if session expires (monthly)
   - Update test data if contacts change

---

## Appendix: Test Checklist

### Pre-Test

- [ ] Dependencies installed (`npm install`)
- [ ] Project built (`npm run build`)
- [ ] Test contacts have added test number
- [ ] `.env.test` configured
- [ ] Network connection stable

### Post-Test

- [ ] All tests passed
- [ ] Test contacts not spammed
- [ ] Test groups cleaned up
- [ ] Session saved for next run
- [ ] Failures investigated

---

**Last Updated:** 2025-12-25
**Version:** 0.8.0
