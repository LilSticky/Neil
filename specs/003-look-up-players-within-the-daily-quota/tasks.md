---
description: "Task list for slice 003, Look up players within the daily quota"
---

# Tasks: Look up players within the daily quota

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: required. TDD is mandatory (constitution II): every `src/` task is a pair, a failing test first
(`test-first` agent), then the code that makes it green (`implementer`). Tests sit next to their files as
`*.test.ts`. No test touches the network or waits in real time (`now`, `sleep`, `random` are injected).

**Organization**: by user story. US1 and US2 are P1, US3 is P2, US4 is P3. US2 builds on the
`QuotaKeeper` from Phase 2; US1 on the `fetchedAt` change from Phase 2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md

---

## Phase 1: Setup (configuration)

- [x] T001 Test then implement config in `src/config.test.ts` / `src/config.ts`: `DISCORD_MODERATOR_ROLE_ID` and
  `DISCORD_KING_ROLE_ID` are required and "Discord ID (17–20 digits)" like `DISCORD_GUILD_ID`
  (`Configuration.officerRoleIds: readonly [string, string]`); `GAME_API_CACHE_MINUTES` is optional, "whole number
  ≥ 10", default 10 (`Configuration.cacheTtlMs`); errors never echo values. Add all three to `env.example`. Update
  every test that builds a full env (`src/startup.test.ts`) so it stays green.

---

## Phase 2: Foundational (domain, storage, client plumbing)

