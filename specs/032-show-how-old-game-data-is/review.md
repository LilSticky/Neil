# Review: slice 032 (show how old game data is)

Scope: `git diff main...HEAD -- src`. No must-fix security or protocol defects. Owner check, deferral, id parsing and the
row counts are sound (see Checked).

## Must fix
none

## Should fix
1. src/discord/look-again.ts:100-114 (refreshClosest) + src/discord/reaper.ts:298-310: the /reaper closest Look again reads every
   Exile live, purpose `lookup`, and is not charged to the caller (no `chargedTo`, no Daily Allowance). One press costs N
   Game API requests and each press repeats them, with no per-Member limit, so one Member can drain the Daily Quota (an Officer is
   unlimited elsewhere, a Member is limited elsewhere). Fix: charge the reads to the caller (`chargedTo(caller).getPlayer(uid,"live")`)
   or add a per-Member cooldown for the reaper button, and map `allowance-spent` to the refusal text.
2. src/discord/look-again.ts:100-114 and src/discord/reaper-cards.ts:150 (closestAnswer(..., 0, undefined, ownerId)): the redraw
   drops paging. A `/reaper closest all:true` answer pressed with Look again returns page 1 with no page buttons and no
   session, so the Member loses the other pages. `all` is not in the custom id. Fix: add an `all` flag to the reaper id
   (`again:{owner}:r[:x:y][:all]`) and open a reaper page session as handleReaperClosest does.
3. src/game-api/client.ts:723 (orStale) with live freshness: when quota is spent/reserved, a live press falls back to the
   stale cached answer as `found`, so the card is redrawn unchanged, no refusal is shown, and the Member may think "Look
   again" worked. Fix: for `freshness === "live"` return the refusal (do not fall back), or have the handler compare `asOf`
   with the shown card and tell the Member nothing newer was found.

## Nit
4. src/discord/lookup-cards.ts:53 NEWER_DATA_ROOM=200 is reserved on the Alliance card on every page, but the
   field is added in lookup.ts:290 and pick.ts:351, outside renderAllianceCard. Keep, but add a test that the Alliance card
   plus `withNewerData` stays under 6000 with the longest names (the existing test at lookup-cards.test.ts:1457 may not
   include the field). The /reaper closest header gains about 150 characters (reaper-cards.ts:160); confirm the 6000 test
   at reaper-closest.test.ts:662 runs with an old position.
5. src/discord/look-again.ts:152 `(.+)` in ALLIANCE_ID/OVERVIEW_ID accepts ":" in the tag; harmless (parseAllianceKey bounds it
   to 40) but `([^:]+)` would be stricter, and ids stay at most about 74 characters.
6. src/game-api/schemas.ts:32 `mapUpdatedAtSchema` has no upper bound (client.ts mapTimeOf guards NaN/Infinity, but a huge
   finite value gives an Invalid Date, which is handled, and a far-future map time reads as "not old"). Consider `.max(MAX_DATE_SECONDS)`
   and clamping a future map time to `now`.

## Checked and fine
- Owner check before deferUpdate; unreadable id and non-owner answered ephemerally through replyPrivately (look-again.ts:176-191).
- Live never reads the cache (client.ts:235, 295, 323); in-flight key includes freshness and caller; copy is the default.
- Look again row: Alliance card at most 4 rows (menu, page row, Overview, Look again), Overview at most 4, others 1 or 2.
- REAPER readAt falls back to `now` when the map time is missing (reaper.ts:318); stored position times are kept.
