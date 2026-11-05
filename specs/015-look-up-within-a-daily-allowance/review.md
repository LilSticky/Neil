# Review: Look up within a Daily Allowance

`bot-reviewer` on the slice diff, 2026-11-05. Read-only; it ran no tests.

| # | Severity | Finding | Outcome |
|---|----------|---------|---------|
| 1 | Must fix | `lookup.ts`, `pick.ts`: when the usage store fails, the failure path reads the same store and throws again, so `/player` keeps its public placeholder and a pick is never answered | Open: fix in T017 |
| 2 | Should fix | `usage.ts`, `quota.ts`: a store failure is only logged, so Discord shows "did not respond" | Open: fix in T017 |
| 3 | Should fix | `daily-allowance.ts`: only an average of exactly 0 fell back to 100, so 1, 0, 0, 0 gave 5,600, above the whole limit | The user chose a minimum of 100 (spec, Clarifications); fix in T017 |
| 4 | Should fix | `client.ts`: a throwing `charge` leaves the quota request in flight, so reported figures stay 1 too high until a restart | Open: fix in T017 |
| 5 | Should fix | `lookup-cards.ts`, `usage-texts.ts`: a card is fitted to 6,000 characters before the usage line is added | Open: fix in T017 |

Checked clean: the order in `attempt`, the flight key, `orStale`, `mayRetry`; nobody is charged for `/reaper`,
`pickExileMatch`, the Interview, corrections, the Daily Sync or name and roles; rollover across a UTC day, a gap and a
restart; `/quota` pings nobody; no Member id in a log; public replies add only the count (plan D9).
