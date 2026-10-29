# Game API

What we know about the Game API: the **Last Asylum Tracker** HTTP API, a third-party tracker for Last
Asylum: Plague. Only the Game API client in `src/game-api/` talks to it (constitution IV). Update this
file whenever something about the API is learned.

Sources: the tracker's docs page (read 2026-10-29), the user's own tests, and three test calls made on
2026-10-29 (`/quota`, `/players/145563254785`, `/alliances/1/NML`). The docs page is partly outdated;
**what was verified by a real call wins**. Field names below are the API's, not our dictionary terms.

## Access

- Base URL: `https://api.lastasylumtracker.com/v1`
- Authentication: `Authorization: Bearer lap_…` (or `X-API-Key: lap_…`) on every request. The key is in
  the `LAP_TRACKER_API_KEY` environment variable (`.env` locally, see `env.example`), never in the
  repository or logs. Created on the tracker's site after a Patreon login.
- Send a normal `User-Agent`: requests without one get a Cloudflare 403 before the key is checked.

## Quota (the "rate limit")

- **2,000 requests per UTC day**: our key is on a paid Patreon membership (since 2026-10-29; free is 1,000). Every `/v1`
  call counts, including `/v1/quota`. Resets at 00:00 UTC. No per-second limit is documented.
- Documented headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset: 00:00 UTC`
  (not yet checked on a real response).
- Verified `/quota` body:
  `{"ok":true,"cached":true,"cache_seconds":600,"quota":{"limit":1000,"used":1,"remaining":999,"patron":false,"resets":"00:00 UTC"}}`
- `429` = daily limit reached. Retrying before the reset is pointless.

## Freshness

- The tracker keeps a profile or roster for **10 minutes** (`cache_seconds: 600`); requests inside that
  window get the same data and still cost quota. Our cache never needs to be shorter than 10 minutes.

## Endpoints

| Endpoint | State | Gives us |
|----------|-------|----------|
| `GET /alliances/{kingdom}/{alliance}` | **verified** (user: by name; us: by tag `NML` on kingdom 1) | the alliance and its full roster with ranks |
| `GET /players/{uid}` | **verified** (2026-10-29) | one player, their alliance, and that alliance's roster with ranks |
| `GET /quota` | **verified** | the quota object only; costs one request |
| `GET /players/name/{name}`, `GET /players/{server}/{name}` | documented, not working for the user so far | a player by name |
| `GET /alliances/name/{name}`, `GET /alliances/{alliance_id}` | documented, not working for the user so far | an alliance by name or id |

Use only verified endpoints in code. A Member is found by uid (In-game Proof, see
[discovery](discovery/initial.md)), so name lookups are not needed for onboarding.

### Player (`/players/{uid}`), verified fields

- Identity: `uid` (= `player_id`), `nick` (= `nick_name`), `kid` (= `sid`, the kingdom number),
  `kingdom_flag`
- Game: `power`, `lv` (= `level`, sanctuary level), `kills`, `vip`, `likes`, `language`, `gender`,
  `skin_name`, `x`, `y`, `first_seen_at`, `last_seen_at` (Unix seconds, fractional)
- Alliance: `aid` (= `union_id`), `alliance_name`, `alliance_abbr`, and an `alliance` object with
  `name`, `abbr`, `power`, `member_count`, `capacity`, `language`, **`leader_id`**, `leader_name`
- **`alliance_members[]`**: the player's whole alliance roster, same fields as below, including
  `rank_label`. The player's own rank is their row in it.
- `ranks`: `{}` in the sample; **not the alliance rank**. Ignore it.
- `history[]`: earlier observations (nick, power, alliance, coordinates, `change_flags`)
- Image paths are relative (`/static/…`) to the tracker's site.

### Alliance (`/alliances/{kingdom}/{alliance}`), verified fields

- `union_id`, `sid` (kingdom), `name`, `abbr`, `power`, `member_count`, `capacity`, `language`,
  `leader_id`, `leader_name`, `bulletin`, `updated_at`
- `members[]`: `uid`, `nick_name`, `power`, `lv`, `kid`, `kills`, **`rank_code` (101–105) and
  `rank_label` (`"R1"`–`"R5"`)**, `online`, `last_online_at`, `joined_at`, `active` (weekly activity),
  `daily_honor`, `daily_tech`, `aid`. `null` means the roster did not include it.

### Rank

The alliance rank R1–R5 **is available**: `rank_label` in `members[]` / `alliance_members[]`. The leader
(R5) is also `leader_id`. When a player has no roster row (no alliance, or the roster misses them), the
rank is unknown and needs approval by the alliance's R5 (see discovery).

**Budget consequence**: one `/players/{uid}` call already returns the player, rank and whole alliance; one
roster call returns a whole alliance. Bulk sync costs about one request per alliance.

## Errors (documented)

| Status | Meaning |
|--------|---------|
| 401 | missing or unknown key |
| 404 | player or alliance not found |
| 409 | more than one match; `matches` lists uid, server, tag or name |
| 429 | daily limit reached |
| 502 | profile could not be prepared |
| 503 | API busy; try again shortly |
| 504 | request took too long |

## Open questions

- Is `quota` in the body of player and alliance responses (docs say yes; not seen in the truncated
  samples)? Check the `X-RateLimit-*` headers on a real response.
- Do `/alliances/{kingdom}/{name}` (full name) and `/{kingdom}/{tag}` behave the same for names with
  spaces? Record fixtures in slice 002.
