# Status

Where work stands right now. Updated in every change (constitution, principle VI).
Plan: [ROADMAP.md](ROADMAP.md) · Decisions: [adr/](adr/README.md) · Language: [DICTIONARY.md](DICTIONARY.md) ·
Game API: [GAME-API.md](GAME-API.md) · Hosting: [HOSTING.md](HOSTING.md) · Server setup: [SERVER-SETUP.md](SERVER-SETUP.md), [STARTUP-GUIDE.md](STARTUP-GUIDE.md), [MIGRATION-GUIDE.md](MIGRATION-GUIDE.md) · Discovery: [discovery/initial.md](discovery/initial.md) ·
Issues: [GitHub](https://github.com/LilSticky/Neil/issues)

## Current slice

Slice 029, Rework the Server Layout ([specs](../specs/029-rework-the-server-layout/), issue [#80](https://github.com/LilSticky/Neil/issues/80)): the setup script's layout after its first real run on the empty test server. No Guest or AD announcements; one Hangout category replaces Home Kingdom and Off-topic; Recruitment has `looking-for-alliance` and `looking-for-players`; Events has `Coaching voice`; KvK and NaP get translated announcement copies. Every channel gets a topic and a pinned description from Neil, and `#rules` and `#guest-rules` get a code of conduct.
The user's decisions (2026-11-07): translated copies only for Russian, French, Italian and German, seen by their Language role; every announcement reaches the whole Home Kingdom; descriptions as topic plus pinned message; the merged category is named Hangout, with off-topic and memes opt-in; the code of conduct is approved as drafted; regional recruitment is dropped.
Merged to `main`. **Merged red:** the manual run on the emptied test server ([TEST-RUN.md](TEST-RUN.md) §6v) needs the user, so Definition of Done 2 is open. TEST-RUN 6q.1–6q.4 passed on 2026-11-07.

Slice 026, Call out a booty ([specs](../specs/026-call-out-a-booty/), issue
[#75](https://github.com/LilSticky/Neil/issues/75)): `/booty` in an Alliance's `alliance-chat` asks for a private Confirm, then posts a card that mentions the Members whose Booty Alerts match. `/booty-alerts` records them: Off by default, Always, Only when online or Only when offline, with a daily window and a city time zone. Online means on Discord or in the game. One Booty Call per Alliance per minute (the user's decisions). Migration 14, ADR 13.
Merged to `main` with T001–T018 done (review and audit in the spec folder). **Merged red:** the manual check ([TEST-RUN.md](TEST-RUN.md) §6u, T019) needs the deploy, so Definition of Done 2 is open. The real Discord adapters have only been tested with fakes.

Slice 024, Keep the thread until it closes ([specs](../specs/024-keep-the-thread-until-it-closes/), issue
[#66](https://github.com/LilSticky/Neil/issues/66)): the Onboarding Role now comes off when the Interview thread closes (Done, the timeout, or the end of a Rank Approval), not at the Link, so a Member can still see their Preferences message. Guests still lose it at the Link. The user's decisions: Preferences stay in the thread, after a private `/channels` note was built and dropped. No migration.
Merged to `main` with T001–T008 done (review and audit in the spec folder). **Merged red:** the manual check ([TEST-RUN.md](TEST-RUN.md) §6s, T009) needs the deploy, so Definition of Done 2 is open.

Slice 027, See what Neil can do ([specs](../specs/027-see-what-neil-can-do/), issue
[#76](https://github.com/LilSticky/Neil/issues/76)): `/help` privately lists the commands a caller can use, with usage and purpose, built from the command definitions. Officer commands show only to Officers (assumed, not asked). No migration.
Merged to `main` with T001–T007 done (review and audit in the spec folder). **Merged red:** the manual check ([TEST-RUN.md](TEST-RUN.md) §6t, T008) needs the deploy and `npm run commands:register`, so Definition of Done 2 is open.

Slice 023, No Rank Approval for Guests ([specs](../specs/023-no-rank-approval-for-guests/), issue
[#67](https://github.com/LilSticky/Neil/issues/67)): a Link of a Guest opens no Rank Approval, in the Interview or by an Officer; `/rank` still works (the user's decision). No migration, no new command.
Merged to `main` with T001–T008 done (review and audit in the spec folder). **Merged red:** the manual check ([TEST-RUN.md](TEST-RUN.md) §6r, T009) needs the deploy, so Definition of Done 2 is open.

Slice 020, Set up the server ([specs](../specs/020-set-up-the-server/), issue
[#62](https://github.com/LilSticky/Neil/issues/62)): `npm run server:setup` builds the Server Layout from `server-layout.json`, as a dry run unless `--apply` is given. Alliance roles are now `[NML]`; Neil renames plain ones at the next Link or Daily Sync. AD and KvK are in the layout, seen by `PvP` and `Events`.
The user's decisions: temporary Administrator for the run (ADR 12, constitution 1.1.0), channels outside the layout only reported, one mode with a dry-run warning. Merged to `main` with T001–T018 done (review in the spec folder). **Merged red:** no real run yet; the manual check ([TEST-RUN.md](TEST-RUN.md) §6q, T019) needs the user, so Definition of Done 2 is open. A dry run against the server in `.env` worked. Neil holds no role on that server, so it needs one before a real run.

Slice 022, Choose Recruitment instead of Trading ([specs](../specs/022-choose-recruitment-instead-of-trading/), issue
[#65](https://github.com/LilSticky/Neil/issues/65)): Recruitment replaces Trading as an Interest, in the same place in the menu. No migration: nobody holds Trading, and the user deletes the role by hand (the user's decisions).
Merged to `main` with T001–T008 done (review and audit in the spec folder). **Merged red:** the manual check ([TEST-RUN.md](TEST-RUN.md) §6p, T009) needs the deploy, so Definition of Done 2 is open.

Slice 021, Keep Preferences within the Home Kingdom ([specs](../specs/021-keep-preferences-within-the-home-kingdom/), issue
[#64](https://github.com/LilSticky/Neil/issues/64)): a Guest gets no Preferences message and no Preference Roles, and `/channels` refuses them privately. Guests lose the roles at the Daily Sync and keep their stored Preferences until the Unlink (the user's decisions). No migration, no new command.
Merged to `main` with T001–T016 and T018 done (review and audit in the spec folder). **Merged red:** the manual check ([TEST-RUN.md](TEST-RUN.md) §6o, T017) needs the deploy, so Definition of Done 2 is open.

Slice 019, Know what a server needs ([specs](../specs/019-know-what-a-server-needs/), [discovery](discovery/019-know-what-a-server-needs.md), issue
[#61](https://github.com/LilSticky/Neil/issues/61)): SERVER-SETUP.md is now the reference (lists and Server Layout), with STARTUP-GUIDE.md and MIGRATION-GUIDE.md. Documentation only. **Merged red:** the guides were not followed on the test server (T007), so Definition of Done 2 is open, and AD and KvK are still to be explained by the user (T008). The user's main decision: Guests see only the Guest area, which overrides slice 017's layout.

Slice 018, Start Interviews for unlinked Members ([specs](../specs/018-start-interviews-for-unlinked-members/), issue
[#58](https://github.com/LilSticky/Neil/issues/58)): an unlinked Member gets an Interview on coming online, and at a start of Neil, up to 10 per start
(the user's decision). Merged to `main` with T001–T009 and T011–T015 done (review and audit in the spec folder). **Merged red:** the manual check
([TEST-RUN.md](TEST-RUN.md) §6n, T010) needs the deploy, so Definition of Done 2 is open. Needs **Presence Intent** before the Restart (ADR 11).

Slice 015, Look up within a Daily Allowance ([specs](../specs/015-look-up-within-a-daily-allowance/), issue
[#50](https://github.com/LilSticky/Neil/issues/50)): each Member's lookups are counted and stop at a Daily Allowance; `/usage` is new and `/quota` shows the top Members.
Merged to `main` with T001–T018 done (review and audit in the spec folder). **Merged red:** the manual check
([TEST-RUN.md](TEST-RUN.md) §6m, T019) needs the deploy, so Definition of Done 2 is open. Expected Lookup Members is at least 100 and `/reaper` is not charged (the user's decisions). Migration 13, ADR 10.

Slice 017, Give Members the Doctor Role ([specs](../specs/017-give-members-the-doctor-role/), issue
[#47](https://github.com/LilSticky/Neil/issues/47)): every Linked Member, Guests included, holds the Doctor Role, and
its layout is replaced by slice 019's Server Layout. Merged to `main` with T001–T010 done. **Merged red:**
the manual check ([TEST-RUN.md](TEST-RUN.md) §6l, T011) has not been run, so Definition of Done 2 is open.

Slice 016, Choose your channels ([specs](../specs/016-choose-your-channels/), issue
[#42](https://github.com/LilSticky/Neil/issues/42)): after the Link, a Preferences message (Languages, Region, Interests,
Experience) gives Preference Roles that show the matching channels; `/channels` shows it again. Merged to `main` with
T001–T014 done (review and audit in the spec folder). **Merged red:** the manual check ([TEST-RUN.md](TEST-RUN.md) §6k,
T015) was not run, on the user's word, so Definition of Done 2 is open. Migration 12.

Slice 014, Find the closest Exile (REAPER) ([specs](../specs/014-find-the-closest-exile/), [#35](https://github.com/LilSticky/Neil/issues/35)),
merged to `main` as #44: `/reaper add|remove` for Home Kingdom R5s, `/reaper closest|list` for any
Member. T001–T013 done (review and audit in the spec folder, ADR 9 for its personal data); the manual check T014
(TEST-RUN.md §6j) is open.

Slice 013, Keep newcomers in onboarding ([specs](../specs/013-keep-newcomers-in-onboarding/)): the Onboarding Role
(given on join and Unlink, taken off at Link, put right at startup) and deletion of finished Interview threads. Merged
to `main` and deployed; the manual check ([TEST-RUN.md](TEST-RUN.md) §6i, task T012) is open.

Earlier: slices 001–012 are done; their manual checks were run by the user on 2026-11-03. Slice 005's T033 and T034 are closed too: their findings were checked against the code on 2026-11-04.

**Next step:** the user empties the test server again, then follows the setup guide ([STARTUP-GUIDE.md](STARTUP-GUIDE.md)): dry run, Administrator, `--apply`, Administrator off, place the roles, put the new IDs in `.env` and on Wispbyte, `npm run commands:register`, start Neil, then TEST-RUN.md §6v. Slice 025 ([#73](https://github.com/LilSticky/Neil/issues/73)) is in progress in another session.

For the user, still open: deploy slices 020, 021 and 022 and let one Daily Sync run before the setup script's real run, delete the `Trading` role, the channel setup ([MIGRATION-GUIDE.md](MIGRATION-GUIDE.md)), then TEST-RUN.md §6i, §6j, §6k, §6l, §6m, §6n, §6o, §6p, §6r, §6s, §6t and §6u. §6q.1–6q.4 passed on 2026-11-07; the rest of §6q is replaced by §6v. For slice 026: `npm run commands:register`, the setup script again so Neil may post in `alliance-chat`, then TEST-RUN.md §6u.
Slices 015 and 018 are live on Wispbyte: on 2026-11-05 the user switched on Presence Intent, Linked the Members there, restarted and registered the commands.
Neil isn't live yet and the test server is empty: no backwards compatibility until the user announces the release (the user's word, 2026-11-06).
Never run Neil locally while Wispbyte runs ([HOSTING.md](HOSTING.md)).

`#gift-codes` is in the Server Layout (the user's request, 2026-11-07): Home Kingdom only, posted in by `R4`, `R5` and King, or fed by a **Follow** from the game's official server, which the user sets up by hand ([SERVER-SETUP.md](SERVER-SETUP.md)). Check: TEST-RUN.md 6q.10 and 6q.11.

## Known broken / WIP

- The setup script's real run hides existing layout channels from @everyone at once. On the live server it is the cutover: only on the announced date ([MIGRATION-GUIDE.md](MIGRATION-GUIDE.md) step 6).
- Announcement channels need Community; without it the script makes them plain text channels. Forums are built as forums either way (to confirm in TEST-RUN §6v).
- `npm run test` can time out at 5 seconds in unrelated tests when two runs overlap; alone it is green (seen in slice 022).
- Until slice 021 is deployed and one Daily Sync has run, Guests can hold Preference Roles, so don't gate channels on them.
- Manual checks open: slice 013 (T012, TEST-RUN.md §6i), slice 014 (T014, §6j), slice 016 (T015, §6k, not run), slice 017 (T011, §6l, not run), slice 015 (T019, §6m), slice 018 (T010, §6n), slice 021 (T017, §6o), slice 022 (T009, §6p), slice 020 (T019, §6q), slice 023 (T009, §6r), slice 024 (T009, §6s), slice 027 (T008, §6t), slice 026 (T019, §6u), slice 029 (§6v; §6q.1–6q.4 passed on 2026-11-07).
- Slice 016: at Unlink, a Preferences thread that cannot be deleted is only logged and stays (review.md, second pass).
- Slice 014: Neil cannot see shields (`shielding` always 0); `/reaper closest` says so in every answer.
- Until the channel permissions are set, newcomers still see every channel (the role is given, but nothing hides the rest).
- Officer commands are now hidden from Members (slice 011 C3 fixed). After deploying, run `npm run commands:register`
  and do the Integrations step in [HOSTING.md](HOSTING.md) (allow Moderator and King, limit to the moderator channel).

## Open questions

- Wispbyte's disk persistence: answered yes in slice 001.

## Standing notes

- Sessions wrap up before the plan limit: `.claude/hooks/usage-guard.mjs` tells a session once, at 95% of the
  5-hour or 7-day usage (`NEIL_USAGE_WRAP_UP`), to commit, update STATUS, push and stop.
- The Game API's limit is a daily quota (2,000/UTC day on our patron key), not a per-second limit; see ADR 4. The key is
  `LAP_TRACKER_API_KEY` in `.env` (git-ignored; template in `env.example`). Code uses only the endpoints
  verified in [GAME-API.md](GAME-API.md).
