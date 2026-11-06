# Status

Where work stands right now. Updated in every change (constitution, principle VI).
Plan: [ROADMAP.md](ROADMAP.md) · Decisions: [adr/](adr/README.md) · Language: [DICTIONARY.md](DICTIONARY.md) ·
Game API: [GAME-API.md](GAME-API.md) · Hosting: [HOSTING.md](HOSTING.md) · Server setup: [SERVER-SETUP.md](SERVER-SETUP.md), [STARTUP-GUIDE.md](STARTUP-GUIDE.md), [MIGRATION-GUIDE.md](MIGRATION-GUIDE.md) · Discovery: [discovery/initial.md](discovery/initial.md) ·
Issues: [GitHub](https://github.com/LilSticky/Neil/issues)

## Current slice

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

**Next step:** in a new session: slice 020, the setup script ([#62](https://github.com/LilSticky/Neil/issues/62)), whose rights are still to be decided (discovery Q6).

For the user, still open: deploy slices 021 and 022 and let one Daily Sync run before gating channels on Preference Roles, delete the `Trading` role, the channel setup ([MIGRATION-GUIDE.md](MIGRATION-GUIDE.md)), explaining AD and KvK, then TEST-RUN.md §6i, §6j, §6k, §6l, §6m, §6n, §6o and §6p.
Slices 015 and 018 are live on Wispbyte: on 2026-11-05 the user switched on Presence Intent, Linked the Members there, restarted and registered the commands.
Never run Neil locally while Wispbyte runs ([HOSTING.md](HOSTING.md)).

## Known broken / WIP

- `npm run test` can time out at 5 seconds in unrelated tests when two runs overlap; alone it is green (seen in slice 022).
- Preferences may be invisible once `#onboarding` is hidden: untested, issue [#66](https://github.com/LilSticky/Neil/issues/66). A Guest leader can't open a Rank Approval thread: issue [#67](https://github.com/LilSticky/Neil/issues/67).
- Until slice 021 is deployed and one Daily Sync has run, Guests can hold Preference Roles, so don't gate channels on them.
- Manual checks open: slice 013 (T012, TEST-RUN.md §6i), slice 014 (T014, §6j), slice 016 (T015, §6k, not run), slice 017 (T011, §6l, not run), slice 015 (T019, §6m), slice 018 (T010, §6n), slice 021 (T017, §6o), slice 022 (T009, §6p).
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
