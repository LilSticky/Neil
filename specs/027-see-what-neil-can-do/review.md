# Review: See what Neil can do

`bot-reviewer`, 2026-11-07, over `git diff origin/main...HEAD -- src`. No must-fix findings.

- Should fix, fixed: `help.ts` built the answer outside the `try`, so a throw left the interaction unanswered. It now logs and says
  help is unavailable, as `/usage` does.
- Should fix, left: the embed has no guard against Discord's 4096 limit. A test holds the full Officer list under it, so a growing
  list fails the build instead of being cut short without notice.
- Nit, left: `/reaper add` and `/reaper remove` show to Members, whose descriptions say they are for R5s. Neil still refuses them.
