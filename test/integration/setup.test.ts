/**
 * Setup Integration Test
 *
 * Initial connection and QR code pairing. Two of these steps need a person to
 * scan a QR code within the timeout, so the file is opt-in rather than part of
 * a default run — otherwise it fails every unattended run and buries the
 * failures that matter.
 *
 * Run with: MIAW_TEST_PAIRING=1 npm run test:integration -- setup
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, stopTestServer, createTestClient } from './helpers/server.js';
import { WebhookTestServer } from './helpers/webhook.js';
import { TEST_CONFIG } from './fixtures/data.js';

const pairing = process.env.MIAW_TEST_PAIRING ? describe : describe.skip;

pairing('Setup Tests - Initial Connection', () => {
  let client: any;
  let webhookServer: WebhookTestServer;

  beforeAll(async () => {
    await startTestServer();
    webhookServer = new WebhookTestServer(3001);
    await webhookServer.start();

    client = createTestClient();
  }, 30000);

  afterAll(async () => {
    await webhookServer.stop();
    await stopTestServer();
  }, 10000);

  it('should start the API server', async () => {
    const response = await client.get('/health');

    expect(response.status).toBe(200);
    expect(response.data.status).toBe('ok');
    expect(response.data.timestamp).toBeDefined();
  });

  it('should create test instance with webhook configuration', async () => {
    // Delete instance if it exists from previous run
    try {
      await client.delete(`/instances/${TEST_CONFIG.INSTANCE_ID}`);
    } catch {
      // Ignore if doesn't exist
    }

    const response = await client.post('/instances', {
      instanceId: TEST_CONFIG.INSTANCE_ID,
      webhookUrl: webhookServer.getWebhookUrl(),
      webhookEvents: ['qr', 'ready', 'connection', 'disconnected', 'message', 'error'],
    });

    expect(response.status).toBe(201);
    expect(response.data.success).toBe(true);
    expect(response.data.data.instanceId).toBe(TEST_CONFIG.INSTANCE_ID);
    expect(response.data.data.webhookEnabled).toBe(true);
  });

  it('should initiate connection and generate QR code', async () => {
    webhookServer.clearEvents();

    // Initiate connection
    const connectResponse = await client.post(`/instances/${TEST_CONFIG.INSTANCE_ID}/connect`);
    expect(connectResponse.status).toBe(200);

    console.log('\n========================================');
    console.log('Waiting for QR code event...');
    console.log('Scan the QR code with your WhatsApp phone');
    console.log('========================================\n');

    // Wait for QR event (up to 30 seconds)
    const qrEvent = await webhookServer.waitForEvent('qr', 30000);

    expect(qrEvent).not.toBeNull();
    expect(qrEvent?.event).toBe('qr');

    console.log('\n========================================');
    console.log('QR Code received!');
    console.log('QR:', qrEvent?.data.qr);
    console.log('========================================\n');

    // Convert QR to terminal-friendly format if possible
    // This would require qrcode-terminal package
  });

  it('should wait for successful connection (ready event)', async () => {
    console.log('\n========================================');
    console.log('Waiting for connection to be established...');
    console.log('This may take up to 2 minutes');
    console.log('Make sure you scanned the QR code!');
    console.log('========================================\n');

    // Wait for ready event (up to 2 minutes)
    const readyEvent = await webhookServer.waitForEvent('ready', 120000);

    expect(readyEvent).not.toBeNull();
    expect(readyEvent?.event).toBe('ready');
    expect(readyEvent?.instanceId).toBe(TEST_CONFIG.INSTANCE_ID);

    console.log('\n========================================');
    console.log('Connection established successfully!');
    console.log('Instance is ready for testing');
    console.log('========================================\n');

    // Verify status
    const statusResponse = await client.get(`/instances/${TEST_CONFIG.INSTANCE_ID}/status`);

    expect(statusResponse.data.data.status).toBe('connected');
    expect(statusResponse.data.data.phoneNumber).toBeDefined();

    console.log('Connected phone number:', statusResponse.data.data.phoneNumber);
  });

  it('should persist session for subsequent runs', async () => {
    // Disconnect
    await client.delete(`/instances/${TEST_CONFIG.INSTANCE_ID}/disconnect`);

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Reconnect - should not require QR
    webhookServer.clearEvents();
    await client.post(`/instances/${TEST_CONFIG.INSTANCE_ID}/connect`);

    // Should get ready event quickly without QR
    const readyEvent = await webhookServer.waitForEvent('ready', 30000);

    expect(readyEvent).not.toBeNull();
    expect(readyEvent?.event).toBe('ready');

    console.log('\n========================================');
    console.log('Session persistence verified!');
    console.log('No QR code required for reconnection');
    console.log('========================================\n');
  });

  it('should cleanup test instance', async () => {
    const response = await client.delete(`/instances/${TEST_CONFIG.INSTANCE_ID}`);

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);

    console.log('\n========================================');
    console.log('Setup test completed successfully!');
    console.log('Session is saved in ./test-sessions/');
    console.log('You can now run other integration tests');
    console.log('========================================\n');
  });
});
