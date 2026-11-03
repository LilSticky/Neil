---
description: "Task list for slice 005, Interview a new member"
---

# Tasks: Interview a new member

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/interview.md](contracts/interview.md), [quickstart.md](quickstart.md), [ADR 7](../../documentation/adr/0007-personal-data-of-links-and-interviews.md)

**Tests**: required. TDD is mandatory (constitution II): every `src/` task is a pair, a failing test first
(`test-first` agent), then the code that makes it green (`implementer`). Tests sit next to their files as
`*.test.ts`. No test touches the network, the real Discord or waits in real time; stores use `:memory:`.

**Organization**: by user story. US1 and US2 are P1, US3 and US4 P2, US5 P3. Phase 2 (domain state machine,
stores, Discord ports) is shared by all.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US5 from spec.md

---

## Phase 1: Setup (configuration)

- [x] T001 Test then implement config in `src/config.test.ts` / `src/config.ts`: `DISCORD_ONBOARDING_CHANNEL_ID` and
  `DISCORD_LOG_CHANNEL_ID` required Discord IDs ("must be a Discord ID (17–20 digits)"); `INTERVIEW_TIMEOUT_MINUTES`
  optional, "whole number ≥ 1", default 1440 (`Configuration.onboardingChannelId`, `logChannelId`,
  `interviewTimeoutMs`). Values are never echoed. Add all three to `env.example`.

---

## Phase 2: Foundational (domain, storage, ports)

- [x] T002 [P] Test `src/domain/lookup-input.test.ts`: `parseInterviewUid` trims spaces and one leading `#`, then
  accepts what `parseUid` accepts; rejects `abc`, `12a`, empty, `##1`. Implement in `src/domain/lookup-input.ts`.
- [x] T003 [P] Test `src/game-api/client.test.ts` + `schemas.test.ts`: the player body's `alliance.leader_id`
  (number or digit string, nullish) maps to `PlayerAlliance.leaderUid` (`Uid | undefined`); the recorded
  `player-in-alliance.json` gives `"145563254785"`. Implement in `src/domain/player.ts`, `src/game-api/schemas.ts`,
  `src/game-api/client.ts`.
- [x] T004 Test `src/domain/onboarding-interview.test.ts` (data-model.md table, every row): `startInterview` →
  `awaiting-uid` with `failedAttempts` 0 and `lastAskedAt = now`; `giveUid` (valid → `checking`, malformed → same
  Interview + event `malformed`, no attempt); `uidChecked` with `found | not-found | already-linked | unavailable |
  quota-spent(resetsAt)`; `confirm` (`linked` or `already-linked`); `reject`; the 5th failure gives `handed-off`
  (`MAX_FAILED_ATTEMPTS = 5`); `timeOut`, `memberLeft` → `abandoned` with reason; `quotaReset` → `awaiting-uid` with
  `lastAskedAt = now`; `recoverAfterRestart` turns `checking` into `awaiting-uid` without an attempt; ended steps
  refuse every event (`ended`); `dueAt(interview, timeoutMs)` per data-model.md. Implement
  `src/domain/onboarding-interview.ts` as a discriminated union over `step`.
- [x] T005 [P] Test `src/domain/link.test.ts`: `rankOnLink(player)` → `game-api` with R1–R5, `unknown` when in an
  Alliance with rank unknown, `no-alliance` when no Alliance; `needsRankApproval` only for `unknown`. Implement
  `src/domain/link.ts`.
- [x] T006 [P] Test `src/domain/rank-approval.test.ts`: `chooseApprover(leaderMemberId | undefined, linkedMemberId)`
  (undefined or same as Linked Member → officers); `mayApprove` (pending only; never the Linked Member, even an
  Officer; member approver: only that Member; officers: any Officer); `approve(rank, by, now)` → approved;
  `cancel(now)` → cancelled; ended approvals refuse. Implement `src/domain/rank-approval.ts`.
- [x] T007 Test `src/storage/database.test.ts`: migration 3 creates `onboarding_interview`, `link`, `rank_approval`
  exactly as in data-model.md (incl. `UNIQUE(uid)` on `link`, `member_id` primary key, the partial unique index
  `one_open_interview`, `failed_attempts BETWEEN 0 AND 5`); an existing version-2 db upgrades. Implement in
  `src/storage/database.ts`.
