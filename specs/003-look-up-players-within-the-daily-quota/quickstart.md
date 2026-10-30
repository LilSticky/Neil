# Quickstart: Look up players within the daily quota

## Prerequisites

- `.env` with slice 002's settings plus `DISCORD_MODERATOR_ROLE_ID` and `DISCORD_KING_ROLE_ID` (role IDs
  on the test server; create `Moderator` and `King` roles there if missing). `GAME_API_CACHE_MINUTES` is
  optional (default 10).
- Wispbyte stopped while running locally (only one bot application).

## Automated

```powershell
npm run typecheck; npm run lint; npm run test
```

Covers: cache hit/miss/expiry and in-flight sharing (fake clock), Daily Quota rules, persistence across a
reopened database, 429 and spent behaviour, retry counts and pauses, `/quota` for Officers and others,
card footers and the spent message.

## On the test server

1. `npm run commands:register`, then `npm run dev`.
2. `/player 145563254785` twice within a minute: same card, same `as of` time.
3. As a Member with the Moderator or King role: `/quota`: used went up by exactly 1 for step 2.
4. As a Member without either role: `/quota`: the refusal, nothing else.
5. Stop and start Neil; `/quota` shows the same used count.
6. Record the result in `tasks.md` (Definition of Done, gate 2).
