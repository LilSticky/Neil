# Contract: `/quota`

Guild command for `DISCORD_GUILD_ID` only, guild context only, no default member permissions (Neil
checks the role itself, research R8), `allowedMentions: { parse: [] }`. Every reply is ephemeral and
immediate (no Game API request, so no defer).

| Field | Value |
|-------|-------|
| description | `Show today's Daily Quota of Game API requests (Officers)` |
| options | none |

## Flow

1. Read the caller's role IDs. Not an Officer (no Moderator or King role) → ephemeral
   `/quota is for Officers (Moderator or King).`
2. Read today's Daily Quota from the `QuotaKeeper` (rolls to a new day at 00:00 UTC; never a request).
3. Ephemeral reply, numbers with thousands separators:

```text
Daily Quota for 2026-10-30 (UTC)
Used: 123 · Remaining: 1,877 · Limit: 2,000
Resets at 00:00 UTC (in 5 h 12 min).
Last confirmed by the Game API at 18:40 UTC.
```

- Spent by a 429: the second line gets ` · Spent: the Game API reported the limit reached`.
- No confirmation today: last line `Not confirmed by the Game API yet today.`
- A failing Discord call is logged, never thrown.

Time left: `in {h} h {m} min`, or `in {m} min` under an hour, `in under a minute` below 60 s.
