# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-07-09

### Added

- **Graceful shutdown** on `SIGTERM`/`SIGINT`: stop accepting new requests
  (`server.close`), then dispose WhatsApp clients and webhook retry timers,
  then exit — with a watchdog force-exit on timeout and a double-signal guard.
- **Reply/quoted support** on send endpoints — pass a `quoted` messageId (with
  optional `chatJid`) and it is resolved to the original message.

### Changed

- **Aligned the route layer with the miaw-core 1.9.2 API.** The route handlers
  had been written against an older miaw-core and called methods/shapes that no
  longer exist (so several endpoints failed at runtime). Now:
  - message operations (edit, delete, react, forward) resolve a messageId to a
    full message before calling miaw-core; requests accept an optional `chatJid`
    lookup hint;
  - `send-media` dispatches to image/video/audio/document by `mimetype`;
  - group-participant, catalog, profile-picture and newsletter calls use the
    current method names.
- Typed the Fastify `instanceManager` / `webhookDispatcher` decorators (removed
  the `(server as any)` casts); added `"ts-node": { "files": true }` so
  `dev:start` loads the type augmentation.

### Fixed

- Schema/validation and other client (4xx) errors now return their real status
  code instead of being reported as `500`.
- `send-text` / `send-media` no longer report a soft send failure (miaw-core
  `success: false`) as HTTP `200`.
- `/health` no longer shows an auth lock in the `/docs` UI (marked public in the
  OpenAPI spec).

### Security

- **SSRF hardening for `webhookUrl`.** Reject non-`http(s)` schemes and hosts
  that are (or resolve to) private / loopback / link-local (incl. cloud
  metadata `169.254.169.254`) / CGNAT / unspecified addresses (IPv4, IPv6, and
  IPv4-mapped) at write time. Webhook delivery no longer follows redirects
  (`redirect: 'error'`), closing a redirect-to-internal bypass.

> Note: the miaw-core API migration is verified by type-check, unit tests, and a
> boot smoke test; the message operations still need live WhatsApp verification
> before release (see `docs/issues/004`).

## [1.1.0] - 2026-07-09

### Added

- `PATCH /instances/:id` — update an instance's `webhookUrl` and/or
  `webhookEvents` without recreating it (the WhatsApp session is preserved).
- OpenAPI `securitySchemes` (Bearer token + `X-API-Key`) with a global security
  requirement, so the Scalar `/docs` UI renders a central Authentication panel —
  enter the API key once instead of on every request.

### Changed

- **BREAKING (config)**: dropped the generic `API_` prefix on server env vars —
  `API_PORT` → `PORT`, `API_HOST` → `HOST`, `API_WEBHOOK_SECRET` →
  `WEBHOOK_SECRET` (`API_KEY` unchanged). Aligns `PORT`/`HOST` with common PaaS
  conventions.
- Renamed webhook config env vars to match the code: `WEBHOOK_TIMEOUT` →
  `WEBHOOK_TIMEOUT_MS`, `WEBHOOK_RETRY_DELAY` → `WEBHOOK_RETRY_DELAY_MS`.
- Bumped `miaw-core` dependency to `^1.9.2`.

### Fixed

- `.env` was never loaded (no `dotenv` / no `--env-file`), so configuration
  silently fell back to defaults. Added `--env-file-if-exists=.env` to the
  `start`/`dev:start` scripts (native Node, no dotenv dependency).
- Removed a debug `console.log` that leaked `apiKey`/`webhookSecret` to stdout
  on startup.

### Documentation

- Documented all 11 webhook events (was 6) and the `webhookEvents` whitelist
  behaviour.
- Corrected the Swagger URL to `/docs` and env var names across README and docs.

## [1.0.0] - 2025-01-21

### Added

#### Core Features
- **Instance Management**: Full CRUD operations for WhatsApp instances
- **Messaging**: Send text, images, videos, audio, documents, and stickers
- **Message Operations**: Edit, delete, forward messages, and send reactions
- **Contact Management**: Validate phone numbers, check WhatsApp registration, get contact info
- **Group Management**: Create groups, manage participants, update settings, get invite links
- **Profile Management**: Update display name, status, and profile picture
- **Presence**: Typing indicators, read receipts, online/offline status
- **Business Features**: Labels management, catalog operations, newsletter support

#### API Infrastructure
- RESTful API built on Fastify 5.x
- Swagger/OpenAPI documentation at `/docs`
- Scalar API reference
- CORS support with configurable origins

#### Webhook System
- Event-driven webhooks for real-time notifications
- HMAC-SHA256 signature verification with timestamps
- Replay attack prevention (5-minute window)
- Automatic retry with exponential backoff
- Configurable events per instance

#### Security
- API key authentication (Bearer token or X-API-Key header)
- Timing-safe API key comparison to prevent timing attacks
- Audit logging for authentication failures
- Webhook signature verification
- Configuration validation with security warnings

