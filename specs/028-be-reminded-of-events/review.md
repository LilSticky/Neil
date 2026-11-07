# Review of slice 028 (bot-reviewer)

## Must fix
- src/discord/event-reminders.ts:104 - Reminders are recorded before posting. A failed post (channel fetch/send error, thrown in `remind`, caught in `tick`) is never retried; the spec (spec.md:111) accepts a duplicate after a restart, not a loss. Fix: record each reminder after its `server.post` succeeded (and after the log); record the `plan.record` (collapsed) ones up front. For the "nobody to mention" and "no alliance-chat" cases, record only the nobody-to-mention case (the chat-missing case may be retried or logged once).
  - Fixed: a reminder is recorded after its posts succeed, before its #neil-log line, so a failed log does not repeat the post. The nobody-to-mention case is still recorded at once. A missing alliance-chat is not recorded, so it is logged each minute until the start passes or the chat appears.
- src/domain/setup-plan.ts:~194 (reviewRole) and src/discord/server-setup.ts:424 - The exemption goes by role name: any role named in `rolePermissions` (R4/R5/Moderator/King) is no longer flagged for any permission, e.g. Administrator or ManageRoles on R4. Fix: carry the held bits beyond the layout's role permissions (e.g. `hasOtherPermissions`, = permissions minus ROLE_PERMISSION_BITS of the layout-allowed names) and flag when it is true; Moderator/King keep their exemption by name.
  - Fixed: `ServerRole` carries `permissions: bigint`; the role review flags the bits a listed role holds beyond `ROLE_PERMISSION_BITS` of its `rolePermissions` (the CreateEvents bit is a domain constant in `server-layout.ts`). Moderator and King keep their exemption by name.

## Should fix
- src/discord/event-reminders.ts:104-117 - An Event whose reminder had nobody to mention is recorded as sent, so a Member who marks Interested a minute later gets nothing. Consider recording only after a post, or accept and document.
  - Accepted: kept as it was, by decision. A nobody-to-mention reminder stays recorded as sent; a Member who marks Interested later gets no reminder for that lead time.
- src/discord/client.ts:1534 - `setInterval` with an async tick has no overlap guard; a slow tick (many Interested Members -> one `members.fetch` each, holdersOf listing every Member) can overlap the next and double-post. Fix: an `inFlight` flag in `tick`, skipped if set; also skip when `disconnecting`, and await the running tick in `disconnect` before `client.destroy()`.
  - Fixed (in-flight part only): `client.ts` skips a minute's tick while the previous one is still running. Open: the skip when `disconnecting`, and awaiting the running tick in `disconnect`.
- src/discord/event-reminders.ts:76 - `isOnServer` is one REST `members.fetch` per Interested Member that has a Link. Fine for small lists; use the already cached/`list` data if a reminder ever has hundreds.
  - Fixed: `EventReminderServer.membersOnServer` checks all linked Interested Members in one pass over the REST member list (no gateway request), and skips the read when there are none. `isOnServer` stays on the port for the adapter's own test; reminders no longer call it.
- src/discord/events.ts:162 / event-reminders.ts:101 - An Event whose start is moved after a reminder was sent is not re-reminded (sent keyed by lead only); also a refused (creator not allowed) Event is re-logged on every edit. Note in spec or key sent reminders by start.
  - Open: not in this change.

## Nit
- src/discord/event-texts.ts:37 - Title uses `escapeText` without `fitTitle`; safe today (event names max 100 characters) but `fitTitle` exists for the 256 limit.
  - Fixed: the card title is `fitTitle(escapeText(event.name))`.
- Checked and fine: creator check (Officer by role id; Alliance Event needs the [TAG] role and Link rank R4/R5, "unknown" fails); allowedMentions `parse: []` plus exact users, 80 per message and the 2,000-character fit; fetchSubscribers pages by 100 with `after`; tick costs one `scheduledEvents.fetch` per minute plus sync SQLite reads when nothing is due; per-event try/catch keeps the interval alive and shutdown clears the timer.
