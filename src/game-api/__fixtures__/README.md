# Game API fixtures

Bodies recorded from the live Game API with `scripts/record-fixtures.ts` on 2026-10-29, then trimmed by
hand to keep personal data minimal (constitution V): rosters cut to three rows (the Player's own row kept),
`history` cut to one entry. Values are otherwise unchanged.

| File | Request | Status |
|------|---------|--------|
| `player-in-alliance.json` | `GET /players/145563254785` | 200 |
| `alliance.json` | `GET /alliances/1/NML` | 200 |
| `alliance-not-found.json` | `GET /alliances/1/ZZZQX` | 404 |

Not recordable so far: `GET /players/1` answered **502**, not 404. Tests build other cases (no alliance,
409 matches, player 404) from these files in code and say so.
