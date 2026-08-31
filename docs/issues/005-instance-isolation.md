# 005 — One process serves HTTP and every instance, so one connecting tenant blocks all of them

- **Type:** Architecture
- **Severity:** Important
- **Status:** Open — not started
- **Found in:** Staging test of issue 2066 phase 2 (2026-08-19)

## What happens

miaw-api hosts every `MiawClient` in the same process that serves HTTP. When one
instance connects, Baileys writes its auth state through
`useMultiFileAuthState` — one JSON file per key — and the volume of those writes
blocks the event loop. While it runs, the process serves nothing.

Measured on staging with a real tenant, first connect after pairing:

|                                        | `syncFullHistory` on | off            |
| -------------------------------------- | -------------------- | -------------- |
| `GET /health` returning nothing at all | **17 min 38 s**      | **4 min 11 s** |
| session key files written              | 8476                 | 3807           |
| of which `lid-mapping`                 | 7638                 | 3224           |

The blast radius is not limited to the instance doing the work:

- The tenant's own session dropped twice mid-sync with `reason=timedOut` — the
  keepalive gave up because the loop was blocked.
- The two idle instances in the same process (`thix`, `…-2`) were starved badly
  enough to exhaust their pre-login reconnect budget and emit
  `Could not register with WhatsApp after 5 attempts (no QR issued)`.

So a single tenant connecting takes the API down for every tenant. In production
that is an outage with no bad input and no error — just someone linking a phone.

**Monitoring note:** the process sat in `R`/`S` at 22–77% CPU, not `D`. This is
event-loop starvation, not disk I/O. A `D`-state check will not detect it; the
reliable signal is the HTTP port going unanswered while the process is alive.

## Two independent ways out

### Axis 1 — reduce the work (lands in miaw-core)

`useMultiFileAuthState` is one file per key. Baileys treats
`AuthenticationState` as an interface, so it can be replaced with a store backed
by SQLite or a single batched file: thousands of writes collapse into one
transaction. Contained in miaw-core's `AuthHandler`, and it attacks the cause
rather than the symptom.

miaw-core's `docs/DEFERRED_FEATURES.md` currently lists external session stores
under "Intentionally skipped — infra ideas with no specific Baileys dependency;
add on demand". The numbers above are that demand.

Note that `MIAW_SYNC_FULL_HISTORY=false` only removes the `lid-mapping` share.
`session-*` and `device-list-*` keep accumulating from ordinary traffic — 6249
files a few minutes after a fresh pairing, still climbing with the contact
count — so the setting reduces this problem without solving it.

### Axis 2 — contain the blast radius (lands here)

Options, cheapest first:

- **Split the HTTP process from the WhatsApp workers.** The API keeps answering
  whatever happens to a session. Does not make any single instance faster.
- **Shard instances across a few worker processes.** Bounds how many tenants one
  stall can reach, without a process per tenant.
- **One worker thread or process per instance.** Strongest isolation, highest
  memory cost.

## Suggested order

Measure axis 1 first. If moving the auth store collapses a four-minute stall
into seconds, isolation becomes an optimisation rather than a requirement, and
the far more invasive process-topology work can be skipped. Doing axis 2 first
would hide the cost without removing it.

## Related

- `MIAW_SYNC_FULL_HISTORY` (`8b22543`) — reduces, does not fix.
- Issue 2066 on maxchat-backend carries the staging measurements and the
  product discussion.
