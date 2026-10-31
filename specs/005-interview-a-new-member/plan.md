# Implementation Plan: Interview a new member

**Branch**: `005-interview-a-new-member` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-interview-a-new-member/spec.md`

## Summary

When a Member joins (or runs `/interview` without a Link), Neil opens a private thread in the onboarding
channel and runs the Onboarding Interview as a pure domain state machine: a "Give my uid" button opens a
modal, one `getPlayer` request with the Onboarding Interview purpose finds the Player, "That's me" makes the
Link in one SQLite transaction (unique Member, unique uid). Five failures hand off to the Officers; 24 hours
of silence or leaving abandons; a spent Daily Quota pauses until 00:00 UTC. An unknown rank opens a Rank
Approval for the Member Linked to the Alliance's leader, else the Officers. Every outcome goes to the log
channel. Deadlines are stored and applied by a 60-second sweeper. Details: [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/interview.md).

## Technical Context

**Language/Version**: TypeScript (strict, ES modules) on Node.js 24 LTS

**Primary Dependencies**: discord.js 14 (private threads, buttons, modals, member events), zod 4; no new
dependency

**Storage**: SQLite `neil.db`, migration 3: `onboarding_interview`, `link`, `rank_approval` (ADR 5, ADR 7)

**Testing**: Vitest; fake guild/channel/thread/member ports, fake modal and button interactions, fake clock,
in-memory SQLite (`:memory:`) for stores, the recorded `/players/{uid}` bodies

**Target Platform**: Wispbyte (Linux container); Windows for development

**Project Type**: single-process Discord bot

**Performance Goals**: uid to card under 20 s (one request); joining to Linked under 2 minutes (SC-001)

**Constraints**: one request per uid given; Interview requests may use the Quota Reserve, lookups not; no
Message Content intent; custom ids ≤ 100 chars; one open Interview per Member; no nickname or role change

**Scale/Scope**: one guild, tens of joins per day, ≤ a few hundred Links

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|-----------|-------|--------|
| I. Domain-driven slicing | Capability slice; Onboarding Interview, In-game Proof, Link, Rank Approval approved (2026-10-31) | Pass |
| II. TDD | Every `src/` change test-first; fakes for Discord ports, clock and `fetch` | Pass |
| III. Framework-free domain | Interview, Link and Rank Approval as pure state and functions; time passed in; sweeper and threads in the adapter | Pass |
| IV. Respect the Game API | Only `getPlayer` through the one client, purpose `onboarding-interview`, cached, counted | Pass |
| V. Least privilege | New intent `GuildMembers` only (needed for join/leave); modal instead of Message Content; channel permissions listed; personal data in ADR 7; every outcome logged to the log channel | Pass |
| VI. Context never gets lost | STATUS/ROADMAP per change; ADR 7; HOSTING.md gains the new variables and the intent switch | Pass |
| VII. Small vertical slices | Five stories; US1 alone is usable end to end. The slice is the largest so far (see Complexity Tracking) | Pass with note |
| Constraints | New settings validated at startup; channels checked at ready | Pass |

Post-design re-check (after Phase 1): unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/005-interview-a-new-member/
├── discovery.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── interview.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── onboarding-interview.ts  # Interview union, transitions, dueAt, MAX_FAILED_ATTEMPTS
│   ├── link.ts                  # Link, RankOnLink, rankOnLink(player)
│   ├── rank-approval.ts         # RankApproval, chooseApprover, mayApprove, approve, cancel
│   ├── lookup-input.ts          # + parseInterviewUid (trims a leading #)
│   └── player.ts                # + PlayerAlliance.leaderUid
├── game-api/
│   ├── schemas.ts               # + alliance.leader_id on the player body
│   └── client.ts                # leaderUid mapping
├── storage/
│   ├── database.ts              # + migration 3
│   ├── interview-store.ts       # open/ended Interviews, due query, one-open rule, cleanup after 90 days
│   └── link-store.ts            # Links and Rank Approvals; confirm transaction
├── discord/
│   ├── commands.ts              # + /interview
│   ├── interview-texts.ts       # every text and component of contracts/interview.md
│   ├── interview.ts             # start (join, /interview), uid modal, confirm/reject, member left
│   ├── rank-approval.ts         # R1–R5 buttons
│   ├── interview-sweeper.ts     # timeouts, quota resets, restart recovery, cleanup
│   ├── onboarding-channels.ts   # thread create/add/lock/archive, log channel, startup check (ports)
│   └── client.ts                # GuildMembers intent; member events; interview:/rank: routing
├── config.ts                    # + DISCORD_ONBOARDING_CHANNEL_ID, DISCORD_LOG_CHANNEL_ID, INTERVIEW_TIMEOUT_MINUTES
├── startup.ts                   # passes stores and settings to connect
└── main.ts                      # wires the new stores
```

**Structure Decision**: the layout from AGENTS.md; no new folders.

## Manual steps for the user

1. Developer Portal: switch on **Server Members Intent** for Neil (before the merge deploys, or Neil cannot
   log in).
2. Create the onboarding and log channels on the test and production servers with the permissions in
   [quickstart.md](quickstart.md); set the two channel IDs in `.env` and the Wispbyte panel.
3. After the merge, run `npm run commands:register` once (adds `/interview`).

## Complexity Tracking

| Note | Why | Simpler alternative rejected because |
|------|-----|--------------------------------------|
| Five stories in one slice | The roadmap row bundles them; each is small and the domain is shared | Splitting Rank Approval and timeouts into their own slices would leave Interviews that never end or Links without a usable rank; the user chose Rank Approval in 005 |
