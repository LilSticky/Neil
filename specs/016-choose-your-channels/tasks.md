---
description: "Task list for slice 016, Choose your channels"
---

# Tasks: Choose your channels

**Input**: [spec.md](spec.md), [plan.md](plan.md) (decisions R1–R7). TDD per task (`test-first` → `implementer`).
**Before T001**: rebase onto `main` once slice 015 is merged (plan, Coordination).

## Tasks

- [x] **T001** [US1–3] Domain `src/domain/preferences.ts` (R2, R3, data model): `GAME_LANGUAGES`, regions, interests,
  experiences with role names; `preferenceRolesFor(preferences, rank)` (NaP only for R4 when chosen, always for R5,
  never otherwise); `interestOptions(rank)`; `preselectedLanguage(code)` (`zh-TW` → `zh`, unknown → undefined);
  `ALL_PREFERENCE_ROLE_NAMES`; no name is a Managed Role name.
- [ ] **T002** [US1–4] Storage: migration (`preference`, `preference_prompt`) and `src/storage/preference-store.ts`:
  `get(memberId)`, `setAnswer(memberId, question, values)`, `forget(memberId)`, `openPrompt`/`closePrompt`/
  `promptsPostedBefore(date)`; unknown stored values dropped; migration test from the latest schema fixture.
- [ ] **T003** [US1–3] `src/discord/preferences.ts` apply (R5): `apply(memberId, rank)` gives the wanted Preference
  Roles and takes off the other Preference Roles via `giveNamedRole` / `takeOffNamedRole`; a skip is logged, never
  thrown; `forget(memberId)` takes them all off and deletes the rows.
- [ ] **T004** [US1–3] `src/discord/preferences-texts.ts` and the message (contracts): four menus with preselection
  (stored answers, else the game Language), Interests by rank, Done button, custom IDs with the Member ID; the guides
  line for Veteran and New (`GUIDES_FORUM_ID` in `config.ts`, optional).
- [ ] **T005** [US1–3] Select and Done handling (R7): a change saves the answer, applies the roles, logs one line and
  updates the message; a press by another Member changes nothing; Done closes the prompt and deletes the thread unless
  a Rank Approval is pending.
- [ ] **T006** [US1] `interview.ts` `finishLink`: post the Preferences message and open the prompt instead of deleting
  the thread; with a pending Rank Approval the message is posted too; a failure to post deletes the thread as before.
- [ ] **T007** [US1] `interview-sweeper.ts` (R4): prompts older than `timeoutMs` are closed and their thread deleted
  unless a Rank Approval is pending; a gone thread is not an error.
- [ ] **T008** [US3] `name-and-roles.ts` (R5): `onLinked`, `onRankApproved`, `syncMember`, `atStartup` call
  `preferences.apply` with the rank; R5 gets NaP discussions at Link; a rank change in the Daily Sync takes it off a
  former R4/R5 and gives it to a new R5; a failure leaves the name and roles standing.
- [ ] **T009** [US1–4] `unlink.ts`: every Unlink calls `forget` (roles off for a Member still on the server, rows always
  deleted). `corrections.ts` Officer Link (R6): private message pointing to `/channels`, failure ignored.
- [ ] **T010** [US4] `/channels` in `commands.ts`: Linked → the private Preferences message with current answers; not
  Linked → "finish onboarding first"; register-commands test.
- [ ] **T011** `client.ts`: build the store and service, route `pref:` components and `/channels`, pass the service to
  name and roles, the Interview, the sweeper, corrections and Unlink.
- [ ] **T012** Docs: HOSTING.md (create the language, region, interest and experience channels' permissions per
  Preference Role; NaP publications visible to every Linked Member; `GUIDES_FORUM_ID`), `env.example`, TEST-RUN.md §6j,
  STATUS, ROADMAP (016 row).
- [ ] **T013** `bot-reviewer` on the slice diff; findings into `review.md`; fix must/should items.
- [ ] **T014** `spec-auditor` against spec.md; findings into `audit.md`; close gaps.
- [ ] **T015** Manual check collected in TEST-RUN.md §6j (including the game's language list, R2), run later by the
  user.
