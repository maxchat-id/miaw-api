# Migrating from v1 to v2

Both contracts are served by the same process. v1 keeps its unprefixed paths
and is frozen; v2 lives under `/api/v2`. Nothing forces a move — you can port
one call at a time, or not at all.

Read [API.md](./API.md) for the v2 conventions and the full endpoint list. This
document is only about what changes when you move a call across.

---

## What actually breaks

Four things, and they hit almost every endpoint. Everything else in this
document follows from them.

### 1. Collections are wrapped

```jsonc
// v1
{ "success": true, "data": [ … ] }

// v2
{ "success": true, "data": { "items": [ … ], "total": 12 } }
```

Anywhere you did `response.data.map(...)`, you now want `response.data.items`.
Cursor-paged endpoints add `nextCursor` beside `total`.

### 2. The path parameter is `:instanceId`

v1 used `:id` in most modules and `:instanceId` in a few. v2 uses
`:instanceId` everywhere. This only matters if you build paths from a template
that names the parameter.

### 3. `data` never carries a second `success`

Several v1 endpoints answered `{ success: true, data: { success: true } }`, and
a few answered `{ success, message }` with no `data` at all. In v2 the envelope
carries the outcome and `data` describes _what changed_:

```jsonc
// v1: DELETE /instances/bot/messages/MSG-1
{ "success": true, "message": "Message deleted for everyone" }

// v2: DELETE /api/v2/instances/bot/messages/MSG-1
{ "success": true, "data": { "deleted": true, "scope": "everyone" } }
```

If you were reading `message` to decide anything, read `data` instead.

### 4. Unknown request fields are rejected

v1 ignores a field it does not recognise — sometimes dropping it, sometimes
passing it through. v2 answers `400`.

This is the change most likely to surprise you, because on v1 a typo was
invisible. If a request that worked on v1 returns `400` on v2 with
`body must NOT have additional properties` or `property name must be valid`,
you are sending a field that endpoint does not accept.

---

## Behaviour that changed on purpose

Beyond the shape, a handful of endpoints answer differently. Each of these was
a case where v1 reported success for something that had not happened.

| Situation                                        | v1                                               | v2                                                   |
| ------------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------- |
| Send fails inside miaw-core                      | `200`, because only thrown errors were caught    | `400` — a `{success:false}` result is a failure      |
| `quoted` message id cannot be resolved           | Sent anyway, unquoted                            | `404`, nothing sent                                  |
| Lookup finds nothing (contact, profile, picture) | `200` with `data: null`                          | `404`                                                |
| Empty `PATCH` body                               | `200`, nothing changed                           | `400`                                                |
| Invite code expired or already used              | `200` with a null id                             | `400`                                                |
| Webhook test delivery                            | Held the request ~2s, never reported the outcome | `202` as soon as it is queued; read `/webhook/stats` |
| Contact saved without a name                     | Accepted, entry landed unnamed                   | `400` — `name` is required                           |
| Participant edit partially fails                 | —                                                | Per-participant status is returned, not collapsed    |

---

## Endpoint mapping

`…` stands for `/api/v2/instances/{instanceId}` on the right and
`/instances/{id}` on the left.

### Instances and connection

| v1                    | v2                                  |
| --------------------- | ----------------------------------- |
| `POST /instances`     | unchanged path, now under `/api/v2` |
| `GET /instances`      | same, `{items,total}`               |
| `GET …`               | same                                |
| `PATCH …`             | `PATCH …/webhook`                   |
| `DELETE …`            | same, returns `{deleted:true}`      |
| `POST …/connect`      | `PUT …/connection`                  |
| `DELETE …/disconnect` | `DELETE …/connection`               |
| `POST …/restart`      | `POST …/connection-restarts`        |
| `GET …/status`        | `GET …/connection`                  |
| `GET …/qr`            | `GET …/authentication/qr-code`      |
| —                     | `GET …/authentication/pairing-code` |

`GET …/connection` keeps `needsPairing`. The QR endpoint answers `404` once the
instance is paired, where v1 answered `200` with `qr: null`.

### Messaging

| v1                                             | v2                                                |
| ---------------------------------------------- | ------------------------------------------------- |
| `POST …/send-text`                             | `POST …/messages/text`                            |
| `POST …/send-media`                            | one of `messages/{image,video,audio,document}`    |
| `POST …/messages/{image,video,audio,document}` | unchanged                                         |
| —                                              | `POST …/messages/{location,contact,sticker,poll}` |
| `PATCH …/messages/edit`                        | `PATCH …/messages/{messageId}`                    |
| `DELETE …/messages/{messageId}`                | same, plus `?scope=everyone\|me`                  |
| `DELETE …/messages/{messageId}/local`          | folded into `?scope=me`                           |
| `POST …/messages/reaction`                     | `PUT …/messages/{messageId}/reaction`             |
| `DELETE …/messages/{messageId}/reaction`       | unchanged                                         |
| `POST …/messages/forward`                      | `POST …/messages/{messageId}/forward`             |
| `GET …/messages/{messageId}/media`             | unchanged, still raw bytes                        |
| —                                              | `PUT\|DELETE …/messages/{messageId}/star`         |
| `POST …/read`                                  | `PUT …/messages/{messageId}/read-receipt`         |
| `GET …/chats/{jid}/messages/load`              | `POST …/chats/{chatJid}/message-history-loads`    |

