# Research: Find a player by name or alliance

Decisions for slice 004. Sources: [spec.md](spec.md), [GAME-API.md](../../documentation/GAME-API.md), the slice 003
code (`src/game-api/client.ts`, `quota-keeper.ts`, `src/discord/lookup.ts`).

## R1: Command options

- **Decision**: `/player` gets three optional options: `uid` (string), `name` (string, max 32), `kingdom`
  (integer 1–9999). `/alliance` gets three optional options: `kingdom`, `alliance` (tag, max 40) and `name`
  (full name, max 40). Neil checks the combination itself (FR-001, FR-004) and answers a wrong one privately
  before any request.
- **Rationale**: Discord cannot express "exactly one of"; subcommands (`/player uid`, `/player name`) would
  change the command Members already know. A `kingdom` given with a `uid` is ignored (the uid fixes the
  Kingdom), so a Member is not refused for extra precision.
- **Alternatives**: subcommands (rejected: breaks habits, more registration); autocomplete on names
  (rejected: every keystroke would cost quota).

## R2: Player Name input

- **Decision**: a domain `PlayerName` brand made by `parsePlayerName`: trimmed, 1–32 characters, not only
  dots (same path-segment reason as `AllianceKey`). Sent with `encodeURIComponent`. The cache key is the
  lower-cased name plus the Kingdom or `*`.
- **Rationale**: the Game API matches the exact nick case-insensitively (GAME-API.md); the slash option caps
  the length anyway.
- **Alternatives**: Unicode case folding beyond `toLowerCase` (rejected: the tracker's own folding is unknown;
  a miss costs one request, never a wrong card).

## R3: Endpoints and answers

- **Decision**: `GET /players/name/{name}` without a Kingdom, `GET /players/{kingdom}/{name}` with one,
  `GET /alliances/name/{name}` for a full Alliance name. A 200 is read with the existing `playerBodySchema` /
  `allianceBodySchema`; a 409 with the existing lenient `ambiguousBodySchema`. 404 → not-found; 502 →
  not-prepared (Player) or try-again (Alliance), as for uid and tag lookups.
- **Rationale**: all three verified on 2026-10-30, same bodies as the uid/tag endpoints.
- **Open**: the 409 body of `/alliances/name/{name}` was not seen; the lenient schema accepts it. A match
  without Kingdom and tag cannot be picked and is left out of the pick list (logged once per answer).

## R4: Alliance Roster

- **Decision**: `allianceBodySchema` gains `members[]` (`uid`, `nick_name`, `rank_label`, all lenient:
  `nick_name` nullish → "Unknown"; a row without uid is dropped). The domain `Alliance` gains
  `roster: readonly RosterEntry[]`, and a pure `sortRoster` orders R5…R1, unknown, then Player Name
  (case-insensitive, then uid). `rankFromLabel` (from `alliance-rank.ts`) maps labels.
- **Rationale**: one request already returns the whole roster (GAME-API.md, "Budget consequence").

## R5: Showing the roster on the card

- **Decision**: rows `R5 · Name · 123456789` in embed fields, one field group per rank, each field at most
  1,024 characters (split into "R1 (cont.)" when longer). If the whole embed would pass Discord's 6,000
  characters, the last rows are replaced by "… and N more, see the menu below". The select menu always
  covers the whole roster.
- **Rationale**: up to 100 rows of ~45 characters fit within 6,000 in practice; the menu is the fallback.
- **Alternatives**: several messages (rejected: noise); a file attachment (rejected: not copyable on phones).

## R6: Pick lists and sessions

- **Decision**: one adapter-level `PickSessions` store in `src/discord/` holds, per pick list, the owner's
  user id, what can be picked (Player matches, Alliance matches, or a roster), the current page and its
  creation time. Component custom ids are `pick:<sessionId>:<action>` (`select`, `page:<n>`), well under
  Discord's 100 characters. A session lives 15 minutes (configurable in code, injected clock); an unknown or
  expired session answers privately "run the command again". Sessions are memory-only; a restart ends them
  (same message). At most 500 sessions; the oldest is dropped.
- **Ownership**: every component interaction is checked against the session's owner before anything else;
  anyone else gets a private note and no request is made (FR-008, SC-005).
- **Rationale**: no Game API data in custom ids, no re-fetching to turn a page (page turns cost no quota),
  and the owner check is a pure function over the session.
- **Alternatives**: encoding the roster in custom ids (rejected: 100-character limit); re-reading the roster
  from the client cache on each page turn (rejected: an expired entry would cost a request).

## R7: Where the pick lists appear

- **Decision**: a "several matches" answer (Player or Alliance) replaces the thinking placeholder with a
  **private** message: a short text and a select menu of up to 25 matches (by Kingdom, then name), with the
  hint to give a Kingdom when there are more. Picking edits that private message ("Showing …", menu removed)
  and posts the card publicly as a follow-up. The roster menu sits on the **public** Alliance card, with
  "◀ Previous" / "Next ▶" buttons when the roster has more than 25 Players; a pick posts the Player's card as
  a public reply to that component and leaves the Alliance card as it is.
- **Rationale**: a list only the caller can use belongs in a private message; the owner check (R6) still
  guards it and the public roster menu alike.
- **Note**: spec scenario 1.6 is covered by the shared owner check (tested with a fake interaction), even
  though Discord already hides private pick lists from others.

## R8: Quota Reserve

- **Decision**: a domain `RequestPurpose = "lookup" | "onboarding-interview"` and
  `canSendFor(quota, purpose, reserve)`: a lookup may send while `remaining(quota) > reserve`; an Onboarding
  Interview while `canSend(quota)`. `QuotaKeeper.tryCount(purpose)` and the client's retry check use it. The
  client's public methods take the purpose as a required last parameter; the Discord lookups pass `"lookup"`.
  A refusal is a new `LookupResult` kind `reserve-kept` with `resetsAt`, and `orStale` serves a cached answer
  for it as for `quota-spent`.
- **Configuration**: `GAME_API_QUOTA_RESERVE`, a whole number ≥ 0, default 100 (FR-011). At startup, a
  reserve at or above the stored limit is logged as a warning (spec edge case).
- **Rationale**: ADR 4 point 3 asked for a reserve that only interactive onboarding may use; slice 003 left
  the hook (research R10 there). Measuring against `remaining` reuses the adopted Game API figures.
- **Alternatives**: a percentage of the limit (rejected by the user: fixed 100).

## R9: Caching name answers

- **Decision**: a third and fourth cache in the client, both `LookupCache` with the same TTL: Player Name
  answers (a Player or a match list) and Alliance name answers (an Alliance or a match list), each with its
  own `InFlight`. A Player found by name is not also stored under its uid (slice 003's "only the requested
  key" assumption).
- **Rationale**: FR-009; match lists are as stable as profiles within 10 minutes.

## R10: `/quota`

- **Decision**: one extra line: `Quota Reserve: 100 (for Onboarding Interviews) · Left for lookups: N`, where
  N = max(0, remaining − reserve). Still no request.

## R11: No ADR needed

- **Decision**: no new ADR. The reserve implements ADR 4 point 3 as written; the in-memory pick sessions are an
  adapter detail with no stored personal data (constitution V).
