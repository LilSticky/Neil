# Quickstart: check Start Interviews for unlinked Members

Automated: `npm run typecheck`, `npm run lint`, `npm run test`.

Manual, on the test server. First switch on **Presence Intent** in the Developer Portal, then deploy and Restart. Run only
the Wispbyte Neil. Collected in TEST-RUN.md by the slice's last task.

| # | Do | Expect |
|---|----|--------|
| 1 | Restart Neil with an unlinked test account online | An Interview opens for it; `#neil-log` says `started 1` |
| 2 | Restart Neil with the test account offline | No Interview; no startup line |
| 3 | Bring that account online | An Interview opens |
| 4 | Go idle, then back to online, with the Interview open | No second Interview |
| 5 | Let the Interview be abandoned, go offline, come online | A new Interview opens |
| 6 | Come online with a Linked account | No Interview |
| 7 | Get handed off, then go offline and come online | No Interview |
| 8 | Run `/interview` as an unlinked Member with none open | Works as before |
