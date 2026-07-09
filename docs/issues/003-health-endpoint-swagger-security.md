# 003 — `/health` shows an auth lock in Swagger despite being public

- **Type:** Documentation / DX
- **Severity:** Suggestion (cosmetic)
- **Status:** Open
- **Found in:** Code review of OpenAPI security scheme (2026-07-09)

## Summary

A global `security` requirement was added to the OpenAPI spec so the Scalar
`/docs` UI renders a central Authentication panel:

```ts
security: [{ bearerAuth: [] }, { apiKey: [] }],
```

Being global, it applies to **every** operation — including `GET /health`,
which is intentionally public (no auth middleware). The docs UI therefore
shows a lock on `/health`, implying auth is required when it is not. Purely a
documentation mismatch; runtime enforcement is unchanged (auth lives in the
route middleware, not the spec).

## Affected code

- `src/server.ts` — global `security` in the `swagger` registration
- `src/routes/*health*` — the health route (no auth hook)

## Proposed change

Override security to empty on the public operation so the spec matches reality:

```ts
// in the health route schema
schema: {
  // ...
  security: [], // public: no auth
}
```

## Acceptance criteria

- `GET /health` shows no auth requirement in `/docs`.
- All other operations still show the Authentication panel.
- No runtime behavior change.

## Notes

Low priority — cosmetic only. Bundle with any future audit of which routes are
public vs. protected to keep the spec honest.
