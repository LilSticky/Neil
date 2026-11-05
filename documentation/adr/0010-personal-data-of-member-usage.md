# 10. Personal data of Member usage

Date: 2026-11-05

## Status

Accepted

## Context

Slice 015 gives each Member a Daily Allowance of Game API requests for their lookups. To keep it, Neil must count the
requests each Member causes. That count says how much a Member looked up, so it is personal data.
[ADR 7](0007-personal-data-of-links-and-interviews.md) says that a change to what is stored, or for how long, needs a
new ADR, and the constitution (principle V) asks that personal data is kept to what a feature needs.

The estimate of Expected Lookup Members needs only how many Members looked up on a day, not who did.

## Decision

We will store, in the `member_usage` table of `neil.db` (migration 13), per Member and UTC day:

- the Member's Discord id;
- the number of Game API requests their lookups caused.

We will not store what a Member looked up.

`member_usage` holds the current UTC day only. At the first read of a new UTC day, Neil records each finished day's
Lookup Member count in `lookup_member_day` and deletes the older usage rows in the same transaction.
`lookup_member_day` holds a day and a count, no Member, and is kept for 28 days. A Member who leaves the server keeps
their row until that rollover.

Officers see today's top Members in `/quota`. A Member's usage line is shown on their lookup replies, so on a public
card it is visible to the channel; the user chose this on 2026-11-05.

ADR 7 stays as it is; this ADR adds Member usage to it.

## Consequences

- Nobody can look back at a Member's usage on an earlier day; Officers see today only.
- Members in a channel can see how many requests another Member used today, from that Member's public cards.
- A day Neil was down is recorded as a count of 0, like a quiet day.
- Keeping usage longer, or storing what was looked up, needs a new ADR.