#### Error Handling
- Consistent error response format with correlation IDs
- Custom error classes: `UnauthorizedError`, `BadRequestError`, `NotFoundError`, `ConflictError`, `ServiceUnavailableError`, `ValidationError`
- Centralized error handler with internal error detail protection

#### Testing
- Unit test suite with Vitest (108 tests)
- Integration test suite (14 test files)
- Code coverage with v8 provider (>80% threshold)

#### Documentation
- [API Documentation](docs/API.md) - Complete endpoint reference
- [Security Guide](docs/SECURITY.md) - Production deployment security
- [Error Codes Reference](docs/ERROR-CODES.md) - All error codes with resolution steps
- [Implementation Roadmap](docs/ROADMAP.md) - Development phases

### API Endpoints

| Category | Endpoints |
|----------|-----------|
| Instances | `GET /instances`, `POST /instances`, `GET /instances/:id`, `DELETE /instances/:id` |
| Connection | `POST /instances/:id/connect`, `POST /instances/:id/disconnect`, `POST /instances/:id/restart`, `GET /instances/:id/status`, `GET /instances/:id/qr` |
| Messaging | `POST /instances/:id/messages/text`, `POST /instances/:id/messages/media`, `PUT /instances/:id/messages/:messageId`, `DELETE /instances/:id/messages/:messageId`, `POST /instances/:id/messages/:messageId/react`, `POST /instances/:id/messages/forward` |
| Contacts | `POST /instances/:id/contacts/check`, `GET /instances/:id/contacts/:jid`, `GET /instances/:id/contacts/:jid/profile-picture`, `GET /instances/:id/contacts` |
| Groups | `POST /instances/:id/groups`, `GET /instances/:id/groups/:groupId`, `PUT /instances/:id/groups/:groupId`, `DELETE /instances/:id/groups/:groupId/leave`, `POST /instances/:id/groups/:groupId/participants`, `DELETE /instances/:id/groups/:groupId/participants`, `PUT /instances/:id/groups/:groupId/participants/admin`, `GET /instances/:id/groups/:groupId/invite-code`, `POST /instances/:id/groups/:groupId/invite-code/revoke`, `GET /instances/:id/groups` |
| Profile | `PUT /instances/:id/profile/name`, `PUT /instances/:id/profile/status`, `PUT /instances/:id/profile/picture`, `GET /instances/:id/profile` |
| Presence | `POST /instances/:id/presence/typing`, `POST /instances/:id/presence/recording`, `POST /instances/:id/presence/read`, `POST /instances/:id/presence/online`, `POST /instances/:id/presence/offline` |
| Webhooks | `GET /instances/:id/webhooks`, `PUT /instances/:id/webhooks`, `POST /instances/:id/webhooks/test` |
| Business | `GET /instances/:id/labels`, `POST /instances/:id/labels`, `PUT /instances/:id/labels/:labelId`, `DELETE /instances/:id/labels/:labelId`, `POST /instances/:id/labels/:labelId/chats`, `DELETE /instances/:id/labels/:labelId/chats`, `GET /instances/:id/catalog`, `GET /instances/:id/newsletters`, `POST /instances/:id/newsletters/:newsletterId/follow`, `POST /instances/:id/newsletters/:newsletterId/unfollow`, `POST /instances/:id/newsletters/:newsletterId/mute`, `POST /instances/:id/newsletters/:newsletterId/unmute` |
| Data | `GET /instances/:id/chats` |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `API_KEY` | `miaw-api-key` | API authentication key |
| `WEBHOOK_SECRET` | `webhook-secret` | Webhook signature secret |
| `WEBHOOK_TIMEOUT` | `10000` | Webhook request timeout (ms) |
| `WEBHOOK_MAX_RETRIES` | `5` | Max webhook retry attempts |
| `WEBHOOK_RETRY_DELAY` | `1000` | Base retry delay (ms) |
| `SESSION_PATH` | `./sessions` | Session storage directory |
| `LOG_LEVEL` | `info` | Pino log level |
| `CORS_ORIGIN` | `*` | CORS allowed origins |

### Dependencies

- **miaw-core** v1.2.1 - WhatsApp Web API wrapper
- **fastify** v5.2.0 - Web framework
- **@fastify/swagger** v9.0.0 - OpenAPI documentation
- **@scalar/fastify-api-reference** v1.40.9 - API reference UI
- **pino** v8.19.0 - Logging

### Requirements

- Node.js >= 18.0.0
- pnpm (recommended) or npm

---

## Development Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Foundation (instance CRUD, basic messaging) | ✅ |
| 2 | Core Messaging (media, edit, delete, reactions) | ✅ |
| 3 | Contacts & Validation | ✅ |
| 4 | Group Management | ✅ |
| 5 | Profile Management | ✅ |
| 6 | Presence & UX | ✅ |
| 7 | Webhook Enhancements | ✅ |
| 8 | Business Features | ✅ |
| 9 | Basic GET Operations | ✅ |
| 10-14 | Reserved for future features | - |
| 15 | Polish & Testing | ✅ |

---

## License

MIT
