---
description: "Task list for slice 013, Keep newcomers in onboarding"
---

# Tasks: Keep newcomers in onboarding

**Input**: [spec.md](spec.md), [plan.md](plan.md) (decisions D1–D6). TDD per task (`test-first` → `implementer`).

## Tasks

- [x] **T001** [US1–4] Domain `src/domain/onboarding-role.ts` (D1): `ONBOARDING_ROLE_NAME`, `wantsOnboardingRole`,
  `planOnboardingRole`; `isManagedRoleName("Onboarding", tags)` is false for any tags without it.
- [x] **T002** [US1–4] `src/discord/member-roles.ts` (D2): `giveNamedRole` / `takeOffNamedRole`: create once when
  missing without permissions, refuse a role with permissions (`has-permissions`), `hierarchy`, `missing-permissions`,
  never throw; the existing `applyNameAndRoles` tests stay green.
- [x] **T003** [US1–4] `src/discord/onboarding-role.ts` (D3): `give`, `takeOff`, `atStartup` with fakes; a Member not on
  the server changes nothing; a skip is logged with its reason; startup sweep: Linked with role → taken off, not Linked
  without → given, right state → no change, bots skipped, one failure does not stop the others, a failed listing logs
  once. `ServerMembers.all()` added.
- [x] **T004** [US1] `interview.ts` (D4): a joining non-bot Member without a Link gets the role before the thread opens;
  a role failure still opens the Interview; a bot or a Linked Member gets nothing.
- [x] **T005** [US2] `interview.ts` and `corrections.ts` (D4): Interview Link and Officer Link take the role off, also
  with a pending Rank Approval; a hand-off does not; a role failure leaves the Link standing.
- [x] **T006** [US3] `unlink.ts` (D4): Unlink by an Officer and by the Member give the role back; `left` and `missing`
  give nothing.
- [ ] **T007** [US5] Thread deletion (D5): Link and Officer Link without a pending Rank Approval, Rank Approval approved
  and cancelled, Interview abandoned (left, timed out) delete the thread instead of archiving it; a pending Rank
  Approval keeps it; the log lines stay; unused `archive` / `lockAndArchive` removed.
- [ ] **T008** [US1–4] `client.ts` (D4): build the Onboarding Role service, pass it to the Interview, corrections and
  Unlink, run `atStartup()` in the background; `RolesMember.bot`, `ServerMembers.all()` mapped from discord.js.
- [ ] **T009** Docs (D6): HOSTING.md server setup, ADR 8 note, TEST-RUN.md §6i, STATUS, ROADMAP.
- [ ] **T010** `bot-reviewer` on the slice diff; findings into `review.md`; fix must/should items.
- [ ] **T011** `spec-auditor` against spec.md; findings into `audit.md`; close gaps.
- [ ] **T012** Manual check collected in TEST-RUN.md §6i, run later by the user.
