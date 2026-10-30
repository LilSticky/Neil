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
- Headers, **verified on `/quota`** (2026-10-29): `x-ratelimit-limit: 1000`, `x-ratelimit-remaining: 990`,
  `x-ratelimit-reset: 00:00 UTC`. Not sent on a 404 or a Cloudflare 504.
- On 2026-10-29 the key still reported `limit: 1000`, `patron: false`; after the user logged in again
  with Patreon on 2026-10-30 the limit is **2,000** (patron). Budget with `x-ratelimit-limit`, not a
  constant: the tier can change.
- Failed calls count too: three 504s and a 404 raised `used` by one each.
- Verified `/quota` body:
  `{"ok":true,"cached":true,"cache_seconds":600,"quota":{"limit":1000,"used":1,"remaining":999,"patron":false,"resets":"00:00 UTC"}}`
- `429` = daily limit reached. Retrying before the reset is pointless.
- Since slice 003 Neil adopts the body's `quota` (else the headers) after every answer; on the test server
  (2026-10-30) the adopted `used` matched the tracker's own count, including requests made outside Neil.

## Freshness

- The tracker keeps a profile or roster for **10 minutes** (`cache_seconds: 600`); requests inside that
  window get the same data and still cost quota. Our cache never needs to be shorter than 10 minutes.

## Endpoints

| Endpoint | State | Gives us |
|----------|-------|----------|
| `GET /alliances/{kingdom}/{alliance}` | **verified by tag** (`NML` on kingdom 1); by full name (`No Man's Land`, URL-encoded) it gave **404** on 2026-10-29 | the alliance and its full roster with ranks |
| `GET /players/{uid}` | **verified** (2026-10-29) | one player, their alliance, and that alliance's roster with ranks |
| `GET /quota` | **verified** | the quota object only; costs one request |
| `GET /players/name/{name}`, `GET /players/{server}/{name}` | **verified** (2026-10-30): exact nick, case-insensitive; same body as `/players/{uid}`. A name shared by several players gives **409** with `matches` (`uid`, `server`, `name`), also across kingdoms (`drlol` → kingdoms 1 and 180); `{server}` narrows to one kingdom. No partial match (`drlo` matched only nicks equal to it) | a player by name |
| `GET /alliances/name/{name}` | **verified for the exact full name** (`No Man's Land`, URL-encoded, 2026-10-30); a part of the name gave 404 `alliance_not_found`, the tag (`NML`) gave 502 | an alliance and its roster by full name |
| `GET /alliances/{alliance_id}` | documented, not tried | an alliance by id |

Use only verified endpoints in code. A Member is found by uid (In-game Proof, see
[discovery](discovery/initial.md)); name lookups serve `/player` and `/alliance` (slice 004). There is
no approximate (fuzzy) name search in the API.

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

## Errors

Seen on real calls (2026-10-29): a 404 body `{"detail":"alliance_not_found"}` (JSON, at once); a
**Cloudflare 504 after ~45 s** with the plain-text body `error code: 504` on `/players/{uid}` and
`/alliances/1/NML` for several minutes. Error bodies are not reliably JSON, so map by status code.

Documented:

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

- Answered 2026-10-29: `quota` **is** in player and alliance bodies (with `cached`, `cache_seconds`);
  `x-ratelimit-*` headers verified on `/quota`. Full alliance names give 404 on
  `/alliances/{kingdom}/{alliance}`; use the tag there, or `/alliances/name/{name}` for the full name.
- **Unknown uids answer 502 after ~10 s** (`/players/1`, `/players/999999999999`, 2026-10-29), body
  `error code: 502`; a 404 for a player has not been seen. Neil waits 15 s and treats a player 502 as
  "maybe unknown uid" (slice 002, research R11).
- `uid`, `kid`, `aid` are JSON numbers; uids up to 12 digits so far, safely inside JavaScript's
  integer range.