- [x] T008 Test `src/storage/interview-store.test.ts` (`:memory:`): `create` fails for a second open Interview of
  the same Member; `save`/`get(id)`/`openFor(memberId)` round-trip every step through zod; `due(now)` lists open
  Interviews with `due_at ≤ now`; a corrupt row is reported, not thrown; `deleteEndedBefore(cutoff)` (90 days).
  Implement `src/storage/interview-store.ts`.
- [x] T009 Test `src/storage/link-store.test.ts` (`:memory:`): `linkFor(memberId)`, `memberForUid(uid)`; `confirm`
  inserts the Link, saves the `linked` Interview and an optional pending Rank Approval in one transaction, and
  returns `already-linked` (nothing written) when the Member or uid already has a Link; Rank Approval
  `get`/`save`/`pendingFor(memberId)`; approving writes the rank onto the Link (`rank-approval`, approver, time);
  `deleteEndedBefore`. Implement `src/storage/link-store.ts`.
- [x] T010 Test `src/discord/onboarding-channels.test.ts` with fakes: port `OnboardingChannels` (`openThread(member)`,
  `post(threadId, message)`, `edit`, `addToThread`, `lockAndArchive`, `archive`, `log(message)`) built from a
  discord.js guild; thread `Interview – {username}` cut to 100 characters, private, not invitable; `checkChannels`
  reports a missing channel, a non-text channel and each missing permission (research R2). Implement
  `src/discord/onboarding-channels.ts`.
- [x] T011 [P] Test `src/discord/interview-texts.test.ts`: every text and component of contracts/interview.md
  (custom ids `interview:uid|modal|confirm|reject:{id}`, `rank:{id}:{R1..R5}` ≤ 100 characters and round-trip
  through `parseInterviewCustomId` / `parseRankCustomId`); Player Names and usernames escaped; `allowedMentions`
  exactly as the contract says. Implement `src/discord/interview-texts.ts`.

**Checkpoint**: domain and storage green; nothing wired into Discord yet.

---

## Phase 3: User Story 1 - A new Member gets Linked (P1) 🎯 MVP

**Independent test**: fake join → thread, button, modal uid → card → "That's me" → Link stored, thread and log
messages as in the contract.

- [x] T012 [US1] Test `src/discord/interview.test.ts`: `onMemberJoined` ignores bots, Members with a Link or an
  open Interview, otherwise opens the thread and posts the ask; the uid button opens the modal; the modal submit
  calls `getPlayer(uid, "onboarding-interview")` once and posts the card with `That's me` / `That's not me`;
  malformed input asks again without a request; a second submit while `checking` gets the private "one moment";
  `That's me` links (US1-3), removes the buttons, archives the thread, logs the Link and pings the leader's Member
  when Linked and on the server (US1-4); no Alliance → Linked without Rank Approval (US1-7); buttons of someone
  else → private note (US1-6); ended Interview → private note. Implement `src/discord/interview.ts`.
- [x] T013 [US1] Test `src/discord/client.test.ts`: intents `Guilds` + `GuildMembers`; `guildMemberAdd` routes to
  `onMemberJoined`; buttons and modals with `interview:` go to the interview handler, `rank:` to the rank handler,
  `pick:` unchanged. Implement in `src/discord/client.ts`; `connect` receives the stores, channel IDs, timeout and
  officer roles; `src/startup.ts` and `src/main.ts` open the stores on the same db and pass them; at ready
  `checkChannels` failing stops Neil with exit 1 and a clear message (FR-018).

**Checkpoint**: a second account joins the test server and gets Linked.

---

## Phase 4: User Story 2 - Wrong, taken and unknown uids (P1)

**Independent test**: 404, 502 "maybe unknown", a Linked uid, "That's not me", the 5th failure, an outage.

- [x] T014 [US2] Test in `src/discord/interview.test.ts`: already Linked uid → refusal naming no one, attempt
  counted, ⛔ log line, the holder not told; `not-found` / `not-prepared` → attempt + help; `That's not me` →
  attempt; `try-again` / `unavailable` → "try again", no attempt; tries-left text; 5th failure → handed off
  (Officer roles mentioned, Member told, buttons removed, 🙋 log, thread left open); two Members confirm the same
  uid → the second is refused (store `already-linked`). Implement in `src/discord/interview.ts`.

---

