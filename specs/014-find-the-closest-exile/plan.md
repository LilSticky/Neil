# Implementation Plan: Find the closest Exile (REAPER)

**Branch**: `014-find-the-closest-exile` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

As in slices 009–013 the plan is short and holds its decisions here. This slice adds a table and a command, so the
data model is in [data-model.md](data-model.md), the command in [contracts/reaper-command.md](contracts/reaper-command.md)
and the checks in [quickstart.md](quickstart.md). No research.md: the open questions were settled on #35 and in the
spec's Clarifications. Implementation starts after slice 013 is merged; rebase this branch on `main` first.

## Summary

A `reaper` table holds Exiles by uid. One `/reaper` command with four subcommands: `add` and `remove` for Members whose
Link says R5 in a Home Kingdom Alliance (checked from storage, before any Game API request), `closest` and `list` for any
Member. `closest` reads the caller's Player and every Exile in that Kingdom through the caching Game API client with
the `lookup` purpose, ranks them by distance (shielded ones left out), and answers privately with player cards, three
per page; `all:true` pages through every Exile. Exiles that cannot be read are ranked by their stored position.

## Technical Context

TypeScript (strict), Node, discord.js, Vitest, SQLite (`node:sqlite`, migration 11). Game API: `/players/{uid}` and
`/players/name/{name}` / `/players/{kingdom}/{name}`, already in the client and cache (10 min). No new intents or
permissions. Scale: tens of Exiles per Kingdom; a cold `closest` costs 1 + (Exiles in the Kingdom) requests from the
lookup budget, a warm one 0.

## Decisions

- **D1 Domain** `src/domain/exile.ts` (pure):
  - `Exile` (see data model); `exileReasonOf(text)`: trimmed, 1–200 characters, else a refusal.
  - `mayChangeReaper({ allianceRank, allianceKingdom }, homeKingdom): boolean`: rank `R5` (from the Game API or a Rank
    Approval) and the Alliance's Kingdom is the Home Kingdom. Unknown rank, no Alliance or no Link → false.
  - `Position = { x, y }`; `distance(a, b)`: straight line (`Math.hypot`).
  - `rankExiles(origin, kingdom, callerUid, candidates)`: each candidate is an Exile with either a fresh read (`Player`)
    or only its stored position; drops those in another Kingdom, those shielded, the caller's own uid and those with no
    position at all; orders by distance, ties by earlier `addedAt`. Returns the ranking plus the counts left out
    (unreadable, shielded).
- **D2 Shield**: the schema reads `shielding` leniently into `PlayerDetails.shielded: boolean | undefined` (non-zero →
  `true`, 0 → `false`, missing → `undefined`). `rankExiles` drops only `true`. Because 0 has never proven anything,
  every `closest` answer carries the note that Neil cannot see shields reliably.
- **D3 Storage** `src/storage/reaper-store.ts`: `ReaperStore` with `add(draft)` → `"added" | "already"`,
  `remove(uid)` → `"removed" | "not-an-exile"`, `all()` (newest first), `inKingdom(kingdom)`, `find(uid)`,
  `refresh(uid, { name, kingdom, position, readAt })`. Rows validated with zod on the way out, like `link-store.ts`.
  The editor check reads `link` (rank) and `applied` (`alliance_kingdom`) through the existing stores; an
  `editorOf(memberId)` helper composes them for `mayChangeReaper`.
- **D4 Game API reads** (`src/discord/reaper.ts`, `closest`): the origin is the caller's Linked Player from
  `getPlayer(linkedUid, "lookup")` unless x and y are given (no Link and no x/y → ask for them; no Link with x/y → Home
  Kingdom; the Linked Player unreadable and no x/y → ask for them). Then `getPlayer(uid, "lookup")` for each Exile of the
  Kingdom, at most 4 at a time. A found answer refreshes the row; a quota refusal stops further reads (the rest use
  stored positions); an error or not-found uses the stored position. When the quota is spent and no Exile has a stored
  position, the usual `lookupMessages` quota text is shown. The Quota Reserve is never used (`lookup` purpose).
- **D5 Add**: refuse a bad reason first, then `findPlayer(name, kingdom, "lookup")`; a 409 opens a pick list.
  `PickChoice` gains `{ kind: "exile", matches, reason }` so the pick carries the reason; picking reads the Player by
  uid and stores it. Not found → message, nothing stored. The stored position comes from that read.
- **D6 Replies**: every `/reaper` reply is ephemeral; `closest` and `add` are deferred. `closest`: one header embed
  (origin, Kingdom, shield note, counts left out) plus up to 3 Exile embeds: `renderPlayerCard` plus fields for
  coordinates, distance, reason and date exiled; a stored position is marked "position as of …" and shown without a
  fresh card (name, Kingdom, coordinates only). Paging with Previous/Next buttons on a memory-only session
  (`ReaperPages`, like `PickSessions`: 15 min, 500 max, owner only); pages redraw from the ranking already made, with no
  new read. Without `all` only page 1 (3 closest) is shown. `list`: one embed per page of 20 lines (name, Kingdom,
  reason, date), newest first, same paging. Texts in `src/discord/reaper-texts.ts`.
- **D7 Remove**: autocomplete on the `exile` option from `ReaperStore.all()` (name and Kingdom shown, uid as value), no
  request. A typed value that is not a known uid → "not an Exile".
- **D8 Log**: add and remove post one line to the log channel naming the Exile (name, uid, Kingdom), the reason (on
  add) and the R5 as a mention. This is the only place the adder appears.
- **D9 Docs**: DICTIONARY (done), GAME-API.md (`shielding` now read, still unproven), TEST-RUN.md REAPER manual check,
  ROADMAP row 014, STATUS. No ADR: storage, client and command patterns follow the existing ADRs unchanged.

## Constitution Check

- I Domain-driven slicing: named after what a Member does; Exile and REAPER approved in DICTIONARY.md. ✅
- II TDD: every task red → green; Game API and Discord through the existing fakes and recorded fixtures. ✅
- III Framework-free domain: `exile.ts` is pure. ✅
- IV Game API: only through the rate-limited caching client, `lookup` purpose, never the Quota Reserve; cost bounded
  by the number of Exiles in one Kingdom and cached 10 minutes. ✅
- V Least privilege: no new Discord permissions; editing limited to Home Kingdom R5s, checked server-side; the adder is
  hidden from Members. ✅
- VI Context: STATUS, ROADMAP, GAME-API, TEST-RUN, DICTIONARY updated. ✅
- VII Small slice: one table, one command; P1 stories (add, closest) ship first, remove and list follow. ✅

Post-design re-check: unchanged, no violations.

## Project Structure

New: `src/domain/exile.ts`, `src/storage/reaper-store.ts`, `src/discord/reaper.ts`, `src/discord/reaper-texts.ts`,
`src/discord/reaper-pages.ts` (+ tests). Changed: `src/storage/database.ts` (migration 11), `src/game-api/schemas.ts`
and `src/domain/player.ts` (`shielded`), `src/discord/commands.ts` (`/reaper`), `src/discord/pick-sessions.ts` and
`pick.ts` (`exile` choice), `src/discord/client.ts` (routing: `reaper:` buttons, autocomplete), `src/main.ts`
(composition), and their tests and fakes.
