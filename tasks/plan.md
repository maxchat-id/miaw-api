# Plan — Issue 004: align route layer with miaw-core 1.9.2 API

## Goal

Fix the ~30 latent type/runtime errors where route handlers call miaw-core
methods/shapes that don't exist (routes written against ~1.2, dependency now
1.9.2). End state: `tsc` clean with the `MiawClient` fully typed, and the
`(server as any)` casts removed (closes issue 002).

## Constraints & verification

- **No live WhatsApp** here → per-task verification is `tsc` type-check + build
  + unit tests for pure helpers. Endpoint runtime behaviour must be verified
  against a real pairing before release (noted in issue 004).
- Keep the build green after every task. Because `(server as any)` makes the
  client `any`, each migrated file will **locally annotate** the client
  (`const client: MiawClient | null = ...`) so `tsc` checks that file. The
  global decorator typing is switched on last (Phase 3), after which the local
  annotations become redundant but harmless.

## Key design decisions (need sign-off)

1. **messageId → MiawMessage resolution.** miaw-core message ops
   (`editMessage`, `deleteMessage`, `sendReaction`, `forwardMessage`, …) take a
   `MiawMessage` (with `raw`), not a messageId string, and expose no id lookup.
   Resolve via `getChatMessages(chatJid)` then `find(m => m.id === messageId)`.
   → **Requires a `chatJid` on every message-op request.** `delete`,
   `deleteForMe`, `download` already have `query.chatJid`; **`edit`,
   `reaction`, `remove-reaction`, `forward` do not** — add `chatJid` (required)
   to their request. This is an API contract change, acceptable because those
   endpoints are currently broken at runtime.
   - Limitation: only messages currently in the in-memory store are
     resolvable; unknown ids → `404`.

2. **`quoted` (reply).** DECIDED: **support now.** Add optional `chatJid` to
   send-text/send-media; when `quoted` (a messageId) is given, require `chatJid`,
   resolve it to a `MiawMessage`, and pass `{ quoted: msg }`. Missing/unknown
   quoted id when required → `400`/`404`.

DECIDED (1): add **required `chatJid`** to edit / reaction / remove-reaction /
forward requests.

3. **`send-media` dispatch.** No `sendMedia` in miaw-core. Dispatch to
   `sendImage`/`sendVideo`/`sendAudio`/`sendDocument` by an explicit media
   `type` field (fallback: infer from `mimetype`, default `document`).

4. **`forward` fan-out.** `forwardMessage(message, to: string)` is single
   recipient. Route accepts `to: string[]`. → Loop over recipients, aggregate
   `{ to, messageId }[]`; keep the array contract.

## Dependency graph

```
Task 1 (resolveStoredMessage helper) ──┬─→ Task 8  (edit)
                                        ├─→ Task 9  (delete/deleteForMe)
                                        ├─→ Task 10 (reaction/remove)
                                        └─→ Task 11 (forward)

Category A renames (Tasks 2–5) ── independent, parallel-safe

Tasks 2–11  ──→  Task 12 (enable typed decorators, drop casts) [closes 002]
```

## Phases & tasks

### Phase 0 — Infrastructure
- **T1 `resolveStoredMessage(client, chatJid, messageId)`** util.
  - AC: returns the `MiawMessage` whose `id === messageId` from
    `getChatMessages(chatJid)`; throws `NotFoundError` when the fetch fails or
    no message matches. Unit-tested with a mocked client.
  - Verify: `pnpm test:unit` (new tests) + build.

### Phase 1 — Category A (mechanical renames; locally type the client)
- **T2 business.ts** — `getProductCatalog→getCatalog`,
  `getProductCollections→getCollections`; fix label `predefinedId`
  (`PredefinedLabelId`).
- **T3 contacts.ts** — `getProfilePictureUrl→getProfilePicture`.
- **T4 groups.ts** — `addGroupParticipants→addParticipants`,
  `removeGroupParticipants→removeParticipants`,
  `promoteGroupAdmin→promoteToAdmin`, `demoteGroupAdmin→demoteFromAdmin`.
- **T5 newsletters.ts** — `getNewsletterMessages→fetchNewsletterMessages`.
  - AC (each): file type-checks with `client: MiawClient | null`; build green.
  - Verify: `pnpm build`.

### Phase 2 — Category B/C (messaging.ts, per endpoint)
- **T6 send-text** — drop string `quoted`; response uses `body.to` +
  `Date.now()` (was `result.to`/`result.timestamp`, undefined).
- **T7 send-media** — dispatch by `type`/`mimetype`; fix result shape.
- **T8 edit** — add `chatJid`; resolve; `editMessage(msg, text)`.
- **T9 delete / deleteForMe** — resolve via existing `query.chatJid`;
  `deleteMessage(msg)` / `deleteMessageForMe(msg, deleteMedia?)`.
- **T10 reaction / remove-reaction** — add `chatJid`; resolve;
  `sendReaction(msg, emoji)` / `removeReaction(msg)`.
- **T11 forward** — resolve; loop `forwardMessage(msg, to)` over recipients.
  - AC (each): correct miaw-core signatures; file type-checks; build green;
    request schema updated where `chatJid` added.
  - Verify: `pnpm build` + `pnpm test:unit`.

### Phase 3 — Close issue 002
- **T12 typed decorators** — add `src/types/fastify.d.ts` augmentation, replace
  `(server as any).instanceManager/.webhookDispatcher` with `server.…`, fix the
  residual `instances.ts` body-type casts (`WebhookEvent[]`), drop now-redundant
  local client annotations.
  - AC: no `(server as any)` for these decorators; `tsc` clean; 148+ tests pass.
  - Verify: `pnpm build` + `pnpm test:unit`.

## Checkpoints
- **CP1** after T1: resolver green + unit-tested.
- **CP2** after T5: all Category A done, build green.
- **CP3** after T11: messaging migrated, build green.
- **CP4** after T12: 002 closed, full suite green. Review + commit.

## Out of scope / follow-ups
- Restore `quoted`/reply support properly (needs chatJid + resolver).
- Delivery-time DNS-rebinding IP-pinning (issue 001 residual).
- Live WhatsApp verification of every migrated endpoint before release.
