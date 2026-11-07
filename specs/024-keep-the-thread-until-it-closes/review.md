# Review: Keep the thread until it closes

`bot-reviewer`, 2026-11-07, over `git diff origin/main...HEAD -- src`. No must-fix findings.

- Every path that deletes a thread while the Member stays Linked takes the role off first. `cancelRankApproval` and the deletions at
  Unlink run on a leave or an Unlink, so they need no change.
- A thread that stays keeps the role. The Doctor Role's sweep is unchanged, and nothing else reads the Onboarding Role.
- Should fix, left: a refused take-off is logged and the thread is still deleted, so the role stays until the next start. The spec
  allows this (SC-002), and `takeOff` never throwing is tested already.
- Nit, left: when a deletion fails after the take-off, a restart gives the role back until the retry. Harmless.
