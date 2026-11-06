# Tasks: Set up the server

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/cli.md](contracts/cli.md)

TDD for all code: each code task is `test-first`, then `implementer`. `[P]` means it can run beside the others in its phase.

## Phase 1: Decision

- [x] T001 ADR 12 in `documentation/adr/`, its index, and the exception in principle V of `.specify/memory/constitution.md` (version 1.1.0)

## Phase 2: User Story 4 - Alliance roles carry brackets (P1)

**Independent test**: role names hold `[NML]`; a plain `NML` role ends as the same role named `[NML]`.

- [x] T002 [US4] `allianceRoleName(tag)` gives `[TAG]`; `rolesFor` uses it; `isManagedRoleName` also takes `[NML]` when the tags hold `NML`, in `src/domain/managed-roles.ts`
- [x] T003 [US4] Before working out what a Member holds, rename a permission-free plain `NML` to `[NML]` for each wanted `[NML]` when no `[NML]` exists, not touching Officer roles, integration roles or roles at or above Neil, in `src/discord/member-roles.ts` and its `RolesGuild` port and fake (research R5)
- [x] T004 [US4] Check every other reader of role names against `[NML]`: `src/discord/name-and-roles.ts`, `src/discord/unlink.ts`, `src/discord/daily-sync.ts`; a Member Unlinked or leaving the Alliance with old Applied State `NML` loses `[NML]`

## Phase 3: User Story 1 - The owner sees what would change (P1)

**Independent test**: a plan from a layout and a server state lists the expected steps and findings, with no write.

- [ ] T005 [US1] Layout types and expansion in `src/domain/server-layout.ts`: the table in data-model.md (Expansion), `#<Home Kingdom>` replaced by the Kingdom role, channel overwrites = category's then own, own winning per permission
- [ ] T006 [US1] `planSetup(layout, server)` in `src/domain/setup-plan.ts`: steps `create-role`, `create-category`, `create-channel`, `correct-overwrites`; matching per research R3; Community per R6; each `[TAG]` role gets an area, also `[TAG]` created in no layout
- [ ] T007 [US1] Findings in `src/domain/setup-plan.ts`: `outside-layout`, `extra-overwrite`, `wrong-type`, `other-category`, `duplicate-name`, `external-role-missing`, `role-has-permissions` (not Moderator, King or a bot's role), `role-above-neil`, `fallback-to-text`, `hides-from-everyone`
- [ ] T008 [US1] zod parsing of the layout file with all "Rules checked on load" in data-model.md, each failure naming the place, in `src/discord/server-setup.ts`
- [ ] T009 [US1] Read the server into the state of data-model.md through a `SetupServer` port, and write the report text per contracts/cli.md, in `src/discord/server-setup.ts`
- [ ] T010 [US1] `server-layout.json`: SERVER-SETUP section 3, all 17 languages, AD and KvK (text, voice, announcements only King posts, tactics forum, intel, seen by `PvP` and `Events`; KvK also five tactical voice channels); a test that loads it, holds every `GAME_LANGUAGES` role, and allows Doctor only in the Guest area

## Phase 4: User Story 2 - The owner builds a new server (P1)

**Independent test**: applying a plan to a fake empty server yields the layout.

- [ ] T011 [US2] `applySetup(plan, port)` in `src/discord/server-setup.ts`: roles, then categories, then channels, resolving names to IDs; one write per channel for all its overwrites; merge per research R4; a failed write is recorded and the rest go on; a step whose category failed is reported failed
- [ ] T012 [US2] The Administrator check (research R7): a real run without it writes nothing
- [ ] T013 [US2] `scripts/setup-server.ts` and `server:setup` in `package.json`: arguments, settings per research R2 and exit codes per contracts/cli.md; the REST adapter behind `SetupServer`; IDs, steps left by hand and the Administrator reminder at the end; the token never printed

## Phase 5: User Story 3 - The owner runs it again (P2)

**Independent test**: planning the state left by a real run gives no steps.

- [ ] T014 [US3] Tests through plan, apply and plan on the fake: the second plan has no steps; extra overwrites and other permissions inside a corrected overwrite survive; channels outside the layout are never written; fix what they find

## Phase 6: Documents and checks

- [ ] T015 [P] SERVER-SETUP.md: `[NML]` roles, AD and KvK in section 3, the script in section 4 and section 7, "What Neil never does" stays true; STARTUP-GUIDE.md and MIGRATION-GUIDE.md: steps shrink to the script, with the Administrator grant, the warnings and the announced date
- [ ] T016 [P] DICTIONARY: Alliance Duel, Kingdom vs Kingdom, `[TAG]` in Managed Role. Discovery section 6: this slice's answers. `specs/019` T008 ticked
- [ ] T017 TEST-RUN.md §6q from quickstart.md; STATUS and ROADMAP
- [ ] T018 `bot-reviewer` and `spec-auditor`, findings fixed, review in `specs/020-set-up-the-server/review.md`
- [ ] T019 Manual check on the test server (quickstart.md): needs the user

## Dependencies

T001 first. US4 and US1 are independent. US2 needs US1. US3 needs US2. Documents after the code.

**MVP**: US4 and US1: a dry run on any server, changing nothing.
