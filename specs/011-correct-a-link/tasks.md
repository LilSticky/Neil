---
description: "Task list for slice 011, Correct a link"
---

# Tasks: Correct a link

**Input**: [spec.md](spec.md), [discovery](../../documentation/discovery/011-correct-a-link.md). TDD per task
(`test-first` → `implementer`).

## Plan (short)

- Domain `src/domain/link.ts`: `Link` gains `madeBy`: `{ kind: "in-game-proof" }` or `{ kind: "officer-link",
  officerId }`. `officerRank(link, rank, officerId, now)` decides a Rank Approval given by an Officer: refused on the
  Officer's own Link (`own-link`) or without an Alliance (`no-alliance`); otherwise the new `RankOnLink`
  (`rank-approval`, approvedBy the Officer) plus `gameRank` when the Link's rank came from the Game API with a different
  rank (the Officer is told the next Daily Sync uses it).
- Domain `src/domain/onboarding-interview.ts`: `linkByOfficer(interview, uid, player, officerId, now)`: only a
  `handed-off` Interview ends as `linked`; any other step is not applicable.
- Domain `src/domain/officer.ts` (or a new `correction.ts`): who may correct: `/unlink` with another Member needs an
  Officer; `/rank` and `/link` need an Officer and a target other than the caller.
- Storage: migration adding `link.linked_by TEXT NULL` (the Officer of an Officer Link; NULL = In-game Proof);
  `LinkStore` reads and writes `madeBy`. `LinkStore.rankByOfficer(memberId, rank, now)`: in one transaction, update
  the rank and settle a pending Rank Approval on that Link as approved by the Officer; returns the settled approval
  (for its thread) or undefined. Officer Link uses `confirm` with `saveIfStep(interview, "handed-off")` so a raced
  Interview writes nothing.
- Discord `src/discord/unlink.ts` (+ texts): `UnlinkReason` gains `{ kind: "officer", officerId }` and `"self"`. Before
  the Link is removed, for a Member on the server: remove the Managed Roles Neil applied (`applyNameAndRoles` with no
  wanted roles, managedTags = applied roles) and clear the nickname only if it still equals the applied one; cancel the
  pending Rank Approval on their own Link (thread message). Log line names who Unlinked and what could not be removed.
  Private message only for an Officer's Unlink (mentions `/interview`).
- Discord `src/discord/corrections.ts` (+ `corrections-texts.ts`): handlers for `/unlink [member]`, `/rank member
  rank`, `/link member uid` and the Officer Link confirm buttons (prefix `link:`); all replies private. `/link` looks the
  Player up once with the Interview purpose (Quota Reserve), shows it with Confirm/Cancel; Confirm stores the Link,
  ends the Interview (thread message, locked and archived as for any Link), applies name and roles (`onLinked`),
  announces a Rank Approval when the rank is unknown, logs. `/rank` stores, re-applies (`onRankApproved`), posts in a
  settled Rank Approval's thread, logs.
- `src/discord/commands.ts`: `/unlink` (optional `member`), `/rank` (`member`, `rank` choice R1–R5), `/link` (`member`,
  `uid`); `client.ts` routes them and the `link:` buttons. `npm run commands:register` needed again.

## Tasks

- [x] T001 Test then implement domain: `Link.madeBy`; `officerRank` (own Link, no Alliance, unknown, approved earlier,
  game-api same rank, game-api different rank → `gameRank`); who may correct (US1 AS5, US3 AS5–6, US4 AS5).
- [x] T002 Test then implement domain `linkByOfficer` (handed-off → linked with the Officer; every other step not
  applicable) (US4 AS1–2).
- [x] T003 Test then implement storage: migration and `madeBy` round-trip (old rows read as In-game Proof);
  `rankByOfficer` (rank replaced, pending approval settled by the Officer, no pending → undefined); Officer Link through
  `confirm` (uid taken → already-linked, Interview no longer handed off → nothing written).
- [x] T004 Test then implement `unlink.ts` reasons `officer` and `self`: Managed Roles removed, Neil's nickname cleared
  only if unchanged, own pending Rank Approval cancelled with a thread message, waiting ones handed on, log line per
  reason with skipped removals, private message only for `officer`, Member not on the server → no role calls (US1
  AS1–3, AS6; US2 AS1; edge cases).
- [x] T005 Test then implement `/unlink` (corrections handler, command, routing): self and Officer, not Linked, not an
  Officer, no Interview starts, `/interview` afterwards starts one (US1 AS4–5, US2 AS2–3, FR-005).
- [x] T006 Test then implement `/rank`: stores and re-applies, settles a pending Rank Approval with a thread message,
  game-rank note, refusals (US3 AS1–6); Daily Sync keeps an Officer's rank while the game lists none and uses a game
  rank (SC-004).
- [x] T007 Test then implement `/link` and its buttons: lookup with the Interview purpose, confirm/cancel/expiry, stored
  as an Officer Link, Interview ended, name and roles, Rank Approval when unknown, log line; refusals (not handed off,
  uid taken, not found, unavailable, quota spent, self, not an Officer, Member gone) (US4 AS1–6).
- [x] T008 Docs: TEST-RUN.md §6g (collected), 005 spec FR-008 note, HOSTING.md (`commands:register`), ROADMAP, STATUS.
- [x] T009 `bot-reviewer` → `review.md`; `spec-auditor` → `audit.md`; fix must/should.
- [X] T010 Manual check collected in TEST-RUN.md §6g, run later by the user.