`send-media` sniffed the mimetype to choose a sender. v2 has no such route —
pick the path that matches what you are sending.

The message id moves from the body into the path on edit, reaction and
forward. Pass `?chatJid=` to narrow the lookup; without it every chat is
scanned.

### Chats and presence

| v1                           | v2                                                         |
| ---------------------------- | ---------------------------------------------------------- |
| `GET …/chats`                | same, `{items,total}`                                      |
| `GET …/chats/{jid}/messages` | `GET …/chats/{chatJid}/messages`                           |
| `POST …/typing/{to}`         | `PUT …/chats/{chatJid}/presence` with `{"state":"typing"}` |
| `POST …/recording/{to}`      | same route, `{"state":"recording"}`                        |
| `POST …/stop-typing/{to}`    | same route, `{"state":"paused"}`                           |
| `POST …/presence`            | `PUT …/presence`                                           |
| —                            | `PUT\|DELETE …/chats/{chatJid}/{archive,pin,mute}`         |
| —                            | `PUT …/chats/{chatJid}/read-state`                         |
| —                            | `DELETE …/chats/{chatJid}/messages` (clear)                |
| —                            | `DELETE …/chats/{chatJid}` (delete)                        |

Clearing a chat and deleting it are separate routes on purpose.

### Contacts

| v1                              | v2                                                      |
| ------------------------------- | ------------------------------------------------------- |
| `POST …/check-number`           | `POST …/contacts/checks` — one number is a batch of one |
| `POST …/check-batch`            | same route                                              |
| `GET …/contacts`                | same, `{items,total}`                                   |
| `GET …/contacts/{jid}`          | `GET …/contacts/{contactId}`                            |
| `POST …/contacts`               | `PUT …/contacts/{contactId}`                            |
| `DELETE …/contacts/{phone}`     | `DELETE …/contacts/{contactId}`                         |
| `GET …/contacts/{jid}/profile`  | `GET …/contacts/{contactId}/profile`                    |
| `GET …/contacts/{jid}/picture`  | `GET …/contacts/{contactId}/profile-picture`            |
| `GET …/contacts/{jid}/business` | `GET …/contacts/{contactId}/business-profile`           |
| `POST …/subscribe/{jid}`        | `PUT …/contacts/{contactId}/presence-subscription`      |

`:contactId` accepts a phone number or a JID. v1 wanted a JID on reads and a
phone number on delete; that inconsistency is gone.

### Profile

| v1                         | v2                                  |
| -------------------------- | ----------------------------------- |
| `GET …/profile`            | same                                |
| `PATCH …/profile/name`     | `PATCH …/profile` with `{"name":…}` |
| `PATCH …/profile/status`   | same route with `{"status":…}`      |
| `POST …/profile/picture`   | `PUT …/profile/picture`             |
| `DELETE …/profile/picture` | unchanged                           |

One `PATCH` covers both fields. If the second field fails after the first
landed, the error names which one and `details.updated` lists what stuck.

### Groups

| v1                                              | v2                                                            |
| ----------------------------------------------- | ------------------------------------------------------------- |
| `GET …/groups`, `POST …/groups`                 | same                                                          |
| `GET\|PATCH\|DELETE …/groups/{groupJid}`        | same; `DELETE` means leave                                    |
| `GET …/groups/{groupJid}/participants`          | same, `{items,total}`                                         |
| `POST\|DELETE …/groups/{groupJid}/participants` | `PATCH …/participants` with `{"operation":"add"\|"remove",…}` |
| `POST\|DELETE …/groups/{groupJid}/admins`       | same route, `"promote"` / `"demote"`                          |
| `POST …/groups/{groupJid}/picture`              | `PUT …/groups/{groupJid}/picture`                             |
| `GET …/groups/{groupJid}/invite`                | unchanged                                                     |
| `POST …/groups/{groupJid}/revoke-invite`        | `DELETE …/groups/{groupJid}/invite`                           |
| `GET …/groups/invite/{code}/info`               | `GET …/group-invites/{inviteCode}`                            |
| `POST …/groups/join/{inviteCode}`               | `POST …/group-memberships` with `{"inviteCode":…}`            |

