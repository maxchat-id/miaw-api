# TODO — Issue 004 migration

## Phase 0 — Infrastructure
- [x] T1 `resolveStoredMessage(client, chatJid, messageId)` util + unit tests

## Phase 1 — Category A renames
- [x] T2 business.ts — getCatalog / getCollections / predefinedId
- [x] T3 contacts.ts — getProfilePicture
- [x] T4 groups.ts — addParticipants / removeParticipants / promoteToAdmin / demoteFromAdmin
- [x] T5 newsletters.ts — fetchNewsletterMessages
- [x] CP2 — build green, all Category A done

## Phase 2 — messaging.ts
- [x] T6 send-text — drop quoted; body.to + Date.now()
- [x] T7 send-media — dispatch by type/mimetype
- [x] T8 edit — add chatJid; resolve; editMessage(msg, text)
- [x] T9 delete / deleteForMe — resolve via chatJid
- [x] T10 reaction / remove-reaction — add chatJid; resolve
- [x] T11 forward — resolve; loop recipients
- [x] CP3 — messaging migrated, build green

## Phase 3 — Close 002
- [x] T12 typed decorators + drop (server as any) + instances body casts
- [x] CP4 — full suite green, review, commit

## Follow-ups (separate issues)
- [x] Restore quoted/reply support (done in this migration via chatJid)
- [ ] Issue 001 residual: DNS-rebinding IP-pinning
- [ ] Live WhatsApp verification per endpoint
