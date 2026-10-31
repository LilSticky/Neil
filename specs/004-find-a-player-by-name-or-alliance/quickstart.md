# Quickstart: Find a player by name or alliance

How to prove slice 004 works. Contracts: [contracts/commands.md](contracts/commands.md).

## Prerequisites

- `.env` as for slice 003; optionally `GAME_API_QUOTA_RESERVE` (default 100).
- Wispbyte's Neil stopped while running locally (one bot application).
- After the merge: `npm run commands:register` once, so the new options appear.

## Automated

```powershell
npm run typecheck; npm run lint; npm run test
```

Covers: name parsing, roster order, reserve rule, pick sessions (owner, expiry, pages), the client's new
endpoints with recorded bodies and a fake `fetch`, and the handlers with fake interactions.

## On the test server (`npm run dev`)

1. `/player name:drlol` → private pick list with kingdoms 1 and 180; pick one → public card.
2. `/player name:drlol kingdom:1` → the card at once.
3. `/player name:drlo` → private "No player is named …".
4. `/player uid:… name:…` → private "Give a uid, or a name …"; `/quota` shows no new request.
5. `/alliance kingdom:1 alliance:NML` → card with the roster by rank and uids; select menu with page buttons
   if more than 25; pick a member → public Player card.
6. `/alliance name:No Man's Land` → the same card.
7. Another Member (or a second account) uses the roster menu → private "Only the Member who ran this
   command …".
8. `/quota` as an Officer → the Quota Reserve line.
9. Reserve: set `GAME_API_QUOTA_RESERVE` just under the remaining requests shown by `/quota`, restart, look
   up something new twice → the second is refused with the reserve message; a cached lookup still shows
   its card. Reset the variable afterwards.

Record the result in `tasks.md`.
