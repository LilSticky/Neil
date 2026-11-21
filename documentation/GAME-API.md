# Game API

What we know about the Game API: the **Last Asylum Tracker** HTTP API, a third-party tracker for Last
Asylum: Plague. Only the Game API client in `src/game-api/` talks to it (constitution IV). Update this
file whenever something about the API is learned.

Sources: the tracker's docs page (read 2026-10-29, again 2026-11-14), the user's own tests, three test calls made on
2026-10-29 (`/quota`, `/players/145563254785`, `/alliances/1/NML`) and three on 2026-11-14 (see Freshness). The docs page is partly outdated;
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

## Two days: the quota day and the game day

- **Server Time is UTC-2 all year**, with no daylight saving (the user, 2026-11-15; evidence: at 18:00 CET the game
  showed 15:00). The game's daily reset is at 00:00 Server Time, which is **02:00 UTC**.
- `daily_honor` and `daily_tech` follow the **game day**: they start again at 02:00 UTC.
- The **quota day** stays the UTC day: the tracker's quota resets at 00:00 UTC (see Quota).
- The Daily Sync runs at `SYNC_HOUR_UTC` = 3 (01:00 Server Time), so it reads the daily values just after they reset,
  when they are near 0. A scoreboard needs a read before 02:00 UTC
  ([#113](https://github.com/LilSticky/Neil/issues/113)).
- In code, `src/domain/server-time.ts` (`serverDayOf`, `nextServerReset`) is the game day, and `utcDayOf` in
  `src/domain/daily-quota.ts` is the quota day.

## Freshness

**Changed 2026-11-14** (the tracker's "much faster responses" update; verified the same day on
`/players/145563254785` and `/alliances/1/NML`):

- The tracker answers at once from **its own copy**, kept for 60 minutes (`cache_seconds: 3600`). An older copy is
  still served at once, and a newer one is fetched in the background for the next request. Copies seen:
  **160,263 s (≈ 44 h)** for a player, 12,503 s (≈ 3.5 h) for `NML`. Before the update nothing was older than 10 minutes.
- Every player and alliance answer carries, **at the top level** next to `quota`: `age_seconds` (seconds since the game
  sent the copy; 0 for live data), `refreshing` (true while a newer copy is on its way), `cached`, `cache_seconds`.
- **`?fresh=1`** on any player or alliance GET waits for a live game lookup (documented 1–2 s, measured 0.12 s). It costs
  one request like any other. Not offered on `/quota`.
- Header `x-cache`: `hit` (copy under 60 min), `stale` (older, refresh queued), `miss` (first lookup, waited for the
  game), `live` (`?fresh=1`).
- Answers come gzip-compressed (`content-encoding: gzip`); Node's fetch decodes them.
- Since slice 032, Neil takes the tracker's copy for every lookup and asks with `?fresh=1` only when a Member presses
  🔄 Look again on a card (after using Update Map); that press also skips Neil's own cache. A Player's "as of" is their
  `map_updated_at`; an Alliance has none. Neil no longer reads `age_seconds` (slice 031 used it, the wrong clock, see
  below).

### Two clocks: the answer copy and the map refresh

**Learned 2026-11-14**, from the user and measured on Kingdom 330 (before/after one map refresh, 22:57–22:59 UTC):

- `age_seconds`, `cached`, `cache_seconds`, `x-cache` and `?fresh=1` describe only the tracker's **copy of its own answer**.
  They say nothing about when the game data was gathered. A `?fresh=1` answer (`age_seconds: 0`, `x-cache: live`)
  had the same Might, position and kills as the copy, and an unchanged `map_updated_at`; only `last_seen_at` moved
  (it is set on every live lookup, so it is not a data age either).
- The game data (Might, position, kills, level, Alliance) comes from the tracker's **map refresh** of a whole Kingdom.
  It runs only when someone presses **Update Map** on the tracker's map page (`/map?kid=<kingdom>`). The page calls
  `POST /api/map/update?kid=<kingdom>&token=<random client token>`; from a script the tracker answers
  `{"detail":"Refresh only from the site"}`, so **Neil cannot start one**.
- Cooldowns: **30 minutes per Kingdom** (`cooldown_remaining_sec`/`cooldown_total_sec: 1800`) and **30 minutes per IP**
  (`ip_cooldown_*`), readable without login at `GET /api/map/update/status?kid=<kingdom>&token=<any>`. A press queues
  a job (`job.status` `queued` → `running`, `progress_pct`, `tiles_done`/`tiles_total`, `cities_seen`). Kingdom 330's
  job crawled 2,117 tiles and about 14,250 cities in about 50 seconds. `updates_paused` hides the button.
- When the Kingdom was last refreshed: `stats.last_updated_at` (Unix seconds) in the site's `GET /api/map?kid=<kingdom>`.
  This endpoint is the website's, not the documented `/v1` API; Neil does not use it (constitution IV: only the client).
- A player's `map_updated_at` is when the map refresh last **changed** that player's record, not when it last saw it.
  After the refresh at 22:58, one of five sampled players had `map_updated_at` 22:58; the others kept 22:13 or even
  12:59, although their data was confirmed at 22:58. So `map_updated_at` is an upper bound on age, not the age.
- Consequence for Neil: the card's "as of" (receive moment minus `age_seconds`) shows when the tracker copied its
  answer, e.g. "as of 03:01 UTC" for data that may be much older, and `?fresh=1` costs a request without fresher game
  data. Fixed in slice 032 (issue #100).

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
[discovery](discovery/initial.md)); name lookups serve `/player` and `/alliance` (slice 004), and the Onboarding Interview's Recommended Player (slice 005: one `/players/name/{name}` per Interview, Quota Reserve). There is
no approximate (fuzzy) name search in the API; Neil matches Known Alliances itself (slice 007), recorded from every fresh answer that shows a Home Kingdom Alliance.

### Player (`/players/{uid}`), verified fields

- Identity: `uid` (= `player_id`), `nick` (= `nick_name`), `kid` (= `sid`, the kingdom number),
  `kingdom_flag`
- Game: `power`, `lv` (= `level`, sanctuary level), `kills`, `vip`, `likes`, `language`, `gender`,
  `skin_name`, `x`, `y`, `first_seen_at`, `last_seen_at`, `map_updated_at` (Unix seconds, fractional; see Freshness)
- Alliance: `aid` (= `union_id`), `alliance_name`, `alliance_abbr`, and an `alliance` object with
  `name`, `abbr`, `power`, `member_count`, `capacity`, `language`, **`leader_id`**, `leader_name`.
  `leader_id` is read since slice 005 as the Alliance leader's uid, leniently (a number or a digit string;
  nullish means no leader).
- **`alliance_members[]`**: the player's whole alliance roster, same fields as below, including
  `rank_label`. The player's own rank is their row in it. Slice 026 read `online` and `last_online_at` here for
  the Booty Call; both are gone since 2026-11-21 (see Dropped fields), and the roster now only decides who is reached.
- `ranks`: the Player's places on the Kingdom leaderboards, e.g. `{"power":{"rank":3,"score":"103886869"},"kills":{…},"heroes":{…}}` (seen 2026-11-15 on Kingdom 330; `{}` in older samples). **Not the alliance rank, and no title**: the API has no field for the King or the Royal City.
- `history[]`: earlier observations (nick, power, alliance, coordinates, `change_flags`)
- Image paths are relative (`/static/…`) to the tracker's site.

### Alliance (`/alliances/{kingdom}/{alliance}`), verified fields

- `union_id`, `sid` (kingdom), `name`, `abbr`, `power`, `member_count`, `capacity`, `language`,
  `leader_id`, `leader_name`, `bulletin`, `updated_at`
- `members[]`: `uid`, `nick_name`, `power`, `lv`, `kid`, `kills`, **`rank_code` (101–105) and
  `rank_label` (`"R1"`–`"R5"`; titled R4s read e.g. `"R4 – Diplomat"`, `"R4 – Militarist"`, seen 2026-11-01; some player answers omit `rank_label` in `alliance_members`)**, `online`, `last_online_at`, `joined_at`, `active` (weekly activity, used by the Alliance Overview, slice 008),
  `daily_honor`, `daily_tech` (per game day, see Two days), `aid`. `null` means the roster did not include it.

### Rank

The alliance rank R1–R5 **is available**: `rank_label` in `members[]` / `alliance_members[]`. The leader
(R5) is also `leader_id`. When a player has no roster row (no alliance, or the roster misses them), the
rank is unknown and needs approval by the alliance's R5 (see discovery).

**Budget consequence**: one `/players/{uid}` call already returns the player, rank and whole alliance; one
roster call returns a whole alliance. Bulk sync costs about one request per alliance.

### Stability check (2026-11-02)

Live sample: `/alliances/1/NML` and three of its members by uid (4 requests), compared with the fixtures.

- **Stable** (always present, same type, clear meaning; shown on cards since slice 012): player `kills`, `vip`,
  `likes`, `language`, `last_online_at` (equals the roster's value; dropped since, see below), `x`/`y`, `avatar_url`, `server_badge_url`,
  `alliance_badge_url`; alliance `level`, `exp`, `gift_level`, `rank` (`{"rank":24,"score":"240337604"}`: the score
  is a string and equals the alliance's power, so `rank` is its power rank in the kingdom), `join`
  (`{"auto":true,"power":0,"castle_level":0}`), `language`, `badge_url`, `server_badge_url`; roster rows `power`.
- **Read but unproven** (slice 014, REAPER): `shielding`, always 0 in every sample. Neil reads a non-zero number as
  shielded and leaves that Exile out of `/reaper closest`; 0 proves nothing, so answers say shields cannot be seen.
  Record it here if a non-zero value is ever seen.
- **Not stable / unclear** (not used): `gender`, `skin_name`, `avatar_name` (often `""`), `shield_type`
  (always 0), `power_breakdown` (always `[]`), `history` (only `change_flags: "power"` seen; empty for some players),
  `bulletin`/`declaration` (always `""`), `live` (always `true`, meaning unknown), `first_seen_at`/`last_seen_at`
  (the tracker's own times), `hq_skin`, `icon_id`, `frame_id`/`frame_url`.
- **Pictures**: the `/static/…` paths load from `https://lastasylumtracker.com` (also `api.` and `www.`): 200
  `image/png`, without a key and without using quota.
- `/players/180/drlol` answered **404** `{"detail":"Not Found"}` (the kingdom-180 drlol of 2026-10-30 is gone or renamed).

### Dropped fields (2026-11-21)

Verified on `/players/145563254785?fresh=1` and `/alliances/1/NML` (with and without `?fresh=1`): the player answer no
longer has `last_online_at` at all, every roster row has `last_online_at: null`, and `online` is `false` on every row.
The game itself stopped giving the value. Neil no longer reads either field (issue
[#169](https://github.com/LilSticky/Neil/issues/169)): no Last Online on cards, no online counts or Last Online column in
the Alliance Overview, and Discord presence alone decides who is online for a Booty Call. Roster rows still carry `joined_at`
(`null` in the sample) and `active`.

## Errors

Seen on real calls (2026-10-29): a 404 body `{"detail":"alliance_not_found"}` (JSON, at once); a
**Cloudflare 504 after ~45 s** with the plain-text body `error code: 504` on `/players/{uid}` and
`/alliances/1/NML` for several minutes. Error bodies are not reliably JSON, so map by status code.

Documented:

| Status | Meaning |
|--------|---------|
| 401 | missing or unknown key |
| 404 | player or alliance not found |
| 409 | more than one match; the body is `{"detail":{"error":"ambiguous","matches":[…]}}` (recorded on `/players/name/drlol`, 2026-10-31; the docs page put `matches` at the top level), each match with uid, server, tag or name. The alliance-name 409 is not yet seen; Neil reads both forms |
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
