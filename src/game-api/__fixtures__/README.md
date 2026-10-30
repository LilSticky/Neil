# Game API fixtures

Bodies recorded from the live Game API with `scripts/record-fixtures.ts` on 2026-10-29, then trimmed by
hand to keep personal data minimal (constitution V): rosters cut to three rows (the Player's own row kept),
`history` cut to one entry. Values are otherwise unchanged. The exceptions are listed in the table as
**copied** or **hand-written**.

| File | Request | Status |
|------|---------|--------|
| `player-in-alliance.json` | `GET /players/145563254785` | 200 |
| `alliance.json` | `GET /alliances/1/NML` | 200 |
| `alliance-not-found.json` | `GET /alliances/1/ZZZQX` | 404 |
| `player-by-name.json` | `GET /players/name/DrLOL` (copied from `player-in-alliance.json`, same body) | 200 |
| `players-ambiguous.json` | `GET /players/name/DrLOL` | 409 **hand-written** from GAME-API.md ("`matches` lists uid, server, name"; `drlol` on kingdoms 1 and 180). The second uid is invented; not recorded. Replace with a recording when one is made. |
| `alliance-by-name.json` | `GET /alliances/name/No%20Man's%20Land` (copied from `alliance.json`, same body) | 200 **copied**; the name endpoint's body was not recorded separately |
| `alliances-ambiguous.json` | `GET /alliances/name/...` (name shared by two alliances) | 409 **hand-written**: the shape of the alliance 409 is unverified (research R3), so only `matches` with `tag`, `name`, `server` is written. Replace with a recording when one is made. |

Not recordable so far: `GET /players/1` answered **502**, not 404. Tests build other cases (no alliance,
player 404) from these files in code and say so.
