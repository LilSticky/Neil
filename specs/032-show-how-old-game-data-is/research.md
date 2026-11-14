# Research: Show how old game data is

## R1 Which time is a Player's age?

- **Decision**: `map_updated_at` of the player body (Unix seconds, fractional) is the Player's "as of".
- **Rationale**: measured 2026-11-14 on Kingdom 330 (GAME-API.md › Freshness › Two clocks): `age_seconds` and
  `?fresh=1` only concern the tracker's answer copy; game data changes only through a Map Refresh, and
  `map_updated_at` is the last one that changed the Player. The user chose it (spec decision 1).
- **Alternatives**: the Kingdom's last Map Refresh from the site's `/api/map` (exact, but not the documented API, ~1 MB,
  constitution IV); `last_seen_at` (moves on every live lookup, not a game time).
- **Caveat**: an upper bound on age; a Player unchanged by later refreshes keeps an older time. The hint then shows more
  often than strictly needed, which is the safe side.

## R2 Which time is an Alliance's age?

- **Decision**: none (`undefined`); Alliance cards and the Overview always carry the hint and button.
- **Rationale**: `updated_at` equals the moment of the lookup (verified on Ratz, Kingdom 330); roster rows carry no map
  time. The user chose this (Clarifications).

## R3 What does `live` mean now?

- **Decision**: `live` = skip Neil's cache and ask with `?fresh=1`; used only by Look again. `copy` is the default.
  The cache stores every found answer (also live ones) with its `storedAt`; `get` counts only from `storedAt`.
- **Rationale**: after a Map Refresh, both Neil's cache (`GAME_API_CACHE_MINUTES`) and the tracker's 60-minute copy can
  hold the pre-refresh data; only a live request past both reads the new data.

## R4 How does the Look again button know what to repeat?

- **Decision**: a stateless custom id: `again:<owner id>:p:<uid>` (Player card), `again:<owner id>:a:<kingdom>:<tag>`
  (Alliance card), `again:<owner id>:o:<kingdom>:<tag>` (Alliance Overview), `again:<owner id>:r:<x>:<y>` or
  `again:<owner id>:r` (`/reaper closest` with or without given coordinates). At most ~60 characters (limit 100,
  DISCORD-PLATFORM.md).
- **Rationale**: pick sessions live 15 minutes and die on restart; a Member may need longer (cooldown up to 30 minutes
  plus the refresh). The id carries everything; the owner check needs no state.
- **Alternatives**: a pick session per card (expires, lost on restart).

## R5 How is the press answered?

- **Decision**: `deferUpdate` at once, then the lookup with `live`, then `editReply` of the same message with the new
  card (its own field and button when still old). A failure or refusal is told privately as a follow-up; the old card
  stays. A non-owner gets the private refusal used by other card buttons. Charged like the original lookup:
  `chargedTo(caller)` for cards and the Overview; `/reaper closest` reads stay uncharged, as REAPER is today.
- **Rationale**: the 3-second rule; updating in place keeps one card per lookup.

## R6 Where does the hint go on a card?

- **Decision**: an embed field "Newer data" as the last field: "Use **Update Map** on the [Kingdom N map](link), wait
  until it has finished, then press 🔄 Look again." Without a Kingdom, the link is the tracker's map page without `kid`.
  The 🔄 Look again button sits in its own action row below existing components (a card has at most 2 rows today).
- **Rationale**: embed fields render links; footers do not.

## R7 REAPER

- **Decision**: a read's `readAt` is the Player's map time; without one, the moment Neil received the answer (REAPER
  must store a time). `/reaper closest` carries the hint (Home Kingdom or the measured Kingdom) and the button when any
  ranked position on the page is old. `/reaper add` shows no game data and gets neither; `/reaper list` shows stored
  data, not a lookup, and keeps only its times.
