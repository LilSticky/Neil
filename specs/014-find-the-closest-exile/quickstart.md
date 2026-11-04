# Quickstart: checking Find the closest Exile

## Automated

`npm run typecheck && npm run lint && npm run test`: domain (`exile.test.ts`: reason rule, editor rule, distance,
ranking with ties, shielded, other Kingdom, caller excluded, stale positions), storage (`reaper-store.test.ts`,
migration 11), Discord (`reaper.test.ts` with the Game API fakes and recorded fixtures: every acceptance scenario of
the spec, quota spent mid-read, reads served from cache).

## Manual, on the test server (TEST-RUN.md, REAPER)

Prerequisites: slice 013 merged; the tester Linked to the R5 of a Home Kingdom Alliance; a second Member who is not.

1. `/reaper add name:<a real Player> reason:test` as the R5 → private confirmation, one log line with the R5.
2. Same as the other Member → refused; `/quota` shows no request used.
3. `/reaper closest` → up to 3 cards with coordinates, distance, reason, date, and the shield note; no adder shown.
4. Run it again within 10 minutes → same answer, `/quota` unchanged.
5. `/reaper closest x:500 y:500 all:true` → paged by distance from 500,500.
6. `/reaper list` → all Exiles, newest first.
7. `/reaper remove exile:<pick>` → gone from `list`, log line.
