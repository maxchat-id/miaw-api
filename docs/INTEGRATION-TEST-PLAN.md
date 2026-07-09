# Miaw API - Integration Test Plan

**Version:** 1.0.0
**Date:** 2025-12-25
**Type:** Real WhatsApp Integration Testing

---

## Table of Contents

1. [Test Strategy](#1-test-strategy)
2. [Test Environment Setup](#2-test-environment-setup)
3. [Test Infrastructure](#3-test-infrastructure)
4. [Test Categories](#4-test-categories)
5. [Test Execution](#5-test-execution)
6. [Notes & Limitations](#6-notes--limitations)
7. [Test Maintenance](#7-test-maintenance)

---

## 1. Test Strategy

### 1.1 Approach

**Integration Level:** Full stack with real WhatsApp connection

| Component | Testing Method | Reason |
|-----------|----------------|--------|
| HTTP Client | Real HTTP calls (fetch) | Tests actual API contract |
| Fastify Server | Real server on test port | Tests real routing & middleware |
| MiawClient Instances | **Real instances, WhatsApp connected** | Tests actual miaw-core integration |
| Baileys Socket | **Real connection (paired via QR)** | Tests end-to-end functionality |
| Webhook Consumer | Test HTTP server | Verifies webhook delivery |

### 1.2 What We Test

| Layer | Coverage |
|-------|----------|
| HTTP Protocol | Request/response formats, status codes, headers |
| Authentication | API key validation (missing, invalid) |
| Input Validation | All request body validations, error messages |
| Instance Lifecycle | Create, connect, disconnect, delete, restart |
| Message Operations | Send/receive all message types to real WhatsApp |
| Contact Operations | Number validation, contact info retrieval |
| Group Operations | Create, manage, invite, leave groups |
| Webhook Delivery | Event firing, payload format, retry logic |

### 1.3 Test Data Requirements

**Real WhatsApp Connection Required:**
- Test phone number (dedicated, not personal)
- At least 2 test contacts (with WhatsApp)
- Test group (pre-created with contacts)
- Business account (optional, for business features)

**Why Real Connection?**
- Miaw-core behavior differs with real vs mocked socket
- Actual WhatsApp protocol validation
- Real message IDs and timestamps
- Actual media handling
- Real webhook event payloads

---

## 2. Test Environment Setup

### 2.1 Prerequisites

#### Required

1. **Test Phone Number**
   - Dedicated WhatsApp number for testing
   - Can scan QR code and remain connected during tests
   - NOT your personal daily number

2. **Test Contacts**
   - Contact A: Standard WhatsApp user (phone visible)
   - Contact B: Standard WhatsApp user (for group tests)
   - Both must have added the test number

3. **Test Group**
   - Pre-created WhatsApp group
   - Test number is admin
   - At least 2 members

#### Optional (for Business Features)

4. **WhatsApp Business Account**
   - Business number different from test number
   - For testing labels, catalog, newsletters

### 2.2 Environment Configuration

Create `.env.test`:

```bash
# API Configuration
PORT=3000
HOST=127.0.0.1
API_KEY=test-api-key-for-integration-tests
WEBHOOK_SECRET=test-webhook-secret

# Test Instance
TEST_INSTANCE_ID=integration-test-bot
TEST_SESSION_PATH=./test-sessions

# Test Contacts (real WhatsApp numbers)
TEST_CONTACT_A=6281234567890
TEST_CONTACT_B=6280987654321
TEST_GROUP_JID=123456789@g.us

# Timeouts
TEST_CONNECT_TIMEOUT=120000
TEST_MESSAGE_TIMEOUT=30000
TEST_WEBHOOK_TIMEOUT=5000

# Test Webhook Server
TEST_WEBHOOK_PORT=3001
```

### 2.3 First-Time Setup

1. Install dependencies: `npm install`
2. Copy `.env.test.example` to `.env.test`
3. Fill in real WhatsApp phone numbers
4. Run connection test first: `npm run test:integration -- setup`
5. Scan QR code when prompted
6. Session persists in `./test-sessions/`
7. Subsequent runs don't require QR scanning

---

## 3. Test Infrastructure

### 3.1 Components

| Component | Purpose | Implementation |
|-----------|---------|----------------|
| Test Server | Fastify server on test port | Real Fastify instance |
| HTTP Client | Make API requests | Native fetch API |
| Webhook Server | Receive webhook events | Test HTTP server |
| Instance Manager | Manage MiawClient instances | Real InstanceManager service |
| Test Assertions | Verify responses | Custom matchers |

### 3.2 Test Lifecycle

```
Setup (before all)
  └─ Start test Fastify server (random port)
  └─ Start test webhook server (random port)
  └─ Load environment variables
  └─ Initialize InstanceManager

Test Execution
  └─ Run tests with real MiawClient instances
  └─ WhatsApp connection required
  └─ Messages sent to real contacts
  └─ Webhook events received by test server

Teardown (after all)
  └─ Disconnect all instances
  └─ Stop test server
  └─ Stop webhook server
  └─ Cleanup test sessions (optional)
```

### 3.3 Test File Structure

```
test/integration/
├── setup.ts                      # Global test setup/teardown
├── helpers/
│   ├── server.ts                  # Test server lifecycle
│   ├── http.ts                    # HTTP request wrapper
│   ├── webhook.ts                 # Webhook server for testing
│   └── assertions.ts              # Custom assertions
├── fixtures/
│   ├── data.ts                    # Test data constants
│   └── expectations.ts            # Expected response shapes
├── setup.test.ts                 # Initial connection & QR
├── instance-management.test.ts   # Instance CRUD
├── connection.test.ts            # Connect/disconnect
├── messaging.test.ts             # Send messages
├── contacts.test.ts              # Contact operations
├── groups.test.ts                # Group operations
├── profile.test.ts               # Profile management
├── presence.test.ts              # Presence & UX
├── webhooks.test.ts              # Webhook delivery
├── business.test.ts              # Business features
├── basic-gets.test.ts            # Basic GET operations (v0.9.0)
└── README.md                     # Test documentation
```

---

## 4. Test Categories

### 4.1 Setup Tests

**Purpose:** Verify WhatsApp connection is established before running other tests

| Test Case | Description | Success Criteria |
|-----------|-------------|------------------|
| Initial connection | Connect to WhatsApp, scan QR | Instance reaches `connected` state |
| Session persistence | Restart without QR | Session persists from file |
| Instance cleanup | Disconnect and cleanup | Clean shutdown |

**Note:** Must pass before any other tests can run

### 4.2 Instance Management Tests

**Purpose:** Test instance CRUD operations

#### Create Instance

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Create with minimal config | Create instance with ID only | 201 Created, instance details returned |
| Create with webhook config | Include webhook URL and events | Webhook config saved correctly |
| Invalid instance ID | Use invalid characters | 400 Bad Request |
| Duplicate instance ID | Create same instance twice | 409 Conflict |
| Invalid webhook URL | Use malformed URL | 400 Bad Request |
| Invalid webhook events | Use non-existent event | 400 Bad Request |

#### List Instances

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| List all instances | Get all instances | 200 OK, array of instances |
| Empty list | No instances created | 200 OK, empty array |
| Pagination | Use limit/offset params | Correct pagination metadata |

#### Get Instance

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Get existing instance | Query by instanceId | 200 OK, full instance details |
| Get non-existent instance | Query invalid ID | 404 Not Found |

#### Delete Instance

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Delete existing instance | Remove instance | 200 OK |
| Delete connected instance | Delete while connected | Auto-disconnects, then deletes |
| Delete non-existent instance | Delete invalid ID | 404 Not Found |

### 4.3 Connection Tests

**Purpose:** Test connection lifecycle

#### Connect

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Initiate connection | Start connection process | 200 OK, status becomes `connecting` |
| QR generation | Wait for QR event | Webhook receives `qr` event with QR string |
| Connection established | Wait for ready event | Webhook receives `ready` event |
| Already connected | Connect twice | 409 Conflict |
| Instance not found | Connect invalid instance | 404 Not Found |

#### Disconnect

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Disconnect connected | Disconnect active instance | 200 OK, status becomes `disconnected` |
| Disconnect disconnected | Disconnect idle instance | 200 OK (idempotent) |

#### Restart

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Restart connected | Disconnect then connect | 200 OK, reconnected successfully |
| Restart disconnected | Start fresh connection | 200 OK, connects successfully |

#### Status

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Get initial status | Check disconnected instance | Status: `disconnected` |
| Get connecting status | Check during connection | Status: `connecting` |
| Get connected status | Check after connection | Status: `connected`, includes metadata |

### 4.4 Messaging Tests

**Purpose:** Test sending all message types to real WhatsApp

#### Send Text Message

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Send to phone number | Simple text message | 200 OK, messageId returned |
| Send to JID | Use full JID format | 200 OK, messageId returned |
| Send to group | Group message | 200 OK, messageId returned |
| Reply to message | Include quotedMessageId | Message shows as reply |
| Empty text | Send empty string | 400 Bad Request |
| Very long text | 10,000+ characters | 200 OK (WhatsApp handles splitting) |
| Multiple messages | Send 10 messages concurrently | All succeed, messageIds unique |
| Not connected | Send while disconnected | 503 Service Unavailable |
| Instance not found | Send to invalid instance | 404 Not Found |

#### Send Image

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Send from URL | Image URL | 200 OK, image sent |
| Send with caption | Include caption text | Caption shown with image |
| Send view-once | Set viewOnce flag | Image disappears after view |
| Invalid URL | Malformed image URL | 400 Bad Request |

#### Send Video

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Send from URL | Video URL | 200 OK, video sent |
| Send as GIF | Set gifPlayback flag | Video loops without sound |
| Send with caption | Include caption | Caption shown with video |

#### Send Audio

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Send audio file | Audio URL | 200 OK, audio sent |
| Send as voice note | Set ptt flag | Shown as voice message |

#### Send Document

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Send with filename | Include fileName | File has correct name |
| Auto-detect mimetype | From file extension | Correct mimetype applied |
| Custom mimetype | Override mimetype | Custom mimetype used |
| Send with caption | Include caption | Caption shown with document |

#### Message Editing

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Edit own message | Change text within 15 min | Text updated successfully |
| Edit other's message | Try to edit received message | 400 Bad Request or error |
| Edit after timeout | Edit message older than 15 min | Fails (WhatsApp restriction) |

#### Message Deletion

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Delete for everyone | Delete own message | Message removed for all |
| Delete for me | Delete locally | Only removed from sender |
| Delete other's message | Try to delete received | Fails (not authorized) |

#### Reactions

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Add reaction | Send emoji reaction | Reaction appears on message |
| Remove reaction | Send empty emoji | Reaction removed |
| React to own message | Self-reaction | Works correctly |

#### Forwarding

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Forward to chat | Forward to contact | Message forwarded successfully |
| Forward to group | Forward to group | Group receives forwarded message |

#### Receive Messages

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Receive text | Get text message | Webhook fires with message event |
| Receive image | Get image message | Webhook includes media info |
| Receive in group | Get group message | isGroup=true, participant set |
| Receive own message | Bot's own sent message | fromMe=true |
| Long polling | Multiple messages arrive | All messages fired via webhook |

### 4.5 Contact & Validation Tests

**Purpose:** Test contact operations and number validation

#### Check Number

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Valid WhatsApp number | Check real contact | exists=true, JID returned |
| Invalid number | Check non-WhatsApp number | exists=false |
| Multiple formats | Phone with various formats | Normalized correctly |
| Not connected | Check while disconnected | 503 Service Unavailable |

#### Batch Check

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Check multiple numbers | Array of phone numbers | Array of results |
| Mixed valid/invalid | Mix of good and bad | Correct results for each |
| Batch limit | Exceed max batch size | 400 Bad Request |

#### Contact Info

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Get contact info | Query by JID | Returns ContactInfo |
| Get profile picture | Query picture URL | Returns URL or null |
| Get business profile | Query business account | Returns BusinessProfile |

### 4.6 Group Management Tests

**Purpose:** Test group operations

#### Create Group

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Create with participants | New group with members | Group JID returned |
| Empty name | Create without name | 400 Bad Request |
| No participants | Create alone | 400 Bad Request |
| Invalid participant | Non-WhatsApp number | Partial success with errors |

#### Group Info

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Get group metadata | Query by group JID | Full GroupInfo returned |
| Get participants | List group members | Participant array returned |
| Invalid group JID | Query invalid JID | 400 Bad Request |

#### Participant Management

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Add participants | Add to existing group | Success results returned |
| Remove participants | Remove from group | Success results returned |
| Promote to admin | Make user admin | User becomes admin |
| Demote admin | Remove admin status | User becomes member |
| Non-member operation | Modify non-existent participant | Failure status code |

#### Group Updates

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Update name | Change group subject | Name updated |
| Update description | Set group description | Description updated |
| Update picture | Change group avatar | Picture updated |
| Leave group | Bot leaves group | Bot removed from group |

#### Group Invites

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Get invite link | Generate invite code | Full invite URL returned |
| Revoke invite | Generate new link | Old link invalidated |
| Accept invite | Join via code | Bot joins group |
| Get invite info | Preview group info | Group metadata without joining |

### 4.7 Profile Management Tests

**Purpose:** Test bot profile operations

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Update profile picture | Change avatar | Picture updated |
| Remove profile picture | Delete avatar | Picture removed |
| Update profile name | Change display name | Name updated |
| Update status | Change "About" text | Status updated |
| Validate name length | Exceed max length | 400 Bad Request |
| Validate name empty | Use empty string | 400 Bad Request |

### 4.8 Presence & UX Tests

**Purpose:** Test presence and UX features

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Set available | Go online | Presence updated |
| Set unavailable | Go offline | Presence updated |
| Send typing indicator | Show "typing..." | Contact sees typing |
| Send recording indicator | Show "recording..." | Contact sees recording |
| Stop indicator | Pause typing/recording | Indicator stops |
| Mark as read | Send read receipt | Message marked as read |
| Subscribe to presence | Monitor contact | Presence events fire via webhook |

### 4.9 Webhook Tests

**Purpose:** Test webhook delivery system

#### Webhook Configuration

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Set webhook URL | Configure on instance | URL saved |
| Update webhook URL | Change webhook URL | New URL used |
| Set webhook events | Configure event filter | Only selected events fire |
| Disable webhook | Set empty URL | No webhooks sent |

#### Event Delivery

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| QR event | QR code available | Webhook receives QR |
| Ready event | Instance connected | Webhook receives ready |
| Message event | Message received | Webhook receives message |
| Message edit event | Message edited | Webhook receives edit |
| Message delete event | Message deleted | Webhook receives delete |
| Reaction event | Reaction received | Webhook receives reaction |
| Presence event | Presence change | Webhook receives presence |
| Disconnected event | Disconnected | Webhook receives disconnect |
| Error event | Instance error | Webhook receives error |

#### Webhook Signature

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Signature header | X-Miaw-Signature present | Header exists |
| Signature format | sha256= format | Correct format |
| Valid signature | HMAC verification | Signature matches |
| Timestamp header | X-Miaw-Timestamp present | Header exists |
| Replay prevention | Old timestamp rejected | Timestamp validated |

#### Retry Mechanism

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Retry on failure | Webhook returns 500 | Retries with backoff |
| Stop on success | Webhook returns 200 | Stops retrying |
| Max retries | Exceed retry limit | Gives up after attempts |
| Exponential backoff | Delays between retries | Correct delays applied |

### 4.10 Business Features Tests

**Purpose:** Test WhatsApp Business features (requires Business account)

#### Labels

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Create label | New label | Label created |
| Add to chat | Label conversation | Chat labeled |
| Remove from chat | Unlabel conversation | Label removed |
| Add to message | Label message | Message labeled |
| Remove from message | Unlabel message | Label removed |

#### Products

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Get catalog | Fetch products | Product list returned |
| Create product | Add new product | Product created |
| Update product | Edit product | Product updated |
| Delete products | Remove products | Products deleted |

#### Newsletters

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Create newsletter | New channel | Newsletter created |
| Follow newsletter | Subscribe to channel | Following enabled |
| Unfollow newsletter | Unsubscribe | Following disabled |
| Update newsletter | Change metadata | Metadata updated |
| Post message | Send to newsletter | Message posted |

---

## 5. Test Execution

### 5.1 Running Tests

#### Setup Test (Must Run First)

```bash
npm run test:integration -- setup
# Scan QR code when prompted
# Verify connection established
```

#### Run All Tests

```bash
# Run all integration tests (requires connected WhatsApp)
npm run test:integration

# Run with verbose output
npm run test:integration -- --reporter=verbose

# Run specific test file
npm run test:integration -- messaging

# Run with coverage
npm run test:integration -- --coverage
```

#### Run by Category

```bash
# Instance management
npm run test:integration -- instance

# Messaging
npm run test:integration -- messaging

# Contacts
npm run test:integration -- contacts

# Groups
npm run test:integration -- groups

# Webhooks
npm run test:integration -- webhooks
```

### 5.2 Expected Test Counts

| Category | Tests | Estimated Duration |
|----------|-------|-------------------|
| Setup | 3 | 2 min (first time) |
| Instance Management | 15 | 1 min |
| Connection | 10 | 2 min |
| Messaging | 35 | 5 min |
| Contacts | 12 | 1 min |
| Groups | 25 | 3 min |
| Profile | 8 | 1 min |
| Presence & UX | 33 | 2 min |
| Webhooks | 26 | 3 min |
| Business | 27 | 3 min |
| **Total** | **~214** | **~26 min** |

### 5.3 CI/CD Considerations

**Not suitable for automated CI/CD pipelines:**
- Requires manual QR scanning
- Requires real WhatsApp connection
- Tests may fail due to network issues
- Rate limiting from WhatsApp
- Session expiration

**Recommended approach:**
- Run locally before releases
- Run in staging environment with manual pairing
- Use unit tests for CI/CD (fast, no external dependencies)

---

## 6. Notes & Limitations

### 6.1 What's Possible

| Feature | Testable | Notes |
|---------|-----------|-------|
| All HTTP endpoints | Yes | Real HTTP calls to API |
| Instance lifecycle | Yes | Full CRUD, connection |
| Send messages | Yes | All message types to real WhatsApp |
| Receive messages | Yes | Trigger real messages, verify webhook |
| Webhook delivery | Yes | Test server receives events |
| Contact operations | Yes | Real number validation |
| Group operations | Yes | Real group management |
| Profile changes | Yes | Real profile updates |

### 6.2 What's Not Possible (or Difficult)

| Feature | Limitation | Workaround |
|---------|------------|------------|
| Parallel testing | Only one instance per phone number | Run tests sequentially |
| Multi-user testing | One WhatsApp number per test run | Use different test numbers |
| Speed | WhatsApp rate limits | Add delays between tests |
| Business features | Need Business account | Optional test category |
| CI/CD automation | Requires QR scanning | Manual or staging only |
| Message edit timeout | 15-minute window | Test immediately after sending |
| Newsletter owner | Need to be creator | Use test account as creator |

### 6.3 Known Issues

1. **Rate Limiting**: WhatsApp may rate limit if sending too fast
   - Mitigation: Add 1-2 second delays between sends

2. **Session Expiry**: Sessions expire after inactivity
   - Mitigation: Re-run setup test when needed

3. **Network Dependencies**: Requires internet connection
   - Mitigation: Skip tests if offline

4. **Test Data Cleanup**: Messages sent to real contacts
   - Mitigation: Use dedicated test contacts

5. **Group State**: Repeated group operations may leave artifacts
   - Mitigation: Clean up test groups periodically

6. **Webhook Timing**: Events may arrive out of order
   - Mitigation: Use timestamps for ordering

### 6.4 Best Practices

1. **Before Running Tests**
   - Ensure test contacts are available
   - Verify network connection
   - Check test instance is connected

2. **During Tests**
   - Don't use the test phone for other activities
   - Let tests complete fully
   - Monitor webhook server logs

3. **After Tests**
   - Review test results
   - Clean up test groups if needed
   - Update test documentation

4. **Maintenance**
   - Rotate test contacts periodically
   - Update test data if contacts change
   - Re-pair if session expires

---

## 7. Test Maintenance

### 7.1 Adding New Tests

When adding new API endpoints:

1. Create test file in appropriate category
2. Add test cases to this document
3. Implement tests with real WhatsApp connection
4. Update test counts in documentation

### 7.2 Updating Tests

When API changes:

1. Update test expectations
2. Add new test cases for new features
3. Remove deprecated tests
4. Update test counts

### 7.3 Troubleshooting

| Issue | Symptoms | Solution |
|-------|----------|----------|
| QR timeout | Test fails to connect | Re-run setup, scan QR faster |
| Session expired | Tests fail with auth errors | Re-pair via setup test |
| Webhook not received | Test fails waiting for event | Check webhook server logs |
| Message not sent | Send returns error | Check phone number format |
| Rate limited | Messages fail with 429 | Add delays, retry later |

### 7.4 Test Data Rotation

Periodically rotate to avoid WhatsApp flags:

| Frequency | Action |
|-----------|--------|
| Weekly | Restart test instance |
| Monthly | Re-pair (scan QR again) |
| Quarterly | Rotate test contacts |

---

## Appendix: Test Checklist

### Pre-Test Checklist

- [ ] Test phone number available and charged
- [ ] Test contacts have added test number
- [ ] Test group exists with test number as admin
- [ ] `.env.test` configured with real numbers
- [ ] Network connection stable
- [ ] Sufficient time to run tests (~21 min)

### Post-Test Checklist

- [ ] All tests passed
- [ ] Test contacts not spammed
- [ ] Test groups cleaned up
- [ ] Test results documented
- [ ] Failures investigated and fixed

---

**Last Updated:** 2025-12-25
**Version:** 1.0.0
**Status:** Ready for Implementation
