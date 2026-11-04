# Implementation Plan: Look up within a Daily Allowance

**Branch**: `015-look-up-within-a-daily-allowance` | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

As in slices 009–014 the plan is short and holds its decisions here. The tables are in [data-model.md](data-model.md),
the commands and texts in [contracts/usage.md](contracts/usage.md) and the checks in [quickstart.md](quickstart.md). No
research.md: the open questions were settled in the spec's Clarifications.

## Summary

The Game API client gets a charged view, `chargedTo(caller)`, which `/player`, `/alliance`, the Alliance Overview and
their pick lists use. Each request sent through it, retries and failures included, is counted against the Member in a
new `member_usage` table, and refused once the Daily Allowance is used. Everything else keeps calling the client as it
does today, so `/reaper`, the Onboarding Interview, the Daily Sync and role reads are not charged and do not change.
The allowance is derived on every read, so it follows the reported limit and survives a restart. Lookup replies show
the usage, `/usage` is new, `/quota` shows the top Members, and a Link tells the Member about all of it.

## Technical Context

TypeScript (strict), Node, discord.js, Vitest, SQLite (`node:sqlite`, synchronous, migration 13). No new Game API
endpoint, environment variable, intent or permission. `/usage` is a new command, so `npm run commands:register` is
needed after deploying. Scale: up to 150 Lookup Members a day, so `member_usage` holds a few hundred rows at most.

## Constitution Check

| Principle | Check |
|-----------|-------|
| I Domain slicing | Named after what a Member does. Daily Allowance and Lookup Member were approved 2026-11-04. |
| II TDD | Every task goes red first. |
| III Framework-free domain | `src/domain/daily-allowance.ts` is pure; the day and history reach it as parameters. |
| IV Respect the Game API | Lowers use of the API. All requests still go through the one client. |
| V Careful with Members | Per-Member counts are personal data: ADR 10, kept only for the current UTC day (D4). |
| VI Context | STATUS and ROADMAP updated with this plan. |
| VII Small slices | Usable end to end. Large for one slice, but every story reuses the same keeper. |

No deviations.

## Decisions

- **D1 Domain** `src/domain/daily-allowance.ts` (pure):
  - `expectedLookupMembers(records, day)`: the average of the latest 4 records on `day`'s weekday, before `day`. It is
    100 when there are none, or when their average is 0 (spec, Edge Cases). Not rounded.
  - `dailyAllowance({ limit, reserve, syncShare, expected })`: `floor((limit − reserve − syncShare) ÷ expected)`, at
    least 1.
  - `mayUse(used, allowance, officer)`: an Officer always may; otherwise `used < allowance`.
  - `daysToRecord(lastRecorded, firstUsage, today)`: the days to record at a rollover, at most 28.
- **D2 Who is charged is explicit.** The `lookup` purpose cannot say it: `/reaper` and role reads use it too. So
  `GameApiClient.chargedTo(caller: LookupCaller): ChargedLookups` returns `getPlayer`, `findPlayer`, `getAlliance` and
  `findAlliance` without a purpose (always `lookup`), for `LookupCaller = { memberId, officer }`. The existing methods
  keep their signatures, so `/reaper` does not change. The `/reaper add` pick in `pick.ts` (`pickExileMatch`) stays
  uncharged.
- **D3 Its own result type.** `ChargedResult<T> = LookupResult<T> | { kind: "allowance-spent", resetsAt }`. `LookupResult`
  stays as it is, because code that is never charged cannot be refused for the allowance.
- **D4 Storage** `src/storage/member-usage-store.ts`, migration 13 ([data-model.md](data-model.md)). `member_usage` holds
  the current UTC day only. The rollover records each finished day's Lookup Member count and deletes its usage rows in
  one transaction. `lookup_member_day` keeps 28 days, which is all four same-weekday records need.
- **D5 Keeper** `src/game-api/allowance-keeper.ts`, beside `QuotaKeeper`, with `allowance()`, `expected()`,
  `usageOf(memberId)`, `top(10)`, `mayCharge(caller)` and `charge(caller)`. It rolls over lazily on any read, as
  `todaysQuota` does. It derives the allowance from `QuotaKeeper.today().limit`, so a new limit applies at the next read.
- **D6 Order in `attempt`**: deadline, then `mayCharge`, then `tryCount`, then `charge`, with no `await` in between.
  A refused allowance counts nothing against the Daily Quota, and a request refused by the quota charges nothing. Being
  synchronous, this is also what sends only one of two simultaneous lookups with one request left. `mayRetry` also asks
  `mayCharge`; a retry counts as a request, as it does for the Daily Quota.
- **D7 In-flight requests are shared per Member.** A charged lookup's flight key holds the Member, so a refusal can never
  reach a different Member and nobody rides on a request charged to someone else. Cost: two Members asking for the same
  uncached answer in the same moment send two requests, each charged to its Member.
- **D8 Stale answers**: `orStale` also covers `allowance-spent`, so a spent Member gets a stale entry if there is one,
  as with a spent quota. It sends no request and its footer already shows its age.
- **D9 Usage line**: `showLookup` and `answerPick` take a `usage` function and use one helper, `withUsage(message, line)`:
  the line goes last in the embed footer, or at the end of the text when there is no embed. It is read after the request,
  so it shows the count including that request. The Overview and roster page buttons use the same helper. Replies to
  invalid input made no lookup and show no line. On a public card the line is public too: the spec asks for it on every
  reply, and a private follow-up would add a message to every lookup.
- **D10 Officer**: `callerOf(interaction, officerRoleIds)` uses `isOfficer` with `memberRoleIds()`, which `/quota`
  already reads; `PickInteraction` and the lookup interaction gain it.
- **D11 Link note**: `linkedMessage` gains the note, and the Interview Link and the Officer Link also send it with
  `sendPrivateMessage`. A private message that fails is logged and the Link stands.

## Project Structure

```text
src/domain/daily-allowance.ts            new: D1
src/game-api/allowance-keeper.ts         new: D5
src/game-api/client.ts                   chargedTo, attempt, mayRetry, flight key, orStale
src/storage/database.ts                  migration 13
src/storage/member-usage-store.ts        new: D4
src/discord/usage.ts, usage-texts.ts     new: /usage, usage line, refusal, Link note
src/discord/lookup.ts, pick.ts           charged view, usage line
src/discord/lookup-cards.ts              failure text for allowance-spent
src/discord/quota.ts                     allowance, Expected Lookup Members, top Members
src/discord/commands.ts, client.ts       /usage, wiring
src/discord/interview.ts, corrections.ts, interview-texts.ts    Link note
src/startup.ts                           composition
documentation/adr/0010-*.md              personal data of Member usage
```

## Complexity Tracking

None.
