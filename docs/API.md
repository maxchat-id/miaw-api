# Miaw API v2

**Contract version:** 2 &nbsp;·&nbsp; **Base path:** `/api/v2` &nbsp;·&nbsp; **Core:** `miaw-core` 1.10

The generated reference is authoritative for field-level detail:

- Scalar UI — `GET /docs`
- OpenAPI JSON — `GET /documentation/json`

This document covers the conventions that apply everywhere, and indexes the
endpoints. Moving an existing integration across? Read
[MIGRATION-V1-V2.md](./MIGRATION-V1-V2.md) instead.

---

## Two contracts, one server

v1 is served unprefixed at the root and is **frozen**. v2 is served under
`/api/v2`. They share one process, one instance registry and one WhatsApp
connection, so a client may use both at once — useful while porting.

`/health`, `/docs` and `/documentation/json` are unversioned and unauthenticated.

## Authentication

Every route under `/api/v2` requires the API key, as either header:

```
Authorization: Bearer <API_KEY>
X-API-Key: <API_KEY>
```

A missing or wrong key is `401`.

## Response shape

Success always carries the outcome in `data`:

```json
{ "success": true, "data": { "instanceId": "bot", "status": "connected" } }
```

Collections put their metadata inside `data`, never beside it:

```json
{ "success": true, "data": { "items": [], "total": 0 } }
```

Cursor-paged collections (catalog products, newsletter messages) add
`nextCursor`, which is `null` on the last page.

`data` never contains a second `success` flag. If an operation only needs to
report that it happened, `data` says what changed — `{ "deleted": true }`,
`{ "archived": false }` — rather than repeating the envelope.

**One exception:** `GET …/messages/{messageId}/media` answers with the raw
media bytes and the matching `Content-Type`, not an envelope.