## Phase 5: User Story 3 - Rank Approval for an unknown rank (P2)

**Independent test**: leader Linked and on the server; leader not Linked; Linked Member is the leader; non-approver
press; Linked Member leaves.

- [x] T015 [US3] Test `src/discord/rank-approval.test.ts`: on a Link with `unknown` rank the approver is chosen
  (leader's Member via `memberForUid(leaderUid)` and a guild member fetch, else Officers), added to the thread
  and asked with R1–R5 buttons; the approver's press stores the rank on the Link, edits the message, archives
  the thread, logs 🎖️; anyone else (the Linked Member too, even as Officer) gets the private refusal; a Member
  approver who left meanwhile → refusal stays, Officers not asked automatically (documented). Implement
  `src/discord/rank-approval.ts` and call it from the confirm path in `src/discord/interview.ts`.
- [x] T016 [US3] Test in `src/discord/interview.test.ts`: `onMemberLeft` cancels a pending Rank Approval for their
  Link (message, buttons removed, archived, log). Implement in `src/discord/interview.ts`; route
  `guildMemberRemove` in `src/discord/client.ts`.

---

## Phase 6: User Story 4 - Start an Interview, and Interviews that end without a Link (P2)

**Independent test**: `/interview` with and without a Link or open Interview; 24 h of silence (fake clock); leave.

- [x] T017 [P] [US4] Test `src/discord/commands.test.ts`: `/interview` exists, no options, description
  "Start your Onboarding Interview"; included in `commands`. Implement in `src/discord/commands.ts`.
- [x] T018 [US4] Test in `src/discord/interview.test.ts`: `/interview` replies privately per contract (opens, points
  to the open thread, or names the Linked Player); after `handed-off` or `abandoned` a new one opens; a rejoin with
  an open Interview or a Link opens none; `onMemberLeft` abandons an open Interview (message, lock, archive, 💤 log).
  Implement in `src/discord/interview.ts`; route the command in `src/discord/client.ts`.
- [x] T019 [US4] Test `src/discord/interview-sweeper.test.ts` (fake clock): `sweep(now)` abandons Interviews past
  `dueAt` (timed out: message, lock, archive, log), recovers `checking` Interviews once at start, deletes rows
  ended more than 90 days ago, and skips (logs) a corrupt row; `startSweeper` runs at ready and every 60 s via an
  injected scheduler. Implement `src/discord/interview-sweeper.ts`; start it from `connect`.

---

## Phase 7: User Story 5 - The Daily Quota runs out mid-Interview (P3)

**Independent test**: spent quota on a modal submit; sweep after 00:00 UTC; long pause not abandoned.

- [x] T020 [US5] Test in `src/discord/interview.test.ts` and `interview-sweeper.test.ts`: `quota-spent` → paused,
  message with 00:00 UTC and the time left, no attempt; the sweeper at or after `resumesAt` mentions the Member and
  asks again with `lastAskedAt = now`; a pause longer than the timeout is not abandoned. Implement in
  `src/discord/interview.ts` and `src/discord/interview-sweeper.ts`.

---

## Phase 8: Polish

- [x] T021 `bot-reviewer` on the whole slice diff; record findings in `review.md` and fix must/should items.
- [x] T022 [P] Docs: `documentation/HOSTING.md` (new variables, Server Members Intent, channel permissions),
  `documentation/GAME-API.md` (leader_id used), STATUS and ROADMAP.
- [x] T023 `spec-auditor` against spec.md; close gaps.
- [X] T024 Manual: the user switches on Server Members Intent, creates the channels, sets the variables, runs
  `npm run commands:register` and walks [quickstart.md](quickstart.md) on the test server; record the result here.

---

## Phase 9: User Story 6 - The Interview starts with a Recommended Player (P1, added 2026-11-01)

**Independent test**: display name `[NML] drlol | #331` → one Player → "That's me" → that uid → Linked with one
name request and no uid request. Design: [data-model.md](data-model.md#addendum-2026-11-01-recommended-player-us6-and-lookups-without-uids-us7).

- [x] T025 [P] [US6] Test `src/domain/recommended-player.test.ts`: `cleanDisplayName` per data-model.md (all examples,
  empty, > 32 characters, letters with accents and non-Latin letters kept). Implement `src/domain/recommended-player.ts`.
- [x] T026 [US6] Test `src/domain/onboarding-interview.test.ts`: the addendum table, every row (`startInterview` →
  `recommending`; `recommendationFound(none | one | several)`; `acceptRecommendation`; `pickMatch(index)` incl. an index
  out of range → `ignored`; `declineRecommendation` without an attempt; `giveUid` with `chosen` (same uid with player →
  `awaiting-confirmation` + `confirmedByChoice`; same uid without player → `checking` keeping `chosen`, then `uidChecked`
  found → `confirmedByChoice`; other uid → chosen dropped); `recoverAfterRestart` for `recommending`; `dueAt`; `timeOut`
  and `memberLeft` from the new steps). Implement `src/domain/onboarding-interview.ts`.
- [x] T027 [US6] Test `src/storage/database.test.ts` + `interview-store.test.ts`: migration 4 (columns, recreated
  `one_open_interview` incl. new steps, a version-3 db upgrades with its rows kept); every new step and `chosen`
  round-trips; corrupt `matches_json` is skipped like other corrupt rows. Implement in `src/storage/`.
- [x] T028 [P] [US6] Test `src/discord/interview-texts.test.ts`: recommendation message (greeting, Player Name, Kingdom,
  Alliance, rank, **no uid**, "That's me" / "That's not me"); pick list (select menu, labels `Name · Kingdom #N`, no uid,
  at most 25, "None of these" button); the uid question after a choice ("give the uid of <name>" + help); custom ids for
  the new actions parse back. Implement `src/discord/interview-texts.ts` (texts also in contracts/interview.md).
- [x] T029 [US6] Test `src/discord/interview.test.ts`: opening an Interview cleans `member.displayName` and calls
  `findPlayer(name, undefined, "interview")`; one free match → recommendation; one Linked match, not found, unavailable,
  quota spent, empty name → plain uid question (no attempt, no reason shown); ambiguous → pick list; accept / pick /
  decline buttons (only the interviewed Member); uid modal with `chosen` → Link at once (no `getPlayer` for a single
  match, one for a pick), FR-006 re-check and Rank Approval as usual; another uid → usual flow. Sweeper: `recommending`
  after restart → uid question. Implement in `src/discord/interview.ts`, `interview-sweeper.ts`.

## Phase 10: User Story 7 - Lookups by name and tag, without uids (P2, added 2026-11-01)

- [x] T030 [P] [US7] Test `src/discord/commands.test.ts` + `lookup.test.ts`: `/player` options `name`, `uid`, `kingdom` in
  that order (description "by name or uid"); `/alliance` options `name`, `tag`, `kingdom` (option `alliance` renamed to
  `tag`); lookups read `tag`. Implement `src/discord/commands.ts`, `src/discord/lookup.ts`.
- [x] T031 [P] [US7] Test `src/discord/lookup-cards.test.ts` (+ `recorded-cards.test.ts`): no uid on the Player card,
  in Alliance Roster rows, in the Player pick list (description `Kingdom #N`) or the roster menu (description: rank).
  Implement `src/discord/lookup-cards.ts`.
- [x] T032 Docs: contracts (interview, 004 lookups), quickstart, TEST-RUN.md (new section for US6/US7), GAME-API.md
  (name lookup used by the Interview), STATUS.
- [ ] T033 `bot-reviewer` on the Phase 9–10 diff; findings into `review.md`; fix must/should items.
- [ ] T034 `spec-auditor` against FR-021–FR-027; close gaps.

## Dependencies

- T001 before T010, T013. T002, T003 before T012. T004 before T008, T012. T005, T006 before T009, T015.
- T007 before T008, T009. T008, T009, T010, T011 before T012.
- US1 (T012 → T013) before US2–US5. US2 T014 after T012. US3 T015 → T016. US4 T017 ∥, T018, T019. US5 T020 after T019.
- Polish after all stories; T024 needs the user (and comes after Phases 9–10).
- T025 ∥ T028 ∥ T030 ∥ T031; T026 → T027 → T029; T032–T034 last.

## Parallel examples

- T002, T003, T005, T006 together; then T011 alongside T007–T010.
- T017 alongside any US4 work.

## Implementation strategy

MVP = Phases 1–3: a joiner gets Linked. Then failures and hand-off (US2), Rank Approval (US3), the command,
timeout and leaving (US4), and the quota pause (US5). Phase 8 closes the slice.
