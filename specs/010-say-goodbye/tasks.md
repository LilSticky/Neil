---
description: "Task list for slice 010, Say goodbye"
---

# Tasks: Say goodbye

**Input**: [spec.md](spec.md). TDD per task (`test-first` → `implementer`).

## Plan (short)

- Domain `src/domain/rank-approval.ts`: `handToOfficers(approval)`: a pending Rank Approval whose approver is a Member
  gets the Officers as approver; any other state or approver gives `ok: false`.
- Storage `src/storage/link-store.ts`: `unlink(memberId)` deletes the Link and its applied state in one transaction and
  returns the removed Link (undefined when there was none); `pendingApprovedBy(memberId)` lists pending Rank Approvals
  whose approver is that Member; saving a handed-on approval writes the approver while still pending.
- Discord `src/discord/unlink.ts` (+ `unlink-texts.ts`): `createUnlink(deps).unlink(member, reason: "left" | "missing")`:
  read the applied nickname, `links.unlink`, log line, private message (errors swallowed), hand Rank Approvals on
  (save, post in thread mentioning Officer roles; a gone thread is fine). Never throws; failures to the console.
- Wiring: `interviews.onMemberLeft` (existing abandon/cancel first) then Unlink "left". Startup: sweep all Links,
  `memberOf` undefined → Unlink "missing" (errors skip the Member). Daily Sync `present()`: undefined → Unlink
  "missing" instead of skip. Discord adapter gains `sendPrivateMessage(userId, text)`.

## Tasks

- [ ] T001 Test then implement `handToOfficers` (`src/domain/rank-approval.test.ts`): pending/member → officers;
  pending/officers, approved, cancelled → unchanged.
- [ ] T002 Test then implement storage: `LinkStore.unlink` (Link and applied gone, uid re-linkable, second call
  undefined, approval history kept); `pendingApprovedBy`; saving a handed-on approval.
- [ ] T003 Test then implement `src/discord/unlink.ts` + texts: US1 1–3, US2 1–2, edge cases (log channel fails,
  thread gone, private message refused, no Link → nothing).
- [ ] T004 Test then implement wiring: leave event Unlinks after the Interview/Rank Approval handling (US1 4–5);
  startup sweep and Daily Sync Unlink missing Members, not on fetch failure (US3 1–3, US2 3); `sendPrivateMessage`
  in `client.ts`.
- [ ] T005 Docs: TEST-RUN.md §6f (collected), 009 spec FR-007 note, ROADMAP, STATUS.
- [ ] T006 `bot-reviewer` → `review.md`; `spec-auditor` → `audit.md`; fix must/should.
- [ ] T007 Manual check collected in TEST-RUN.md §6f, run later by the user.
