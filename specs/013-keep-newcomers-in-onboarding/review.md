# Review: slice 013, Keep newcomers in onboarding

`bot-reviewer` on `git diff main...HEAD -- src`, 2026-11-04. Written down by the main session (the reviewer is read-only).

## Must

- **M1** HOSTING.md setup: a thread is visible only to someone who can view its parent channel. A Rank Approval's
  approver (the Linked R5) has no Onboarding Role, so with `#onboarding` hidden they could not open the thread.
  **Fixed**: HOSTING.md allows View Channel and Send Messages in Threads on `#onboarding` to `R5`.

## Should

- **S1** `onboarding-channels.ts` `deleteThread`: discord.js `guild.channels.fetch` throws 10003 Unknown Channel for a
  missing thread instead of returning null, so "already gone is not an error" (US5.5) fails in production. Fix: treat
  10003 as gone.
- **S2** `corrections.ts` (`/rank` settle) and `rank-approval.ts` (button): `deleteThread` runs unguarded; a throw
  costs the log line, the reply, or the name and roles. Fix: log first, guard the delete, apply name and roles whatever
  happens.
- **S3** `takeOffNamedRole` silently skips an `Onboarding` role with permissions, so a Linked Member keeps it with
  nothing logged. Fix: return a `has-permissions` skip. The startup sweep also changes Members without a summary; add
  one log-channel line with the counts when anything changed or was skipped.

## Could

- **C1** Startup race: the sweep reads "not Linked", the Member Links, the sweep's give lands after the takeOff. Fix:
  re-check `linkFor` just before giving.
- **C2** `onboarding-role.ts` sweep: `bot` is always false after the bot skip; simplify.

## Audit gaps (spec-auditor, audit.md)

- US5.5 has no test for an already-gone thread (covered by S1).
- FR-006 / US1.3: no Interview-, Link- or Unlink-level test where the Onboarding Role fails; the service never throws
  (service-level tests). Accepted: the callers rely on the service contract.
