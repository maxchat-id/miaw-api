# 004 — Route layer is out of sync with the miaw-core 1.9.2 API

- **Type:** Bug (latent, runtime)
- **Severity:** Critical
- **Status:** Code fixed (2026-07-09) — needs live WhatsApp verification
- **Found in:** While attempting [issue 002](./002-typed-server-decorators.md) (2026-07-09)

## Resolution (2026-07-09)

Migrated the route layer to the real miaw-core 1.9.2 API (Categories A–C):

- **A**: renamed method calls (catalog/collections, profile picture, group
  participants, newsletter messages, reactions).
- **B**: fixed result/shape reads (`SendMessageResult` has no `to`/`timestamp`;
  responses now use `body.to` + `Date.now()`; participant endpoints return the
  array directly; label `predefinedId` typed via `Label['predefinedId']`).
- **C**: message ops resolve a `messageId` to a real `MiawMessage` via the
  existing (now typed) `findMessageById` before calling
  edit/delete/react/forward; `send-media` dispatches by mimetype; `forward`
  fans out per recipient. Reply (`quoted`) support restored via resolution.
  Message-op requests take an optional `chatJid` (lookup hint).

Then landed [002](./002-typed-server-decorators.md) (typed decorators) so this
drift is caught by the compiler going forward.

**Verified:** `tsc` clean, 148 unit tests, server boots, endpoints route
correctly (503 not-connected, 400 invalid body, `chatJid` accepted).
**Still required:** live WhatsApp pairing to confirm the runtime behaviour of
every migrated message operation before release.

### Code review — fixed

- **send-text / send-media returned HTTP 200 on a soft failure.** They did not
  check `result.success` (which the dedicated image/video/audio/document
  handlers do), so a `SendMessageResult { success: false }` was reported as
  `{ success: true, messageId: undefined }`. Added the `!result.success` guard
  and an `instanceof BadRequestError` re-throw so it isn't re-wrapped.

### Code review — deferred (accepted trade-offs / follow-ups)

- **Unresolvable `quoted` fails the whole send with 404.** Defensible, but a
  stale reply reference arguably should degrade to a non-reply send instead of
  blocking. Behavioural choice — revisit if it bites.
- **`forward` fan-out is non-atomic:** if recipient N fails, 1..N-1 were already
  sent but the response is a single 400 with no partial data. Consider a
  207-style per-recipient result.
- **`predefinedId` accepts any string** (`as unknown as Label['predefinedId']`).
  Add an `enum` to the label schema to validate against the allowed set.
- **`send-media` with no `mimetype` is treated as a document.** Reasonable
  default; document it for callers.
- **No unit coverage** for `findMessageById` / mimetype dispatch / forward
  fan-out (they're inline in messaging.ts). Extract + test, or add integration
  coverage.
- **Lockfile drift (pre-existing):** `package.json` wants `miaw-core@^1.9.2` but
  `pnpm-lock.yaml` still pins `1.2.1`. Regenerate after publishing 1.9.2, else
  `pnpm install --frozen-lockfile` (CI) fails. Tracked with the 001 residual
  publish step.

## Summary

Typing `server.instanceManager` (so `getClient()` returns a real `MiawClient`)
made `tsc` surface **~30 type errors** in the route handlers. They are not
noise — they are latent runtime bugs masked by the `(server as any)` cast: the
routes call miaw-core methods and read result shapes that do not exist in the
installed `miaw-core` (was `^1.2.1`, now `^1.9.2`). Affected endpoints throw at
runtime today (e.g. `client.sendMedia is not a function`) but are not covered
by unit tests (integration tests need a live WhatsApp pairing).

This is a genuine **API migration**, not a mechanical rename — some cases have
no drop-in fix (see "Design gaps"). It must be done against the real
`miaw-core` API with runtime verification. Do **not** paper it over with `as`
casts: it would compile but still crash.

## Category A — method renamed (drop-in once callable)

| Route call | Real miaw-core method |
|------------|------------------------|
| `getProductCatalog()` | `getCatalog()` |
| `getProductCollections()` | `getCollections()` |
| `getProfilePictureUrl()` | `getProfilePicture()` |
| `addGroupParticipants()` | `addParticipants()` |
| `removeGroupParticipants()` | `removeParticipants()` |
| `promoteGroupAdmin()` | `promoteToAdmin()` |
| `demoteGroupAdmin()` | `demoteFromAdmin()` |
| `getNewsletterMessages()` | `fetchNewsletterMessages()` |
| `reactMessage()` | `sendReaction(message, emoji)` |

## Category B — result/shape mismatch

- `SendMessageResult` is `{ success, messageId?, error? }` — it has **no**
  `to`, `timestamp`, or array shape. Handlers read `result.to`,
  `result.timestamp`, and `result.map(...)` (send-text, send-media, edit,
  forward). These are `undefined` / throw at runtime.
- `messaging` send-text/media pass `quoted` as a `string`; the options expect
  `quoted?: MiawMessage`.
- `business` label handler passes a `string` where `PredefinedLabelId` (enum)
  is expected.

## Category C — design gaps (no drop-in fix)

- **Message operations need a `MiawMessage`, not a messageId string.**
  `deleteMessage`, `deleteMessageForMe`, `editMessage`, `sendReaction`,
  `forwardMessage`, `markAsRead`, `starMessage` all take a `MiawMessage`
  (with a `raw` field). The routes only have a messageId string, and miaw-core
  exposes **no** `messageId → MiawMessage` lookup. Fix requires either a
  message-store lookup in the API layer (resolve id → stored `MiawMessage`) or
  a messageId-based API added upstream in miaw-core.
- **`sendMedia` does not exist.** Dispatch to `sendImage` / `sendVideo` /
  `sendAudio` / `sendDocument` (by an explicit `type` or by `mimetype`).
- **`forwardMessage(message, to: string)` targets one recipient** and returns
  one result; the route treats `body.to` as an array and `.map`s the result.
  Decide single- vs multi-recipient contract.
- `deleteMessage(messageId, forMe)` is called with 2 args; real API is
  `deleteMessage(msg)` / `deleteMessageForMe(msg, deleteMedia?)`.

## Recommended approach

1. Add a message-store lookup (`getMessageById` on the API side, backed by the
   existing in-memory message store) so Category C ops can resolve a
   `MiawMessage` from an id — or coordinate a miaw-core release exposing
   messageId-based operations.
2. Fix Category A/B mechanically against the real signatures.
3. Land [002](./002-typed-server-decorators.md) (typed decorators) so this
   class of drift is caught by the compiler in future.
4. Verify each touched endpoint against a live WhatsApp pairing before release.

## Notes

Discovered during a review that only intended to type two decorators. The
`(server as any)` casts had been hiding these across ~10 route files. Reverted
the typing for now to keep the build green; tracked here for a dedicated
migration.
