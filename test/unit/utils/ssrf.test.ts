/**
 * Unit tests for SSRF guards on webhook URLs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('dns', () => ({
  promises: { lookup: vi.fn() },
}));

import { promises as dnsPromises } from 'dns';
import { isBlockedAddress, assertSafeWebhookUrl } from '../../../src/utils/ssrf';

const mockLookup = dnsPromises.lookup as unknown as ReturnType<typeof vi.fn>;

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '0.0.0.0',
    '100.64.0.1', // CGNAT
  ])('blocks private/loopback/link-local IPv4 %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(['1.1.1.1', '8.8.8.8', '93.184.216.34', '172.15.0.1', '172.32.0.1'])(
    'allows public IPv4 %s',
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    }
  );

  it.each(['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1'])(
    'blocks loopback/link-local/ULA/mapped IPv6 %s',
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(true);
    }
  );

  it('allows public IPv6', () => {
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
  });
});

describe('assertSafeWebhookUrl', () => {
  beforeEach(() => {
    mockLookup.mockReset();
  });

  it('rejects a non-http(s) scheme', async () => {
    await expect(assertSafeWebhookUrl('ftp://example.com/x')).rejects.toThrow(/http/);
  });

  it('rejects a malformed URL', async () => {
    await expect(assertSafeWebhookUrl('not a url')).rejects.toThrow();
  });

  it('rejects an IP-literal in a blocked range (metadata)', async () => {
    await expect(assertSafeWebhookUrl('http://169.254.169.254/latest')).rejects.toThrow(
      /blocked/
    );
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('rejects an IPv6 loopback literal', async () => {
    await expect(assertSafeWebhookUrl('http://[::1]:3000/hook')).rejects.toThrow(/blocked/);
  });

  it('allows a public IP literal without a DNS lookup', async () => {
    await expect(assertSafeWebhookUrl('https://1.1.1.1/hook')).resolves.toBeUndefined();
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('rejects a hostname that resolves to a blocked address', async () => {
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(assertSafeWebhookUrl('https://evil.test/hook')).rejects.toThrow(/blocked/);
  });

  it('allows a hostname that resolves to a public address', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    await expect(assertSafeWebhookUrl('https://example.test/hook')).resolves.toBeUndefined();
  });

  it('rejects a hostname that cannot be resolved', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertSafeWebhookUrl('https://nope.invalid/hook')).rejects.toThrow(/resolve/);
  });
});
