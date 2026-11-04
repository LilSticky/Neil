# Review: slice 014 (T012), `bot-reviewer` on `git diff main...HEAD -- src scripts`

Two `bot-reviewer` runs (2026-11-05), merged. Clean: `src/domain/exile.ts` is pure; REAPER reads go through the
caching, rate-limited client with the `lookup` purpose; `shielding` and stored rows are zod-validated; the editor check
runs before any Game API request; the adder appears only in log lines; every Member-facing reply is ephemeral.

## Must fix

- **R1** `src/discord/reaper.ts` (`recordFoundExile`), `src/discord/reaper-remove.ts`: log lines are sent without
  `allowedMentions`; `escapeText` keeps `@everyone`, `@here`, `<@&id>`, so a Player name or reason could ping the
  server. Send them with no mentions allowed, like the Interview and correction log lines.
- **R2** Personal data: ADR 7 requires a new ADR for a change to what is stored. Migration 11 (`reaper`) stores the
  adder, Player name, position and reason. ADR added (user's answer: kept until an R5 removes it, no expiry; the adder
  is used only for the log line).
- **R3** `src/discord/reaper.ts` (`handleReaperList`, `handleReaperPage`): not wrapped in `answer(...)`; a failing
  deferReply/editReply/update becomes an unhandled rejection. Wrap them like `handleOverview`.

## Should fix

- **R4** `src/discord/reaper.ts` (`closestOriginOf`): when reading the caller's Linked Player is refused (quota spent
  or Quota Reserve kept) and no x/y is given, the Member is asked for x and y instead of seeing the Daily Quota message.
- **R5** `src/domain/exile.ts`: `position` and `positionAt` are separate optional fields. Make one field
  `lastPosition: { position, at } | undefined` (constitution III).
- **R9** `src/discord/reaper-remove.ts`: the reply waits for the log line, which can pass Discord's 3-second limit.
  Reply first, then log.
- **R10** `src/discord/reaper-texts.ts` (`listLine`, `added`, `alreadyExile`): Game API names have no length limit, so
  a list page can pass 4,096 characters. Cut the escaped name.
- **R11** `src/discord/reaper.ts` (`readExiles`): every `closest` reads every Exile of the Kingdom. Accepted as decided
  on #35 (re-read on lookup, cached 10 minutes; REAPER stays small); revisit if it grows past a few dozen per Kingdom.

## Nits

- **R6** `src/discord/client.ts` (`routeReaper`): no default branch; answer an unknown subcommand privately.
- **R7** `src/discord/pick.ts` (`pickExileMatch`): check `mayChangeReaper` again when the pick is made.
- **R8** `src/discord/reaper-texts.ts`: autocomplete labels are plain text; no change needed.
- **R12** `src/game-api/client.ts` (`shieldedFrom`): if `shielding` turns out to be an expiry time, expired shields
  would count. Left: the meaning is unknown (GAME-API.md marks it unproven).

## From the audit (T013, `audit.md`)

- **A1** No handler-level test that a 201-character reason is refused on `/reaper add` (added).
- **A2** No REAPER-level test that a repeated `closest` within 10 minutes costs no request (SC-004) or never the Quota
  Reserve (SC-005): covered by asserting the `lookup` purpose; the cache and reserve rules are the client's, tested there.

## Outcome

Fixed: R1, R2, R3, R4, R5, R6, R7, R9, R10, A1. Accepted: R11. No change: R8, R12, A2.