Four participant routes become one `PATCH`. Revoking returns the replacement
link, so you do not need a second call to read it.

### Business — labels and catalog

| v1                                                     | v2                                               |
| ------------------------------------------------------ | ------------------------------------------------ |
| `GET …/labels`                                         | same, `{items,total}`                            |
| `POST …/labels`                                        | same, now `201`                                  |
| —                                                      | `PATCH …/labels/{labelId}`                       |
| `DELETE …/labels/{labelId}`                            | unchanged                                        |
| `GET …/labels/{labelId}/chats`                         | unchanged                                        |
| `POST\|DELETE …/chats/{jid}/labels/{labelId}`          | `PUT\|DELETE …/chats/{chatJid}/labels/{labelId}` |
| `POST\|DELETE …/messages/{messageId}/labels/{labelId}` | `PUT\|DELETE`, `?chatJid=` now required          |
| `GET …/products/catalog`                               | `GET …/catalog/products`                         |
| `GET …/products/collections`                           | `GET …/catalog/collections`                      |
| `POST …/products`                                      | `POST …/catalog/products`, now `201`             |
| `PATCH …/products/{productId}`                         | `PATCH …/catalog/products/{productId}`           |
| `DELETE …/products` (bulk, ids in body)                | `POST …/catalog/product-deletions`               |
| —                                                      | `DELETE …/catalog/products/{productId}`          |

Message labelling needs the chat: miaw-core cannot locate a message from its id
alone. v1 took it in the body, which a `DELETE` cannot carry, so it is a query
parameter now.

### Newsletters

| v1                                       | v2                                                      |
| ---------------------------------------- | ------------------------------------------------------- |
| `POST\|GET\|DELETE …/newsletters[/{id}]` | same; create is `201`                                   |
| `PATCH …/newsletters/{id}/name`          | `PATCH …/newsletters/{newsletterId}`                    |
| `PATCH …/newsletters/{id}/description`   | same route                                              |
| `POST\|DELETE …/newsletters/{id}/follow` | `PUT\|DELETE`                                           |
| `POST\|DELETE …/newsletters/{id}/mute`   | `PUT\|DELETE`                                           |
| `POST …/newsletters/{id}/subscribe`      | `PUT …/newsletters/{newsletterId}/updates-subscription` |
| `POST …/newsletters/{id}/picture`        | `PUT …/newsletters/{newsletterId}/picture`              |
| `POST …/newsletters/{id}/owner`          | `PATCH …/newsletters/{newsletterId}/owner`              |
| `POST …/messages/{messageId}/reaction`   | `PUT`, and `DELETE` to clear                            |

### Session and runtime

| v1                                           | v2                        |
| -------------------------------------------- | ------------------------- |
| `POST …/logout`                              | `DELETE …/authentication` |
| `DELETE …/session`                           | unchanged                 |
| `POST …/dispose`                             | `DELETE …/runtime`        |
| `GET …/stats/messages`, `GET …/stats/labels` | unchanged                 |
| —                                            | `GET\|PATCH …/runtime`    |

Three destructive operations, three resources. `authentication` is the pairing
with WhatsApp, `session` is the credentials on disk, `runtime` is the client
object in this process — deleting it frees sockets and timers while the stored
session survives.

### Communities

New in v2; v1 had no community routes. See [API.md](./API.md).

### Proxies

Unchanged. `GET /proxy-pool`, `POST /proxy-pool/reloads`, `POST /proxy-tests`
and the per-instance `GET|PUT|DELETE …/proxy` are served on both mounts with
identical shapes.

---

## A worked example

```diff
- POST /instances/bot/send-text
+ POST /api/v2/instances/bot/messages/text
  { "to": "6281234567890", "text": "halo" }

- POST /instances/bot/messages/reaction
- { "messageId": "MSG-1", "chatJid": "628…@s.whatsapp.net", "emoji": "👍" }
+ PUT /api/v2/instances/bot/messages/MSG-1/reaction?chatJid=628…%40s.whatsapp.net
+ { "emoji": "👍" }

- GET /instances/bot/contacts        → data: [ … ]
+ GET /api/v2/instances/bot/contacts → data: { items: [ … ], total: 42 }
```

---

## Suggested order

1. **Reads first.** `GET` endpoints only change shape, so the blast radius is a
   `.items` here and there.
2. **Then sends.** One path per media kind; check that you handle the new `400`
   on a failed send, which v1 reported as `200`.
3. **Then mutations.** Message id moves into the path, and participant edits
   collapse into one `PATCH`.
4. **Last, the destructive ones** — logout, dispose, delete chat. Get the three
   `runtime`/`session`/`authentication` meanings straight before you wire them.

Run both against the same instance while porting: they share one process and
one connection, so a half-migrated client works.
