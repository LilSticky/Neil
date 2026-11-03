# Quickstart: check slice 005 on the test server

Contracts: [contracts/interview.md](contracts/interview.md).

## Prerequisites (once, by the user)

1. Developer Portal → Neil → Bot → switch on **Server Members Intent**.
2. On the test server, create `#onboarding` and `#neil-log`. In `#onboarding`, give Neil View Channel, Send
   Messages in Threads, Create Private Threads and Manage Threads; give the Moderator and King roles Manage
   Threads. In `#neil-log`, give Neil View Channel and Send Messages.
3. In `.env` (and later the Wispbyte panel): `DISCORD_ONBOARDING_CHANNEL_ID`, `DISCORD_LOG_CHANNEL_ID`, and
   for the check `INTERVIEW_TIMEOUT_MINUTES=3`.
4. `npm run commands:register` (adds `/interview`), then `npm run dev` (Wispbyte stopped).

## Automated

`npm run typecheck && npm run lint && npm run test`: all green.

## Manual scenarios (second Discord account = "the joiner")

1. **Link**: the joiner joins → a private thread `Interview – …` appears in `#onboarding` → `Give my uid` →
   a real uid → card → `That's me` → "Done" in the thread, 🔗 line in `#neil-log`.
2. **Refused**: `/interview` with a second account (or after unlinking in the db) → give the same uid →
   "already linked", ⛔ line.
3. **Wrong input**: give `abc` (asked again, no try lost), an unknown uid (try lost), `That's not me`
   (try lost).
4. **Rank Approval**: a uid whose Player has no rank in the roster (or the Officer path, if none is at hand:
   check with an automated test) → Officers asked → an Officer presses `R3` → "set … to R3", 🎖️ line; the
   joiner's own press is refused.
5. **Timeout**: `/interview` with an unlinked account, wait 3 minutes → closed, locked, 💤 line.
6. **Leave**: start an Interview, leave the server → closed (left).
7. **Restart**: start an Interview, stop and start Neil → `Give my uid` still works.
8. Set `INTERVIEW_TIMEOUT_MINUTES` back (or remove it) afterwards.
