---
description: "Task list for slice 009, Keep roles in sync"
---

# Tasks: Keep roles in sync

**Input**: [spec.md](spec.md). TDD per task (`test-first` → `implementer`).

## Plan (short)

- Config: `SYNC_HOUR_UTC` (0–23, default 3), `SYNC_SHARE` (≥ 1, default 500).
- Quota: `RequestPurpose` gains `"sync"` (same rule as lookups: never below the Quota Reserve).
- Roster: `RosterEntry` gains `kingdom` (`kid`) and `sanctuaryLevel` (`lv`) when present.
- Domain `src/domain/daily-sync.ts`: `planSync(links with last Alliance, leftOver)` → roster requests grouped by
  (kingdom, tag) and uid requests; `playerFromRoster(alliance, entry)`; `rankAfterSync(rankOnLink, before, now)` per
  FR-004; `isDue(lastRunDay, now, hour)`.
- Storage migration 7: `applied` gains `alliance_kingdom`, `alliance_tag`; `link` rank can be updated
  (`LinkStore.updateRank`); table `daily_sync(day, left_over_json)` for the run record and left-over Members.
- Discord `src/discord/daily-sync.ts`: `runDailySync()` – plan, fetch rosters/players with purpose "sync" counting
  against `SYNC_SHARE`, apply through slice 006 `name-and-roles` (forced nickname), log per change and a summary;
  `startDailySync()` – timer checking `isDue` every 10 minutes; started from `connect`.

## Tasks

- [x] T001 Test then implement config `SYNC_HOUR_UTC`, `SYNC_SHARE` (`src/config.ts`, env.example).
- [x] T002 [P] Test `src/domain/daily-quota.test.ts` + quota-keeper: purpose `"sync"` refused at the reserve. Implement.
- [x] T003 [P] Test schemas/client: roster `kid`/`lv` → `kingdom`/`sanctuaryLevel` (recorded fixture). Implement.
- [x] T004 Test `src/domain/daily-sync.test.ts`: planSync grouping and left-over first; playerFromRoster; rankAfterSync
  (every FR-004 case); isDue (before/after hour, already ran today, missed hour). Implement.
- [x] T005 Test storage: migration 7, v6 upgrade; applied keeps the last Alliance; `LinkStore.updateRank`; daily_sync
  record and left-over round-trip. Implement.
- [x] T006 Test `src/discord/daily-sync.test.ts`: US1 1–7 and US2 1–2 with fakes (one roster request per Alliance,
  uid lookups for movers, share stop with left-over, reserve stop, no change → no log, hand nickname restored, summary
  line, not-on-server skipped, failed roster → uid lookups). Implement (name-and-roles gains a sync entry point).
- [x] T007 Test scheduling: `startDailySync` runs at the hour, not twice a day, after a missed hour soon after start;
  wired in `connect`. Implement.
- [x] T008 Docs: HOSTING.md (variables), TEST-RUN.md §6e (collected), ADR 4 note (sync share now real), ROADMAP,
  STATUS.
- [x] T009 `bot-reviewer` → `review.md`; `spec-auditor` → `audit.md`; fix must/should.
- [X] T010 Manual check collected in TEST-RUN.md §6e, run later by the user.
