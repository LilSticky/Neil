# Quickstart: Look up a player

How to check slice 002 end to end.

## Automated

```powershell
npm run typecheck; npm run lint; npm run test
```

Tests replay recorded Game API answers from `src/game-api/__fixtures__/`; none touches the network.

## Record fixtures (when the tracker answers)

```powershell
npx tsx scripts/record-fixtures.ts
```

Needs `LAP_TRACKER_API_KEY` in `.env`; costs about 5 requests of the daily quota. Review the diff before
committing (no key ever appears in a body).

## On the test server

1. Stop the Wispbyte server (only one copy of Neil may run), then `npm run commands:register` and
   `npm run dev`; or deploy through `main` and restart Wispbyte.
2. `/player uid:145563254785` → a public card with name, uid, Kingdom, power, sanctuary level, Alliance
   and Alliance Rank.
3. `/player uid:abc` → a private help text on finding the uid; no Game API request.
4. `/player uid:1` → a private "No player has the uid 1."
5. `/alliance kingdom:1 alliance:NML` → a public Alliance card.
6. `/alliance kingdom:1 alliance:ZZZQX` → a private "No alliance …".
7. Record the result in `tasks.md` (Definition of Done).
