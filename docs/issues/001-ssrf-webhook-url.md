# 001 — Harden `webhookUrl` against SSRF

- **Type:** Security
- **Severity:** Important
- **Status:** Mostly resolved (write-time validation done; DNS-rebinding hardening deferred)
- **Found in:** Code review of `PATCH /instances/:id` (2026-07-09)

## Resolution (2026-07-09)

Write-time validation implemented in `src/utils/ssrf.ts` and wired into
`POST /instances` and `PATCH /instances/:id`:

- Only `http`/`https` schemes accepted.
- IP-literal hosts checked against blocked ranges (loopback, private,
  link-local incl. cloud metadata `169.254.169.254`, CGNAT, unspecified) for
  both IPv4 and IPv6 (incl. IPv4-mapped).
- Hostnames are DNS-resolved and rejected if any resolved address is blocked.
- Violations return `400` before the URL is stored.
- Unit tests: `test/unit/utils/ssrf.test.ts`.

### Deferred (still open)

**Delivery-time IP-pinning against DNS rebinding.** Write-time validation
resolves the host once; a hostname could re-resolve to a private IP between
validation and delivery (TOCTOU). Fully closing this requires pinning the
connection to the validated IP at send time (custom `lookup`/agent in
`WebhookDispatcher.deliver`), not just re-resolving. Tracked here as remaining
work — a naive re-`lookup` in the dispatcher was rejected because it still has
the TOCTOU gap and would force real DNS in the dispatcher unit tests.

## Summary

`webhookUrl` is accepted from API clients (`POST /instances`,
`PATCH /instances/:id`) and later used as the destination the server POSTs
webhook events to (`WebhookDispatcher`). The value is only validated as a
well-formed URI — there is no restriction on host/scheme/IP. An authenticated
client can point it at internal infrastructure, turning the server into an
SSRF relay.

## Impact

- **Cloud metadata theft:** `http://169.254.169.254/latest/meta-data/...`
  (AWS/GCP/Azure) — the server fetches it and the response body / timing can
  leak credentials or config.
- **Internal port scan / service probing:** `http://10.0.0.5:6379/`,
  `http://localhost:9200/`, etc. — reach services not exposed publicly.
- **Protocol abuse:** non-`http(s)` schemes if the HTTP client follows them.

Pre-existing (the create path already had this); authentication limits it to
known clients, but a compromised/abusive API key still gets internal reach.

## Affected code

- `src/schemas/index.ts` — `createInstance` / `updateInstance` (`webhookUrl`
  only `format: uri`)
- `src/services/InstanceManager.ts` — `updateWebhook()` stores the URL as-is
- `src/services/WebhookDispatcher.ts` — performs the outbound request

## Proposed hardening

1. **Scheme allowlist:** only `https` (and `http` in dev) — reject others.
2. **Host/IP denylist:** resolve the hostname and reject if it maps to
   private / loopback / link-local / reserved ranges
   (`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`,
   `fc00::/7`, `fd00::/8`, `0.0.0.0`).
4. **Validate at write time** (create + update) so a bad URL is rejected with
   `400` before it is ever stored, and again **at delivery time** to defeat
   DNS rebinding (resolve-then-connect to the same IP, or re-check on send).
5. Optional: configurable allowlist of webhook hosts for locked-down deploys.

## Acceptance criteria

- Setting `webhookUrl` to a private/loopback/link-local address returns `400`.
- Non-`http(s)` schemes rejected.
- Delivery re-validates the resolved IP (DNS-rebinding safe).
- Unit tests cover: metadata IP, private ranges, loopback, IPv6 loopback,
  disallowed scheme, and a valid public URL passing.

## Notes

Consider a small vetted dependency (e.g. an SSRF-safe request wrapper) vs.
hand-rolled IP-range checks; hand-rolled must cover IPv6 and
IPv4-mapped-IPv6 (`::ffff:127.0.0.1`).
