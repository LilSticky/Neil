# Review: slice 005 (T021)

`bot-reviewer` on `git diff main...HEAD -- src scripts`, 2026-10-31. 3 must fix, 5 should fix, 4 nits. Status column
filled in as they are fixed.

| # | Severity | Where | Finding / fix | Status |
|---|---|---|---|---|
| 1 | must fix | `src/discord/interview.ts` (confirm, reject, refuseConfirmation), `interview-sweeper.ts`, `interview-store.ts` save | Lost update: handlers save an Interview read before an await. A double "That's me" makes the second press see `already-linked` (the Member's own Link) and overwrite the `linked` row with `awaiting-uid`, posting "already linked to another member" and ⛔. Confirm vs reject, sweeper timeout vs confirm, and leaving during `checking` race the same way. Fix: conditional save (`WHERE id = ? AND step = ?`), refuse privately when the row changed; "this Member already holds this uid" counts as done. | fixed |
| 2 | must fix | `src/discord/interview.ts` onCommand, `client.ts` | `/interview` makes three Discord calls before `reply` and can miss the 3 s limit; a throw in `openThread` leaves the command unanswered. Fix: `deferReply` (ephemeral) first, then `editReply`; ephemeral error reply on failure. | fixed |
| 3 | must fix | `src/discord/rank-approval.ts` | Two Officers pressing at once both approve; the second overwrites the rank, two posts and two log lines. Fix: save only `WHERE state = 'pending'`, refuse privately when nothing changed. | fixed |
| 4 | should fix | `src/discord/interview.ts` submitModal/checkUid | `checking` is saved before `deferUpdate`; a throw there or in `getPlayer` leaves the row `checking` (no `due_at`) until a restart. Fix: on any throw go back to `awaiting-uid` and post `unavailableMessage`. | fixed |
| 5 | should fix | `src/discord/interview.ts` guarded | A throw before acknowledging leaves "This interaction failed". Fix: if not yet acknowledged, reply ephemerally "something went wrong". | fixed |
| 6 | should fix | `src/discord/interview.ts` openInterview | The thread is created before `create()`; a join racing `/interview`, or `create` throwing, leaves an empty private thread. Fix: delete the thread on `already-open` or error. | fixed |
| 7 | should fix | `src/discord/client.ts` | `GuildMemberAdd`/`Remove` are not filtered to `guildId`. Fix: check `member.guild.id === guildId`. | fixed |
| 8 | should fix | `src/discord/interview.ts` | Buttons in a non-matching step, or unparsable custom ids, return without acknowledging. Fix: reply ephemerally with `interviewEndedReply`. | fixed |
| 9 | nit | `src/config.ts` | `INTERVIEW_TIMEOUT_MINUTES` has no upper bound; a huge value gives an Invalid Date. Fix: cap at 525600 (one year). | fixed (f714ecf) |
| 10 | nit | `interview-sweeper.ts`, `interview.ts` | If the thread is gone, `post`/`lock` throws and the log line is lost. Fix: log first. | fixed |
| 11 | nit | `src/discord/interview-texts.ts` quotaResetMessage | The Member is mentioned twice. | fixed (f714ecf) |
| 12 | nit | `src/discord/onboarding-channels.ts` | Thread name built again instead of `interviewThreadName`. | fixed |

## Passed

Intents (Guilds, GuildMembers only); interactions before the channel check wait on cached fetches only; owner checks
before any work; a double modal submit is serialised by the synchronous save of `checking`; the confirm transaction is
atomic with UNIQUE constraints as the final guard; restart recovery; the sweeper never rejects and runs do not overlap;
`allowedMentions` explicit everywhere and Game text escaped; stored data matches ADR 7 with 90-day deletion; no secrets
logged; one Game API request per uid with purpose `onboarding-interview` after the local holder check; `leader_id`
validated; pure domain, no `any` or `!`.

## Audit gaps (T023, [audit.md](audit.md)) fixed with these

- A failing channel check at ready makes `start` exit 1 (test). Covered.
- Non-owner presses on "That's me", "That's not me" and the modal (tests). Covered.
- Restart: a paused or awaiting-confirmation Interview keeps working after a restart (tests). Covered.

## 2026-11-01: Recommended Player and uid-free lookups (T033)

Diff `e0ef8de..HEAD -- src/`. No must; 2 should, 4 could/nit.

| Level | Where | Finding | Fix |
|-------|-------|---------|-----|
| should | `src/discord/interview.ts` (chosen-uid path), `src/storage/interview-store.ts` `inFlight` | `awaiting-confirmation` with `confirmedByChoice` is saved before the Link; a restart in between leaves the Member without buttons | recovery also takes it and runs the Link again |
| should | `src/discord/interview-texts.ts` pick list | labels not truncated to 100; Game API match names have no length limit | truncate (`optionLabel`) |
| could | `src/domain/onboarding-interview.ts` `recoverAfterRestart` | `checking` loses `chosen` on restart | keep `chosen` |
| could | `src/discord/interview.ts` pick list | matches Linked to another Member are listed; picking one costs a try | filter them out |
| could | `src/discord/interview.ts` pick of an invalid uid | answered "ended" | `somethingWentWrongReply` |
| nit | `src/storage/interview-store.ts` `checking()` | test-only now | remove |

Checked fine: ownership and acknowledge-once on accept/decline/pick, Quota Reserve purpose, no uids in recommendation/pick list/lookups, migration 4 in a transaction, escaping, pure domain.

### Closed (checked 2026-11-04 against `24a08df`)

All six findings are fixed. This pass checked the code and tests; `bot-reviewer` was not run again.

| Finding | Where it stands now |
|---------|---------------------|
| should: restart before the Link | `isInFlight` in `src/storage/interview-store.ts` also takes `confirmedByChoice`; test in `src/discord/interview-sweeper.test.ts` ("a restart must not leave the Member with no Link and no card") |
| should: pick list labels | `optionLabel` in `src/discord/interview-texts.ts`; test "a label longer than 100 characters is cut to 100" |
| could: `checking` loses `chosen` | `recoverAfterRestart` keeps it through `withChoice` |
| could: Linked matches in the pick list | filtered by `notLinkedToOther` in `src/discord/interview.ts` |
| could: pick of an invalid uid | `pickPlayer` answers `somethingWentWrongReply` |
| nit: `checking()` | removed |
