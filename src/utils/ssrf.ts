/**
 * SSRF guards for user-supplied webhook URLs.
 *
 * A webhook URL is where the server POSTs events, so an attacker who can set
 * it could aim the server at internal infrastructure (cloud metadata, private
 * services). These helpers reject non-http(s) schemes and any host that
 * resolves to a private / loopback / link-local / reserved address.
 */

import net from 'net';
import { promises as dns } from 'dns';
import { BadRequestError } from './errorHandler';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 (unspecified)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 10) return true; // 10.0.0.0/8 (private)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (private)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (private)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local, cloud metadata)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  return false;
}

/**
 * True if an IP literal falls in a range we never want the server to call.
 * Covers IPv4, IPv6, and IPv4-mapped IPv6.
 */
export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return isBlockedIPv4(ip);
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();

    // IPv4-mapped / embedded (e.g. ::ffff:127.0.0.1)
    const mapped = lower.match(/(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped && net.isIPv4(mapped[1])) {
      return isBlockedIPv4(mapped[1]);
    }

    if (lower === '::1' || lower === '::') return true; // loopback / unspecified
    if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 (link-local)
    if (/^f[cd]/.test(lower)) return true; // fc00::/7 (unique local)
    return false;
  }

  return false;
}

/**
 * True if the URL's host (or host:port) is in the operator-configured
 * allowlist, letting it bypass the private/loopback address check. An entry
 * with a port (`host:port`) matches only that exact port; a bare `host` entry
 * matches any port.
 */
function isAllowlisted(url: URL, allowlist: string[]): boolean {
  if (allowlist.length === 0) {
    return false;
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const hostPort = url.port ? `${host}:${url.port}` : host;
  const entries = new Set(allowlist.map((e) => e.trim().toLowerCase()).filter(Boolean));
  return entries.has(host) || entries.has(hostPort);
}

/**
 * Validate a webhook URL for SSRF safety. Throws {@link BadRequestError} when
 * the scheme is not http(s) or the host is / resolves to a blocked address.
 * Hosts in `allowlist` bypass the address check (scheme is still enforced).
 */
export async function assertSafeWebhookUrl(
  rawUrl: string,
  allowlist: string[] = [],
): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestError('webhookUrl is not a valid URL');
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new BadRequestError(`webhookUrl must use http or https (got ${url.protocol})`);
  }

  // Operator-allowlisted hosts skip the private/loopback address check.
  if (isAllowlisted(url, allowlist)) {
    return;
  }

  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  // IP literal: check directly, no DNS needed.
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) {
      throw new BadRequestError('webhookUrl points to a blocked (private/loopback) address');
    }
    return;
  }

  // Hostname: resolve and reject if any resolved address is blocked.
  let addresses: Array<{ address: string }>;
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new BadRequestError('webhookUrl host could not be resolved');
  }

  if (addresses.some((a) => isBlockedAddress(a.address))) {
    throw new BadRequestError('webhookUrl resolves to a blocked (private/loopback) address');
  }
}
