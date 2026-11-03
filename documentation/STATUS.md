# Status

Where work stands right now. Updated in every change (constitution, principle VI).
Plan: [ROADMAP.md](ROADMAP.md) · Decisions: [adr/](adr/README.md) · Language: [DICTIONARY.md](DICTIONARY.md) ·
Game API: [GAME-API.md](GAME-API.md) · Hosting: [HOSTING.md](HOSTING.md) · Discovery: [discovery/initial.md](discovery/initial.md) ·
Issues: [GitHub](https://github.com/LilSticky/Neil/issues)

## Current slice

Slice 006 "Give a member their name and roles" is implemented on branch `006-give-a-member-their-name-and-roles`,
**stacked on 005** (its PR targets the 005 branch until #16 is merged): on every Link, Rank Approval and at startup
Neil sets the nickname `[TAG|R4] Name | #331` and the Managed Roles (Alliance for Home Kingdom Alliances, R1–R5,
`#<kingdom>`, T1–T10), creating missing roles without permissions ([ADR 8](adr/0008-neil-creates-managed-roles.md)).
New required variable `HOME_KINGDOM`; Neil needs Manage Roles and Manage Nicknames ([HOSTING.md](HOSTING.md)).
The user decided (2026-11-02) to test later: manual test cases are **collected** in [TEST-RUN.md](TEST-RUN.md)
(sections 2b and 6b), not run. PR [#22](https://github.com/LilSticky/Neil/pull/22) (issue #21) is open against the 005
branch; bot review (3 must, 4 should) fixed, spec audit done; 1334 tests.

Slice 007 "Find an alliance by approximate name" is implemented on branch `007-find-an-alliance-by-approximate-name`,
stacked on 006: Neil remembers Home Kingdom Alliances it sees (Known Alliances, forgotten after 30 days), `/alliance`
suggests them while typing, and a full name the Game API does not know gets a "Did you mean" pick list; `tag:` without
a Kingdom means the Home Kingdom. Test cases collected in [TEST-RUN.md](TEST-RUN.md) §6c.

Slice 008 "Alliance overview" is implemented on branch `008-alliance-overview`, stacked on 007: an "Overview" button on
the Alliance card gives the pressing Member a private Alliance Overview (totals, top 5, Least Active, a paged member
table) from the roster already fetched. Test cases collected in [TEST-RUN.md](TEST-RUN.md) §6d. Reviewed (1 must, 4 should fixed), audited; PR [#26](https://github.com/LilSticky/Neil/pull/26) (issue #25), 1468 tests. Fix (2026-11-03, issue #36): the page label no longer shares a custom id with Previous/Next (Discord refused the Overview with COMPONENT_CUSTOM_ID_DUPLICATED); merged forward into 009–012.

Slice 009 "Keep roles in sync" is implemented on branch `009-keep-roles-in-sync`, stacked on 008: a Daily Sync at
`SYNC_HOUR_UTC` re-reads each Alliance with Linked Members once (and looks up movers by uid) within a Sync Share of
500 requests, and restores nicknames and Managed Roles; one log line per changed Member and a summary. Test cases
collected in [TEST-RUN.md](TEST-RUN.md) §6e. Reviewed (3 must, 6 should fixed), audited; PR [#28](https://github.com/LilSticky/Neil/pull/28) (issue #27), 1581 tests.

Slice 010 "Say goodbye" is implemented on branch `010-say-goodbye`, stacked on 009: when a Linked Member leaves, Neil
Unlinks them (Link and applied state removed, `🔓` log line, a private message if Discord allows it); pending Rank
Approvals waiting on them go to the Officers; leaves missed while offline are caught at startup and in the Daily Sync.
New dictionary term Unlink. discord.js partials (GuildMember, User) are now on, so leaves of uncached Members arrive.
Test cases collected in [TEST-RUN.md](TEST-RUN.md) §6f. Reviewed (1 must, 3 should, 2 could fixed), audited; PR
[#30](https://github.com/LilSticky/Neil/pull/30) (issue #29), 1639 tests.

Slice 011 "Correct a link" is implemented on branch `011-correct-a-link`, stacked on 010: an Officer can Unlink any Linked
Member (`/unlink member:`), a Member can Unlink themselves (`/unlink`), an Officer can give a Rank Approval at any time
(`/rank`, stored with the Officer; the Daily Sync keeps it while the game lists no rank) and can Link a Member whose
Interview was handed off, from a uid after confirming the Player (`/link`, an Officer Link). Each correction posts one
log line naming who made it. The Member re-check was cut (the Daily Sync covers it). New commands: `npm run commands:register`
is needed for /unlink, /rank and /link ([HOSTING.md](HOSTING.md)). Test cases collected in [TEST-RUN.md](TEST-RUN.md) §6g.
Reviewed (1 must, 3 should, 3 could fixed; C3, hiding Officer commands, left open), audited; PR
[#32](https://github.com/LilSticky/Neil/pull/32) (issue #31), 1766 tests. T001–T009 done; T010 (manual check, TEST-RUN.md §6g)
waits for the user.

007 is reviewed (2 should, 3 could fixed) and audited; PR [#24](https://github.com/LilSticky/Neil/pull/24) (issue #23), 1405 tests.

Slice 012 "See a fuller card" is implemented on branch `012-see-a-fuller-card`, stacked on 011 (user request,
2026-11-02: "include whatever is confirmed and stable", and make the card pleasing and easy to read). `/player` and
`/alliance` cards show the Game API fields judged stable in a live check (GAME-API.md, "Stability check"), the
tracker's avatar and badges, an accent color and a grouped grid; roster rows show Might. No extra request. Ten new
dictionary terms (approved). Reviewed (1 must, 1 should, 2 could fixed; C2 kept), audited; test cases in
[TEST-RUN.md](TEST-RUN.md) §6h; 1979 tests.

Test run feedback (2026-11-03), added to 012: the Alliance Overview gets the Alliance card's look (accent color,
Kingdom author line, badge, fields in rows of three, Might on table rows), and a Player without a Last Online counts as
online now (Player card "Online now"; Overview table and counts). The "Unknown interaction" on the roster's Next button
came from Neil running locally and on Wispbyte at once (TEST-RUN.md 0.6); no change. Tasks T007–T009 done, reviewed
(S2, C4 fixed; C5 kept for the manual check); 2000 tests. New test cases: TEST-RUN.md §6h.7–6h.9.

Second round of feedback (2026-11-03), added to 012: Power is renamed Might everywhere (Kingdom Power Rank → Kingdom
Might Rank; Game API and stored keys stay `power`); the Overview's member table is a card of its own with a monospace
table (#, Name, Might, Weekly, Honor, Tech, Last), sorted by Might, with sort buttons (US4, T010–T011); 2042 tests.

**Next step (2026-11-03):** the user asked to merge and release the whole stack before the manual test run (Neil only
runs on the test server). Merge #16, #22, #24, #26, #28, #30, #32, #34 in order: for each next branch, merge `main` in
with `-s ours` (every branch already contains main's changes), retarget to `main`, wait for CI, squash-merge, and note
in each pull request that its manual check stays open. Then `npm run commands:register`, the Wispbyte setup
([HOSTING.md](HOSTING.md): Server Members Intent, channel IDs, `HOME_KINGDOM`, Manage Roles and Manage Nicknames)
and a Wispbyte restart. The merges wait for the user's permission (blocked by the session's permission rules).

Slice 005 "Interview a new member" is implemented on branch `005-interview-a-new-member` (issue #15): a joiner gets a private
Onboarding Interview thread, gives a uid, confirms the Player and is Linked; unknown ranks go to the Alliance's R5 (Rank Approval);
`/interview`, timeouts, leaving and the Daily Quota pause are handled. All automated tasks are green; the bot review's 12 findings and the spec audit's gaps are fixed (1032 tests). Feedback from the test run (2026-11-01) added to the slice: the Interview now starts with a Recommended Player (the Member's cleaned server display name looked up as a Player Name; one match "Is this you?", several a pick list; the uid is still asked as In-game Proof), and `/player`/`/alliance` search by name or tag first and no longer show uids (`/alliance` option `alliance` renamed `tag`, so `npm run commands:register` is needed again). Tasks T025–T034 done, reviewed (2 should, 4 could, fixed) and audited; 1159 tests. The user chose automated
tests only for now; the manual run is prepared in [TEST-RUN.md](TEST-RUN.md) (T024 deferred). Setup: [HOSTING.md](HOSTING.md) §3.

**Next step:** the slice's pull request ([#16](https://github.com/LilSticky/Neil/pull/16)) stays **open, not merged** (user's decision, 2026-11-01: merge only after the setup), because Wispbyte pulls `deploy` on every start and
Neil would not start there without the setup. The user does the setup (switch on Server Members Intent in the Developer Portal, create `#onboarding` and
`#neil-log` with the permissions in HOSTING.md, set `DISCORD_ONBOARDING_CHANNEL_ID`, `DISCORD_LOG_CHANNEL_ID` and optionally
`INTERVIEW_TIMEOUT_MINUTES` in `.env` and on Wispbyte, run `npm run commands:register`) and walks [TEST-RUN.md](TEST-RUN.md) (setup and startup checks done; new section 2b covers the Recommended Player).
Claude then merges the pull request, turns the feedback into issues and asks for a Wispbyte restart. Slice 006 "Give a member their name and roles" follows; its domain discovery (which roles exist, which Neil may manage) waits for the user (decided 2026-11-01: stop after 005).

**Known broken / WIP:** once slice 005 is on `main`, Neil on Wispbyte will not start until Server Members Intent is on
and the two channel IDs are set there (Neil refuses the configuration or cannot log in). That is why the merge waits.

Fix (2026-11-01, PR #18, closes #17): titled R4s (`R4 – Diplomat` …) no longer show as rank unknown, and name lookups no longer fail on roster rows without `rank_label`; deployed from `main` (takes effect at the next Wispbyte restart).

Fix (2026-11-01, PR #20, closes #19): the Alliance card now lists only the 25 members of the roster menu's page and turns with it (it listed the whole roster on every page); slice 004 spec FR-006 updated; on `main`, takes effect at the next Wispbyte restart.

Earlier: slice 004 "Find a player by name or alliance" is merged (PR #14, closes #13): `/player` by name with a private pick list, `/alliance` by full name with the Alliance Roster and a paged member menu, lookups stop at the Quota Reserve (100), `/quota` shows it. Bot-reviewed ([review.md](../specs/004-find-a-player-by-name-or-alliance/review.md)), spec-audited and checked on the test server (T026). Slice 003 "Look up players within the daily quota" is merged (PR #9, closes #8): cache, persisted Daily Quota with a hard stop (also after a 429 and across restarts), retries on 503/504, `/quota` for Officers; reviewed, audited, and checked on the test server (T031) and on Wispbyte with the new role IDs set (T033, 2026-10-30). Slice 002 "Look up a player" is done (PR #6): any Member runs `/player` by uid and `/alliance` by kingdom and tag, checked on the test server and on Wispbyte ([tasks.md](../specs/002-look-up-a-player/tasks.md)). Slice 001 "Greet the test server" is done (PRs #2, #3): Neil runs on Wispbyte from a green
`main` through the `deploy` branch, answers `/ping` on the test server, and its data folder survives
restarts and redeploys (ADR 5 stands). Details: [tasks.md](../specs/001-greet-the-test-server/tasks.md),
[HOSTING.md](HOSTING.md). Neil is the only bot application; local runs need Wispbyte stopped.

**Roadmap (2026-10-30):** new slice 004 "Find a player by name or alliance" (`/player` by name, `/alliance` lists members with uids, and lookups leave the Quota Reserve for Onboarding Interviews) comes before the Interview (now 005) and naming (now 006); approximate alliance-name search is in Later. The name endpoints were verified (see GAME-API.md).

## Known broken / WIP

- Slice 005 deploy: see the warning under Current slice (Server Members Intent and the two channel IDs).
- Slice 005 manual check (T024) not run yet; see [TEST-RUN.md](TEST-RUN.md).

## Open questions

See [discovery/initial.md](discovery/initial.md#open-questions): which Discord roles exist and which Neil
may manage (needed by slice 006); (Wispbyte's disk persistence: answered yes in slice 001.)

**Roadmap (2026-11-03):** REAPER (an R5-kept exile list and a command for the closest unshielded exile) added to Later; its open questions are in [#35](https://github.com/LilSticky/Neil/issues/35).

## Standing notes

- Sessions wrap up before the plan limit: `.claude/hooks/usage-guard.mjs` tells a session once, at 95% of the
  5-hour or 7-day usage (`NEIL_USAGE_WRAP_UP`), to commit, update STATUS, push and stop.
- The Game API's limit is a daily quota (2,000/UTC day on our patron key), not a per-second limit; see ADR 4. The key is
  `LAP_TRACKER_API_KEY` in `.env` (git-ignored; template in `env.example`). Code uses only the endpoints
  verified in [GAME-API.md](GAME-API.md).
