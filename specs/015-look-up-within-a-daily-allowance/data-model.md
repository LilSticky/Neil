# Data model: Look up within a Daily Allowance

Migration 13. Both tables are new; no existing table changes.

## `member_usage`

One Member's Game API requests on the current UTC day (ADR 10).

| Column | Type | Rule |
|--------|------|------|
| `day` | TEXT | UTC day, `YYYY-MM-DD` |
| `member_id` | TEXT | snowflake, `CHECK (member_id <> '' AND member_id NOT GLOB '*[^0-9]*')` |
| `requests` | INTEGER | `CHECK (requests > 0)`: a Member without a request has no row |

Primary key `(day, member_id)`. A request is counted with an upsert. A Member who leaves keeps their row for the day.

## `lookup_member_day`

The Lookup Member record of one finished UTC day.

| Column | Type | Rule |
|--------|------|------|
| `day` | TEXT | primary key, UTC day |
| `lookup_members` | INTEGER | `CHECK (lookup_members >= 0)` |

Rows older than 28 days are deleted at the rollover.

## Rollover

Runs in one transaction at the first read of a new UTC day:

1. For each day from `daysToRecord` (the day after the latest record, or the earliest usage day when there is no record,
   through yesterday, at most 28): insert the number of `member_usage` rows of that day, which is 0 if it has none.
2. Delete `member_usage` rows before today.
3. Delete `lookup_member_day` rows older than 28 days.

A day Neil was down is recorded as 0, as nothing tells it from a quiet day.

## Derived, not stored

| Value | From |
|-------|------|
| Expected Lookup Members | `lookup_member_day`, same weekday, latest 4 before today |
| Daily Allowance | the Daily Quota's limit, `GAME_API_QUOTA_RESERVE`, `SYNC_SHARE`, Expected Lookup Members |
| Lookup Member count today | `member_usage` rows of today |

Past days do not change, so Expected Lookup Members stays the same all day and survives a restart (FR-008).