## Errors

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Instance not found",
    "correlationId": "3f2c…"
  }
}
```

`correlationId` also appears in the server log line for that request.

| Status | When                                                     |
| ------ | -------------------------------------------------------- |
| `400`  | Request rejected, or WhatsApp refused the operation      |
| `401`  | Missing or wrong API key                                 |
| `404`  | Instance, message, contact or resource does not exist    |
| `409`  | Instance already exists, or its state forbids the change |
| `503`  | Instance exists but is not connected                     |

A `503` is not a server fault: the instance is simply not connected yet.
Instance bookkeeping — create, delete, session, runtime, stats — works while
disconnected, and only those routes do.

## Request validation

Unknown fields are **rejected**, not ignored. A misspelled key returns `400`
rather than being silently dropped, which is the main reason a request that
worked on v1 may fail here.

An empty `PATCH` body is also `400`: it would otherwise report success while
changing nothing.

## Conventions worth knowing

**State is a sub-resource, set with `PUT` and cleared with `DELETE`.** Archive,
pin, mute, star, follow, and label attachment all work this way, so repeating a
request is harmless and a caller that does not know the current state cannot get
it wrong.

**Lists are edited with one `PATCH` that names the operation.** Group and
community participants take `{"operation":"add"|"remove"|"promote"|"demote",
"participants":[…]}`. The reply keeps WhatsApp's per-participant status — adding
two numbers where one is already a member is a partial result, not a failure.

**A failed operation is never a `200`.** miaw-core reports some failures as a
result object rather than by throwing; those become `400` with the underlying
message in `error.details`.

**Locating a message needs its chat.** Pass `?chatJid=` on message routes.
Without it every chat in the store is scanned, which is slow and may miss a
message that was never synced.

---

## Endpoints

`…` stands for `/api/v2/instances/{instanceId}`.

### Instances

The QR and pairing code are cached from their events and cleared on connect, so a pull returns `404` once paired. A pairing code only appears when the instance was created with `clientOptions.usePairingCode` and a `phoneNumber`.

| Method   | Path                            | Purpose                  |
| -------- | ------------------------------- | ------------------------ |
| `GET`    | `…/authentication/pairing-code` | Get current pairing-code |
| `GET`    | `…/authentication/qr-code`      | Get current qr-code      |
| `DELETE` | `…`                             | Delete instance          |
| `GET`    | `…`                             | Get instance             |
| `GET`    | `/instances`                    | List instances           |
| `POST`   | `/instances`                    | Create instance          |

### Connection

`GET …/connection` reports `needsPairing`, true only when a fresh scan is required — never during a transient reconnect.

| Method   | Path                    | Purpose               |
| -------- | ----------------------- | --------------------- |
| `POST`   | `…/connection-restarts` | Restart instance      |
| `DELETE` | `…/connection`          | Disconnect instance   |
| `GET`    | `…/connection`          | Get connection status |
| `PUT`    | `…/connection`          | Connect instance      |

### Messaging

One path per media kind; the server does not sniff. A `quoted` id that cannot be resolved is `404` rather than a message sent unquoted.

| Method   | Path                                      | Purpose              |
| -------- | ----------------------------------------- | -------------------- |
| `POST`   | `…/chats/{chatJid}/message-history-loads` | Load message history |
| `POST`   | `…/messages/{messageId}/forward`          | Forward message      |
| `GET`    | `…/messages/{messageId}/media`            | Download media       |
| `DELETE` | `…/messages/{messageId}/reaction`         | Remove reaction      |
| `PUT`    | `…/messages/{messageId}/reaction`         | Set reaction         |
| `PUT`    | `…/messages/{messageId}/read-receipt`     | Send read receipt    |
| `DELETE` | `…/messages/{messageId}/star`             | Unstar message       |
| `PUT`    | `…/messages/{messageId}/star`             | Star message         |
| `DELETE` | `…/messages/{messageId}`                  | Delete message       |
| `PATCH`  | `…/messages/{messageId}`                  | Edit message         |
| `POST`   | `…/messages/audio`                        | Send audio           |
| `POST`   | `…/messages/contact`                      | Send contact         |
| `POST`   | `…/messages/document`                     | Send document        |
| `POST`   | `…/messages/image`                        | Send image           |
| `POST`   | `…/messages/location`                     | Send location        |
| `POST`   | `…/messages/poll`                         | Send poll            |
| `POST`   | `…/messages/sticker`                      | Send sticker         |
| `POST`   | `…/messages/text`                         | Send text            |
| `POST`   | `…/messages/video`                        | Send video           |

### Chats

Clearing a chat and deleting it are separate routes. Mute takes a duration because WhatsApp stores an expiry, not a flag.

| Method   | Path                           | Purpose              |
| -------- | ------------------------------ | -------------------- |
| `DELETE` | `…/chats/{chatJid}/archive`    | Clear archive        |
| `PUT`    | `…/chats/{chatJid}/archive`    | Set archive          |
| `DELETE` | `…/chats/{chatJid}/messages`   | Clear chat messages  |
| `GET`    | `…/chats/{chatJid}/messages`   | List chat messages   |
| `DELETE` | `…/chats/{chatJid}/mute`       | Clear mute           |
| `PUT`    | `…/chats/{chatJid}/mute`       | Set mute             |
| `DELETE` | `…/chats/{chatJid}/pin`        | Clear pin            |
| `PUT`    | `…/chats/{chatJid}/pin`        | Set pin              |
| `PUT`    | `…/chats/{chatJid}/presence`   | Set chat presence    |
| `PUT`    | `…/chats/{chatJid}/read-state` | Set read state       |
| `DELETE` | `…/chats/{chatJid}`            | Delete chat          |
| `GET`    | `…/chats`                      | List chats           |
| `PUT`    | `…/presence`                   | Set account presence |

### Contacts

`{contactId}` accepts a phone number or a JID. A single number check is a batch of one; the batch is capped at 50.

| Method   | Path                                           | Purpose                       |
| -------- | ---------------------------------------------- | ----------------------------- |
| `GET`    | `…/contacts/{contactId}/business-profile`      | Get business profile          |
| `PUT`    | `…/contacts/{contactId}/presence-subscription` | Subscribe to contact presence |
| `GET`    | `…/contacts/{contactId}/profile-picture`       | Get contact profile picture   |
| `GET`    | `…/contacts/{contactId}/profile`               | Get contact profile           |
| `DELETE` | `…/contacts/{contactId}`                       | Remove contact                |
| `GET`    | `…/contacts/{contactId}`                       | Get contact                   |
| `PUT`    | `…/contacts/{contactId}`                       | Add or update contact         |
| `POST`   | `…/contacts/checks`                            | Check numbers                 |
| `GET`    | `…/contacts`                                   | List contacts                 |

### Profile

One `PATCH` covers name and status. If the second field fails after the first landed, the error names it and `details.updated` lists what stuck.

| Method   | Path                | Purpose                |
| -------- | ------------------- | ---------------------- |
| `DELETE` | `…/profile/picture` | Remove profile picture |
| `PUT`    | `…/profile/picture` | Set profile picture    |
| `GET`    | `…/profile`         | Get own profile        |
| `PATCH`  | `…/profile`         | Update own profile     |

### Groups

Revoking an invite returns the replacement link, so no second call is needed. `DELETE …/groups/{groupJid}` means leave, not destroy.

| Method   | Path                               | Purpose             |
| -------- | ---------------------------------- | ------------------- |
| `GET`    | `…/group-invites/{inviteCode}`     | Get invite info     |
| `POST`   | `…/group-memberships`              | Join group          |
| `DELETE` | `…/groups/{groupJid}/invite`       | Revoke invite link  |
| `GET`    | `…/groups/{groupJid}/invite`       | Get invite link     |
| `GET`    | `…/groups/{groupJid}/participants` | List participants   |
| `PATCH`  | `…/groups/{groupJid}/participants` | Change participants |
| `PUT`    | `…/groups/{groupJid}/picture`      | Set group picture   |
| `DELETE` | `…/groups/{groupJid}`              | Leave group         |
| `GET`    | `…/groups/{groupJid}`              | Get group           |
| `PATCH`  | `…/groups/{groupJid}`              | Update group        |
| `GET`    | `…/groups`                         | List groups         |
| `POST`   | `…/groups`                         | Create group        |

### Communities

A community is a group of groups, so the vocabulary matches Groups. `linked-groups` is the part groups have no analogue for.

| Method   | Path                                                    | Purpose                |
| -------- | ------------------------------------------------------- | ---------------------- |
| `POST`   | `…/communities/{communityJid}/groups`                   | Create community group |
| `DELETE` | `…/communities/{communityJid}/invite`                   | Revoke invite link     |
| `GET`    | `…/communities/{communityJid}/invite`                   | Get invite link        |
| `DELETE` | `…/communities/{communityJid}/linked-groups/{groupJid}` | Unlink group           |
| `GET`    | `…/communities/{communityJid}/linked-groups`            | List linked groups     |
| `PUT`    | `…/communities/{communityJid}/linked-groups`            | Link group             |
| `GET`    | `…/communities/{communityJid}/participants`             | List participants      |
| `PATCH`  | `…/communities/{communityJid}/participants`             | Change participants    |
| `DELETE` | `…/communities/{communityJid}`                          | Leave community        |
| `GET`    | `…/communities/{communityJid}`                          | Get community          |
| `PATCH`  | `…/communities/{communityJid}`                          | Update community       |
| `GET`    | `…/communities`                                         | List communities       |
| `POST`   | `…/communities`                                         | Create community       |
| `GET`    | `…/community-invites/{inviteCode}`                      | Get invite info        |
| `POST`   | `…/community-memberships`                               | Join community         |

### Business

Labels and the product catalog, for WhatsApp Business accounts. Message labelling requires `?chatJid=`.

| Method   | Path                                      | Purpose                 |
| -------- | ----------------------------------------- | ----------------------- |
| `GET`    | `…/catalog/collections`                   | List collections        |
| `POST`   | `…/catalog/product-deletions`             | Delete products in bulk |
| `DELETE` | `…/catalog/products/{productId}`          | Delete product          |
| `PATCH`  | `…/catalog/products/{productId}`          | Update product          |
| `GET`    | `…/catalog/products`                      | List products           |
| `POST`   | `…/catalog/products`                      | Create product          |
| `DELETE` | `…/chats/{chatJid}/labels/{labelId}`      | Unlabel a chat          |
| `PUT`    | `…/chats/{chatJid}/labels/{labelId}`      | Label a chat            |
| `GET`    | `…/labels/{labelId}/chats`                | List labelled chats     |
| `DELETE` | `…/labels/{labelId}`                      | Delete label            |
| `PATCH`  | `…/labels/{labelId}`                      | Update label            |
| `GET`    | `…/labels`                                | List labels             |
| `POST`   | `…/labels`                                | Create label            |
| `DELETE` | `…/messages/{messageId}/labels/{labelId}` | Unlabel a message       |
| `PUT`    | `…/messages/{messageId}/labels/{labelId}` | Label a message         |

### Newsletters

Also called channels. Most miaw-core newsletter calls report failure as a bare `false`, which surfaces here as `400`.

| Method   | Path                                                         | Purpose                   |
| -------- | ------------------------------------------------------------ | ------------------------- |
| `DELETE` | `…/newsletters/{newsletterId}/admins/{adminJid}`             | Demote admin              |
| `GET`    | `…/newsletters/{newsletterId}/admins/count`                  | Count admins              |
| `DELETE` | `…/newsletters/{newsletterId}/follow`                        | Clear follow              |
| `PUT`    | `…/newsletters/{newsletterId}/follow`                        | Set follow                |
| `DELETE` | `…/newsletters/{newsletterId}/messages/{messageId}/reaction` | Remove reaction           |
| `PUT`    | `…/newsletters/{newsletterId}/messages/{messageId}/reaction` | Set reaction              |
| `POST`   | `…/newsletters/{newsletterId}/messages/image`                | Post image                |
| `POST`   | `…/newsletters/{newsletterId}/messages/text`                 | Post text                 |
| `POST`   | `…/newsletters/{newsletterId}/messages/video`                | Post video                |
| `GET`    | `…/newsletters/{newsletterId}/messages`                      | List newsletter messages  |
| `DELETE` | `…/newsletters/{newsletterId}/mute`                          | Clear mute                |
| `PUT`    | `…/newsletters/{newsletterId}/mute`                          | Set mute                  |
| `PATCH`  | `…/newsletters/{newsletterId}/owner`                         | Change owner              |
| `DELETE` | `…/newsletters/{newsletterId}/picture`                       | Remove newsletter picture |
| `PUT`    | `…/newsletters/{newsletterId}/picture`                       | Set newsletter picture    |
| `GET`    | `…/newsletters/{newsletterId}/subscribers`                   | Get subscribers           |
| `PUT`    | `…/newsletters/{newsletterId}/updates-subscription`          | Subscribe to updates      |
| `DELETE` | `…/newsletters/{newsletterId}`                               | Delete newsletter         |
| `GET`    | `…/newsletters/{newsletterId}`                               | Get newsletter            |
| `PATCH`  | `…/newsletters/{newsletterId}`                               | Update newsletter         |
| `POST`   | `…/newsletters`                                              | Create newsletter         |

### Webhooks

A test delivery answers `202` once queued; delivery and retries happen in the background. Read `/webhook/stats` for the outcome. Webhook URLs are checked against SSRF at write time.

| Method  | Path              | Purpose                       |
| ------- | ----------------- | ----------------------------- |
| `POST`  | `…/webhook-tests` | Queue a test webhook delivery |
| `GET`   | `…/webhook/stats` | Get webhook delivery stats    |
| `GET`   | `…/webhook`       | Get webhook configuration     |
| `PATCH` | `…/webhook`       | Update webhook configuration  |

### Session

`authentication` is the pairing with WhatsApp, `session` the credentials on disk, `runtime` the client object in this process. `PATCH …/runtime` changes `debug`, `autoReconnect`, `maxReconnectAttempts` and `reconnectDelay`; transport settings are absent because the socket binds them at construction.

| Method   | Path               | Purpose                |
| -------- | ------------------ | ---------------------- |
| `DELETE` | `…/authentication` | Log out                |
| `DELETE` | `…/runtime`        | Dispose runtime        |
| `GET`    | `…/runtime`        | Get runtime options    |
| `PATCH`  | `…/runtime`        | Update runtime options |
| `DELETE` | `…/session`        | Clear stored session   |
| `GET`    | `…/stats/labels`   | Label store stats      |
| `GET`    | `…/stats/messages` | Message store stats    |

### Proxies

Served identically on both mounts. Changing an instance proxy requires it to be disconnected — the transport is constructor-bound, and WhatsApp reads a mid-session IP change as an account takeover.

| Method   | Path                  | Purpose                                   |
| -------- | --------------------- | ----------------------------------------- |
| `DELETE` | `…/proxy`             | Remove an instance proxy override         |
| `GET`    | `…/proxy`             | Get an instance proxy                     |
| `PUT`    | `…/proxy`             | Replace a disconnected instance proxy     |
| `POST`   | `/proxy-pool/reloads` | Reload the configured proxy pool          |
| `GET`    | `/proxy-pool`         | Inspect the configured proxy pool         |
| `POST`   | `/proxy-tests`        | Test a proxy without creating an instance |

---

See [ERROR-CODES.md](./ERROR-CODES.md) for the error catalogue and
[SECURITY.md](./SECURITY.md) for the webhook signature and SSRF rules.
