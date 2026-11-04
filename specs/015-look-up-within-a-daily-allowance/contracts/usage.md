# Contract: usage, `/usage`, `/quota` and the Link note

`N` is the Member's count, including the request just made. `M` is today's Daily Allowance.

## Usage line (FR-009)

| Who | Text |
|-----|------|
| Member | `N of M Game API requests used today · cached answers are free · resets 00:00 UTC` |
| Officer | `N Game API requests used today · Officers are not limited · cached answers are free · resets 00:00 UTC` |

Shown on: Player and Alliance cards, pick lists, "not found" and other failure replies, the Alliance Overview and its
pages, and the roster menu's answers. Not shown on: replies to invalid input, and `/reaper`.

## Refusal (`allowance-spent`)

Private: `Your Daily Allowance is spent: M of M Game API requests used today. Cached answers still work. It resets at 00:00 UTC (<time left>).`

## `/usage`

No options. Any Member. Private, no Game API request.

```text
Your lookups today: N of M Game API requests used.
A lookup costs a request when Neil has not answered it in the last 10 minutes; cached answers are free.
Onboarding is never charged.
Resets at 00:00 UTC (<time left>).
```

For an Officer the first line reads `Your lookups today: N Game API requests used. Officers are not limited.`

## `/quota`, added after the current lines

```text
Daily Allowance: M per Member (Expected Lookup Members: E)
Most requests today:
1. <@member> · 12
```

`E` shows at most one decimal. The list has at most 10 Members, most first, ties by Member id, and pings nobody. With
none: `No lookups yet today.`

## Link note (FR-011)

Added to `linkedMessage`, and sent as a private message at an Interview Link and an Officer Link:

```text
You can look up Players and Alliances with /player and /alliance. Each Member has a Daily Allowance of Game API
requests; cached answers are free. /usage shows yours.
```
