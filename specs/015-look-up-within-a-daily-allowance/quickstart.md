# Quickstart: check Look up within a Daily Allowance

Automated: `npm run typecheck`, `npm run lint`, `npm run test`.

Manual, on the test server, after `npm run commands:register`. Collected in TEST-RUN.md by the slice's last task.

| # | Do | Expect |
|---|----|--------|
| 1 | Run `/usage` as a Member | A private reply with `0 of M`; `/quota` shows no new request |
| 2 | Run `/player` for a Player not looked up recently | The card's footer ends with `1 of M` |
| 3 | Run the same `/player` again | The card shows `1 of M`: the cached answer is free |
| 4 | Use up the allowance, with a low limit or a test Member | The next uncached lookup is refused privately with the reset time |
| 5 | Run a cached lookup and `/reaper closest` as that Member | Both answer, and the count stays the same |
| 6 | Run `/player` as an Officer past the allowance | It answers and says Officers are not limited |
| 7 | Run `/quota` as an Officer | Allowance, Expected Lookup Members, and the Members with the most requests |
| 8 | Restart Neil | Counts and the allowance are unchanged |
| 9 | Link a Member by Interview, then one by Officer Link | Each gets the note privately |
