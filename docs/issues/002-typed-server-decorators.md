# 002 — Type the Fastify server decorators (`instanceManager` / `webhookDispatcher`)

- **Type:** Architecture / Maintainability
- **Severity:** Suggestion
- **Status:** Blocked by [004](./004-route-layer-miaw-core-api-drift.md)
- **Found in:** Code review of `PATCH /instances/:id` (2026-07-09)

## Update (2026-07-09) — blocked

The decorator typing itself is a one-line augmentation and works. But once
`server.instanceManager` is typed, `getClient()` returns a real `MiawClient`
instead of `any`, and the build surfaces **~30 pre-existing type errors** in
the route handlers: they call miaw-core methods/shapes that no longer exist
(the route layer was written against an older miaw-core API). See
[issue 004](./004-route-layer-miaw-core-api-drift.md).

Merging this refactor is therefore blocked until 004 is resolved — otherwise
the only way to make it compile is to re-introduce `as any` casts, which would
hide the very same runtime bugs. The refactor was reverted; 004 must land
first, then this becomes a clean mechanical change.

## Summary

Route handlers reach shared services through an untyped cast:

```ts
const instanceManager = (server as any).instanceManager;
```

`(server as any)` appears across the route modules (and the new
`PATCH /instances/:id` follows the same pattern). It works, but discards all
type-checking on the service API — a typo or a signature change on
`InstanceManager` / `WebhookDispatcher` won't be caught at compile time.

## Affected code

- `src/server.ts` — `server.decorate('instanceManager', ...)` /
  `server.decorate('webhookDispatcher', ...)`
- `src/routes/*.ts` — every `(server as any).instanceManager` /
  `(server as any).webhookDispatcher` access

## Proposed change

Declare the decorators via module augmentation so they are typed everywhere:

```ts
// src/types/fastify.d.ts
import { InstanceManager } from '../services/InstanceManager';
import { WebhookDispatcher } from '../services/WebhookDispatcher';

declare module 'fastify' {
  interface FastifyInstance {
    instanceManager: InstanceManager;
    webhookDispatcher: WebhookDispatcher;
  }
}
```

Then drop the casts: `const instanceManager = server.instanceManager;`.

## Acceptance criteria

- No `(server as any)` remains for these decorators.
- `server.instanceManager` / `server.webhookDispatcher` are typed in handlers.
- Build passes; no behavior change.

## Notes

Pure refactor, no runtime change — out of scope for the PATCH feature, tracked
separately. Best done in one sweep across all route files.