- [x] T002 [P] Test `src/domain/daily-quota.test.ts` per [data-model.md](data-model.md#daily-quota-domain-srcdomaindaily-quotats):
  `utcDayOf` (23:59:59Z and 00:00:00Z fall on different days); `nextReset` is the next 00:00 UTC;
  `todaysQuota(undefined, now)` → `used 0`, `limit 1000`, `limitReached false`, `confirmedAt undefined`;
  `todaysQuota(stored from yesterday, now)` keeps only the limit; `canSend` false at `used ≥ limit` and when
  `limitReached`; `countRequest` adds 1; `adoptReported(q, { used: 10, limit: 2000 }, inFlight 2, now)` →
  `used 12`, `limit 2000`, `confirmedAt now`; `markLimitReached`; `remaining` never below 0
- [x] T003 [P] Implement `src/domain/daily-quota.ts` (branded `UtcDay`, readonly `DailyQuota`, pure functions; no I/O)
- [x] T004 [P] Change `LookupResult` in `src/domain/player.ts`:
  `found` gains `fetchedAt: Date`, `quota-spent` gains `resetsAt: Date`. Test-first through the existing client
  and handler tests: update `src/game-api/client.test.ts` so `found` carries `fetchedAt` from an injected `now` and
  `429` gives `quota-spent` with `resetsAt` = next 00:00 UTC; update fakes and handler tests in `src/discord/`
  so they compile. Then implement (client options gain `now: () => Date`; `main.ts` passes `() => new Date()`)
- [x] T005 [P] Test `src/storage/daily-quota-store.test.ts` (temp folder via `openDatabase`): `load()` is
  `undefined` on a new database; `save` then `load` round-trips every field (including `confirmedAt` undefined);
  a reopened database keeps it; a corrupt row (inserted by SQL with `day 'x'`) throws "the Daily Quota in neil.db is corrupt"
- [x] T006 Implement migration 2 in `src/storage/database.ts` (table exactly as in
  [data-model.md](data-model.md#storage-neildb-migration-2)) and `src/storage/daily-quota-store.ts` (zod row check)
- [x] T007 Test `src/game-api/quota-keeper.test.ts` with a fake store and fake clock: `today()` rolls to a new day at
  00:00 UTC; `tryCount()` returns false without saving when `canSend` is false, else counts, saves at once and
  tracks one in-flight request; `settle(figures | undefined)` ends that in-flight request and adopts figures with the
  other in-flight requests added; `limitReached()` marks and saves; a keeper built on a store with today's spent row
  refuses at once (restart, SC-002/SC-003)
- [x] T008 Implement `src/game-api/quota-keeper.ts` (store port `{ load(): DailyQuota | undefined; save(q): void }`)
- [x] T009 [P] Test `src/game-api/schemas.test.ts`: `quotaFiguresFrom(body, headers)` reads body `quota`
  (`limit ≥ 1`, `used`, `remaining` whole numbers ≥ 0) first, else headers `x-ratelimit-limit` /
  `x-ratelimit-remaining` (`used = limit − remaining`); returns `undefined` when absent and `"malformed"` when present
  but unreadable
- [x] T010 [P] Implement `quotaFiguresFrom` in `src/game-api/schemas.ts`

**Checkpoint**: domain and storage green; the client still behaves as in slice 002 apart from `fetchedAt`.

---

## Phase 3: User Story 1 - Repeated lookups cost nothing (P1) 🎯 MVP

**Independent test**: same uid twice within 10 minutes → one fetch; the card shows `as of`.

- [x] T011 [P] [US1] Test `src/game-api/lookup-cache.test.ts` with a fake clock: `get(key, now)` gives a fresh entry
  before the TTL and none at/after it; `getStale(key)` gives any entry; `share(key, run)` returns the same promise to
  concurrent callers and runs `run` once, then forgets it when it settles (also on rejection); only `found` results
  are stored; more than 2,000 entries drop the oldest stored
- [x] T012 [P] [US1] Implement `src/game-api/lookup-cache.ts`
- [x] T013 [US1] Test in `src/game-api/client.test.ts`: `getPlayer` twice within the TTL → one fetch, same
  `fetchedAt`; after the TTL → two fetches; two concurrent calls → one fetch; `getAlliance(1, "NML")` and
  `getAlliance(1, " nml ")` share one cache key (key `alliance:<kingdom>:<tag lower case>`); a `not-found` or
  `not-prepared` result is not cached
- [x] T014 [US1] Wire the cache into `src/game-api/client.ts` (option `cacheTtlMs`) and pass `config.cacheTtlMs`
  through `src/startup.ts` / `src/main.ts`
- [x] T015 [P] [US1] Test `src/discord/lookup-cards.test.ts`: footers per
  [contracts/lookup-changes.md](contracts/lookup-changes.md#cards): `Data from Last Asylum Tracker · as of 14:05 UTC`
  for today, `… · as of 29 Oct 23:50 UTC` for an earlier day (render functions take `fetchedAt` and `now`)
- [x] T016 [US1] Implement the footer in `src/discord/lookup-cards.ts` and pass `fetchedAt` and an injected `now`
  from `src/discord/lookup.ts` (context gains `now: () => Date`; `src/discord/client.ts` passes `() => new Date()`)

**Checkpoint**: `/player` twice on the test server shows the same `as of`.

---

## Phase 4: User Story 2 - Clear answer when the Daily Quota is spent (P1)

**Independent test**: spent figures or a 429 → no further fetch, cached keys still answered, restart keeps it.

- [x] T017 [US2] Test in `src/game-api/client.test.ts` (client with a `QuotaKeeper` on a fake store): each attempt is
  counted before the fetch; body figures `{ limit: 2000, used: 1999, remaining: 1 }` are adopted, and the next
  uncached lookup makes no fetch and returns `quota-spent` with `resetsAt`; after a 429 no fetch until 00:00 UTC,
  then fetches again; when spent, a stale cached key is returned as `found` with its old `fetchedAt`; a new client
  on the same store after a 429 makes no fetch; malformed figures are logged as `quota figures unreadable` and
  ignored; failed requests (404, 502) are counted
- [x] T018 [US2] Implement the quota gate in `src/game-api/client.ts` (option `quota: QuotaKeeper`), and build the
  `QuotaKeeper` on the `DailyQuotaStore` in `src/startup.ts` / `src/main.ts` (the store opens with the start
  record's database; a corrupt row stops startup like the start record)
- [x] T019 [P] [US2] Test `src/discord/lookup-cards.test.ts` and `src/discord/lookup.test.ts`: the spent message is
  `Lookups are paused: Neil has used today's Daily Quota of Game API requests. They work again at 00:00 UTC (in 3 h 12 min).`;
  time left formats as `in {h} h {m} min`, `in {m} min` under an hour, `in under a minute` below 60 s
- [x] T020 [US2] Implement `timeLeft` and `quotaSpent(resetsAt, now)` in `src/discord/lookup-cards.ts` and use them
  in `src/discord/lookup.ts`

---

## Phase 5: User Story 3 - Officers see the Daily Quota (P2)

**Independent test**: `/quota` as Officer shows figures, as anyone else the refusal; no fetch either way.

- [x] T021 [P] [US3] Test `src/domain/officer.test.ts`: `isOfficer(memberRoleIds, officerRoleIds)` true with either
  role, false with none or an empty list
- [x] T022 [P] [US3] Implement `src/domain/officer.ts`
- [x] T023 [US3] Test `src/discord/quota.test.ts` (fake interaction with `memberRoleIds()`, fake `quotaToday()`,
  fixed `now`): replies per [contracts/quota-command.md](contracts/quota-command.md), all ephemeral with
  `allowedMentions: { parse: [] }`: Officer sees the four lines; limit reached adds
  ` · Spent: the Game API reported the limit reached`; unconfirmed day says `Not confirmed by the Game API yet today.`;
  non-Officer gets `/quota is for Officers (Moderator or King).` and `quotaToday` is not read; a failing reply is
  logged, not thrown
- [x] T024 [US3] Implement `src/discord/quota.ts`; add `quotaToday()` to `GameApiClient` (no request)
- [x] T025 [US3] Test then implement the `/quota` definition in `src/discord/commands.ts` (description
  `Show today's Daily Quota of Game API requests (Officers)`, guild context, no options) and its route in
  `src/discord/client.ts`; member role IDs from `interaction.member.roles` (a `GuildMemberRoleManager`'s cache keys
  or a `string[]`), officer IDs from config through `connect`

---

## Phase 6: User Story 4 - Short Game API hiccups are retried (P3)

**Independent test**: 503 then 200 → card; 504 always → 3 fetches with growing pauses, then try-again.

- [x] T026 [P] [US4] Test `src/domain/retry.test.ts`: `MAX_ATTEMPTS` is 3; `retryDelay(1, 0)` 500, `retryDelay(1, 0.999…)`
  just under 1,500, `retryDelay(2, 0.5)` 2,000
- [x] T027 [P] [US4] Implement `src/domain/retry.ts`
- [x] T028 [US4] Test in `src/game-api/client.test.ts` (fake `sleep` records pauses and advances the fake clock):
  503 then 200 → found, 2 fetches; 504 ×3 → `try-again`, 3 fetches, 2 pauses; 502, 404, 401, 429 → 1 fetch;
  no retry when the quota is spent after the first attempt; no retry when fewer than 2 s of the 20 s deadline would
  remain after the pause; each attempt's timeout is `min(15 s, time left)`
- [x] T029 [US4] Implement retries in `src/game-api/client.ts` (options `sleep`, `random`; `main.ts` passes
  `setTimeout`-based sleep and `Math.random`)

---

## Phase 7: Polish

- [ ] T030 `bot-reviewer` over `src/game-api/`, `src/discord/`, `src/storage/`; fixes via `implementer`
- [ ] T031 **Manual check on the test server** ([quickstart.md](quickstart.md#on-the-test-server)), needs the role IDs
  in `.env` (user); record the result here
- [ ] T032 `spec-auditor` against spec.md; update GAME-API.md if figures behaved unexpectedly; STATUS, ROADMAP
  (`done`), remove the "no cache or quota counter" known-broken item; PR (`Closes` the slice issue)
- [ ] T033 Add `DISCORD_MODERATOR_ROLE_ID` and `DISCORD_KING_ROLE_ID` in the Wispbyte panel before the merge deploys
  (manual, user), merge, restart, repeat T031's `/quota` step against Wispbyte

## Dependencies

- T001 before T014, T018, T025. Phase 2 before Phases 3–6.
- T004 before T013, T015. T008 and T010 before T017. T012 before T013.
- US1 before US2 (stale reads use the cache). US3 needs T008 and T024's `quotaToday`. US4 after US2 (retries
  pass the quota gate).

## Parallel examples

- T002/T003 with T005/T006 and T009/T010 (different files).
- T011/T012 (cache) with T015 (cards); T021/T022 and T026/T027 any time after Phase 2.

## Implementation strategy

MVP = Phases 1–4: cache plus a hard stop at the Daily Quota, which lifts slice 002's known-broken item. Then
`/quota` (US3) and retries (US4); Phase 7 closes the slice.
