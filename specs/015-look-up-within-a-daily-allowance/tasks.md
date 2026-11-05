---
description: "Task list for slice 015, Look up within a Daily Allowance"
---

# Tasks: Look up within a Daily Allowance

**Input**: [spec.md](spec.md), [plan.md](plan.md) (decisions D1–D11), [data-model.md](data-model.md),
[contracts/usage.md](contracts/usage.md), [quickstart.md](quickstart.md). TDD per task (`test-first` → `implementer`);
the constitution makes tests mandatory, so each task below starts red and has no separate test task.

## Phase 1: Setup

No setup: no new dependency, environment variable, intent or permission.

## Phase 2: Foundational

Blocks every story.

- [x] T001 [P] Write ADR 10, personal data of Member usage (kept for the current UTC day only, D4) in `documentation/adr/0010-personal-data-of-member-usage.md` and its index line in `documentation/adr/README.md`.
- [x] T002 [P] Domain (D1) in `src/domain/daily-allowance.ts`: `expectedLookupMembers(records, day)` (average of the latest 4 records on `day`'s weekday before `day`, not rounded; 100 with no records or an average of 0), `dailyAllowance({ limit, reserve, syncShare, expected })` (`floor((limit − reserve − syncShare) ÷ expected)`, at least 1), `mayUse(used, allowance, officer)` (an Officer always may; otherwise `used < allowance`), `daysToRecord(lastRecorded, firstUsage, today)` (at most 28).
- [x] T003 [P] Storage (D4) in `src/storage/database.ts` and `src/storage/member-usage-store.ts`: migration 13 with `member_usage` (`day` TEXT, `member_id` TEXT `CHECK (member_id <> '' AND member_id NOT GLOB '*[^0-9]*')`, `requests` INTEGER `CHECK (requests > 0)`, primary key `(day, member_id)`) and `lookup_member_day` (`day` TEXT primary key, `lookup_members` INTEGER `CHECK (lookup_members >= 0)`); a request counted with an upsert; the rollover in one transaction (data-model.md, steps 1–3); reads validated by zod; survives reopening.
- [x] T004 Keeper (D5) in `src/game-api/allowance-keeper.ts`, after T002 and T003: `allowance()`, `expected()`, `usageOf(memberId)`, `top(10)` (most first, ties by Member id), `mayCharge(caller)`, `charge(caller)`; rolls over lazily on any read; the allowance follows `QuotaKeeper.today().limit` at the next read.

## Phase 3: User Story 1, lookups stop at the Daily Allowance (P1)

**Independent test**: a Member with an allowance of 3 makes 3 uncached lookups, the 4th is refused with the reset time, and a cached lookup still answers.

- [x] T005 [US1] Charged view (D2, D3) in `src/game-api/client.ts`: `chargedTo(caller: LookupCaller): ChargedLookups` with `getPlayer`, `findPlayer`, `getAlliance`, `findAlliance`, always the `lookup` purpose; `ChargedResult<T> = LookupResult<T> | { kind: "allowance-spent", resetsAt }`; existing methods keep their signatures.
- [x] T006 [US1] Charging in `src/game-api/client.ts` (D6, D7, D8): `attempt` goes deadline, `mayCharge`, `tryCount`, `charge` with no `await` in between; `mayRetry` also asks `mayCharge`; failed requests and retries count; the flight key of a charged lookup holds the Member; `orStale` also covers `allowance-spent`. Cached answers charge nothing, and two simultaneous lookups with one request left send one.
- [x] T007 [US1] Caller (D10) in `src/discord/lookup.ts` and `src/discord/pick.ts`: `callerOf(interaction, officerRoleIds)` with `isOfficer` and `memberRoleIds()`, added to `PickInteraction` and the lookup interaction.
- [x] T008 [US1] Use the charged view for `/player`, `/alliance`, Alliance Overview, their pick lists and buttons in `src/discord/lookup.ts` and `src/discord/pick.ts`; the refusal from contracts/usage.md, private, in `src/discord/usage-texts.ts` and `src/discord/lookup-cards.ts`. `pickExileMatch` stays uncharged; a test proves `/reaper`, the Interview, the Daily Sync and role reads charge nobody (spec US1 scenarios 9–11).

## Phase 4: User Story 2, the allowance follows how many Members look up (P1)

**Independent test**: no history gives a divisor of 100; 40, 60, 80, 100 on the last four Saturdays give 70, and a limit of 2,000, reserve of 100 and share of 500 give 20.

- [x] T009 [US2] Keeper scenarios in `src/game-api/allowance-keeper.test.ts`: the spec's US2 scenarios 1–7 end to end through the store (rollover records a day with 0, a new limit applies at the next read, counts and allowance unchanged after reopening the database); fix what they find in `src/game-api/allowance-keeper.ts`.
- [x] T010 [US2] Composition in `src/startup.ts`: build `MemberUsageStore` and the keeper from `GAME_API_QUOTA_RESERVE` and `SYNC_SHARE`, and hand the keeper to the client.

## Phase 5: User Story 3, every lookup reply shows the usage (P1)

**Independent test**: the usage line appears on a card, a pick list, a "not found" reply and a refusal, with the Member's numbers after the request.

- [ ] T011 [US3] Usage line (D9) in `src/discord/usage-texts.ts`: the Member and Officer texts from contracts/usage.md; `withUsage(message, line)` puts the line last in the embed footer, or at the end of the text when there is no embed.
- [ ] T012 [US3] Show it in `src/discord/lookup.ts` and `src/discord/pick.ts`: `showLookup` and `answerPick` take a `usage` function read after the request, on cards, pick lists, failure replies, the Alliance Overview and its pages, and the roster menu's answers; not on replies to invalid input nor on `/reaper`.

## Phase 6: User Story 4, a Member learns about the allowance (P2)

**Independent test**: `/usage` replies privately with the Member's numbers; the Link note is sent at an Interview Link and at an Officer Link.

- [ ] T013 [P] [US4] `/usage` in `src/discord/usage.ts`, `src/discord/commands.ts` and `src/discord/client.ts`: the contract's text, private, no Game API request.
- [ ] T014 [P] [US4] Link note (D11) in `src/discord/interview-texts.ts`, `src/discord/interview.ts` and `src/discord/corrections.ts`: `linkedMessage` gains the note; the Interview Link and the Officer Link also send it with `sendPrivateMessage`; a private message that fails is logged and the Link stands.

## Phase 7: User Story 5, Officers see who causes the requests (P2)

**Independent test**: `/quota` lists the top Members by today's count, at most 10, and says `No lookups yet today.` when there are none.

- [ ] T015 [US5] `/quota` in `src/discord/quota.ts`: the contract's lines after the current ones; `E` with at most one decimal; the list pings nobody.

## Phase 8: Polish

- [ ] T016 Docs: `documentation/TEST-RUN.md` section from quickstart.md, `documentation/DICTIONARY.md` checked against the slice's terms, `documentation/STATUS.md`, `documentation/ROADMAP.md` row 015.
- [ ] T017 `bot-reviewer` on the slice diff; findings into `specs/015-look-up-within-a-daily-allowance/review.md`; fix must and should items.
- [ ] T018 `spec-auditor` against `spec.md`; report into `specs/015-look-up-within-a-daily-allowance/audit.md`; close the gaps.
- [ ] T019 Manual check on the test server (`documentation/TEST-RUN.md`, user) after deploying and `npm run commands:register`.

## Dependencies

- T002 and T003 before T004; T004 before T005–T010.
- T005 → T006 → T007 → T008 in order (same files).
- US3 needs US1 (T008). T009 needs T004 only; T010 needs T006.
- US4 needs T004 and T011's texts file; US5 needs T004. T013, T014 and T015 touch different files, so they can run side by side.
- T016–T019 last.

## Parallel examples

- Foundational: T001, T002 and T003 together.
- After US3: T013, T014 and T015 together.

## Implementation strategy

MVP is US1 + US2 (a working limit) with T010's wiring. Because a refusal without a visible count would surprise Members, the slice merges only with US3–US5: no partial release.
