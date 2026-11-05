---
description: "Task list for slice 018, Start Interviews for unlinked Members"
---

# Tasks: Start Interviews for unlinked Members

**Input**: [spec.md](spec.md), [plan.md](plan.md) (decisions D1–D8), [contracts/interview-start.md](contracts/interview-start.md),
[quickstart.md](quickstart.md). TDD per task (`test-first` → `implementer`); the constitution makes tests mandatory, so each
task below starts red and has no separate test task.

## Phase 1: Setup

No setup: no new dependency, migration or environment variable.

## Phase 2: Foundational

Blocks every story.

- [x] T001 [P] Write ADR 11, reading the presence of Members (D6), in `documentation/adr/0011-reading-the-presence-of-members.md` and its index line in `documentation/adr/README.md`.
- [x] T002 [P] Domain (D1) in `src/domain/interview-start.ts`: `cameOnline(before, after)` (true when `before` is offline or undefined and `after` is not offline) and `wantsInterview({ bot, linked, open, handedOff })` (true when all four are false).

## Phase 3: User Story 1, a Member who comes online is interviewed (P1)

**Independent test**: an unlinked Member goes from offline to online and an Interview opens; a Linked Member doing the same gets none.

- [x] T003 [US1] `Interviews.onMemberOnline(member)` in `src/discord/interview.ts` (D2, D3): skips a bot, a Linked Member, an open Interview and a latest Interview with step `handed-off`; otherwise gives the Onboarding Role and calls `openInterview`; a second call for the same Member while one is starting returns at once; a failure is logged, never thrown. `joinMember` does not change.
- [ ] T004 [US1] Adapter in `src/discord/client.ts` (D5): the `GuildPresences` intent; `Events.PresenceUpdate` checks the guild id, asks `cameOnline`, reads the Member from the event or `fetchMember`, and calls a new `memberOnline` handler. No `guild.members.fetch()` without an id.

## Phase 4: User Story 2, Neil interviews the unlinked Members it sees when it starts (P1)

**Independent test**: Neil starts with one unlinked Member online, one offline and one Linked online; only the first gets an Interview.

- [ ] T005 [US2] `Interviews.onlineAtStartup(members)` in `src/discord/interview.ts` and the startup line in `src/discord/interview-texts.ts` (D4, contract): one Member after another, counts `started` and `failed`, a failure is logged and the next follows, one line when either count is above 0.
- [ ] T006 [US2] Startup chain in `src/discord/client.ts` (D5): the online Members from `guild.presences.cache`, read with `fetchMember`, after the Onboarding and Doctor Role sweeps in the same chain; skipped when Neil is disconnecting.

## Phase 5: Polish

- [ ] T007 Docs: `documentation/HOSTING.md` Presence Intent before the deploy (D8), `documentation/TEST-RUN.md` section from quickstart.md, `documentation/STATUS.md`, `documentation/ROADMAP.md` row 018.
- [ ] T008 `bot-reviewer` on the slice diff; findings into `specs/018-start-interviews-for-unlinked-members/review.md`; fix must and should items.
- [ ] T009 `spec-auditor` against `spec.md`; report into `specs/018-start-interviews-for-unlinked-members/audit.md`; close the gaps.
- [ ] T010 Manual check on the test server (`documentation/TEST-RUN.md`, user), after switching on Presence Intent and deploying.

## Dependencies

- T002 before T003 and T004. T003 before T004 and T005. T005 before T006.
- US2 reuses US1's rule (T003).
- T007–T010 last.

## Parallel examples

- Foundational: T001 and T002 together.

## Implementation strategy

US1 and US2 ship together: both are the request, and they share one rule. The deploy must wait for the Presence Intent, or Neil cannot log in.
