# Review: slice 018

`bot-reviewer` on the slice diff, 2026-11-05 (task T008). Read from the code and discord.js 14.27; no live gateway run.

| # | Severity | Finding | Outcome |
|---|----------|---------|---------|
| 1 | Must fix | `client.ts`: the Member on a presence can be a stub, with no username and `bot` null | T011 |
| 2 | Must fix | `interview.ts`: `joinMember` and `/interview` skip `starting`, so a join with a presence makes a second thread | T012 |
| 3 | Must fix | `interview.ts`: the startup check has no limit and trusts whichever database it runs on | T013: the user chose a limit (10); HOSTING.md and TEST-RUN §6n say to Link first |
| 4 | Should fix | `client.ts`: a Member the listing cannot read is dropped without a log | T011 |
| 5 | Should fix | `interview.ts`: the startup check ignores disconnect, and the database closes under it | T014 |
| 6 | Should fix | Each start costs one Game API request, which may spend the Quota Reserve | T013: the limit keeps it to 10 per start; plan.md's IV row says so |
| 7 | Should fix | Interview rows and the error line tie a Member to being online | ADR 11 states the by-product; T013 changes the line |
| 8 | Nit | An unknown `before` status reads as coming online; a comment in `client.ts` omits the new step | Status left: the rule still skips a Linked Member. Comment: T014 |
| 9 | Nit | A role give reaches the log channel only as counts | Left, the same as on the join path |
