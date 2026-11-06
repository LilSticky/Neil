# Review: slice 022

`bot-reviewer`, 2026-11-06, on the diff to `main`. No must-fix.

- **Fixed:** MIGRATION-GUIDE.md now says to move a channel set on `Trading` to `Recruitment` before deleting the role.
- **Fixed:** MIGRATION-GUIDE.md now warns that Neil takes a role named `Recruitment` off anyone who hasn't chosen the
  Interest, so an existing role of that name must be renamed first.
- **Fixed:** ROADMAP.md no longer says "role migration" or "to be approved".
- **Accepted:** a held `Trading` role is ignored by Neil until it is deleted by hand (the user's decision).
- **Accepted:** a leftover stored `trading` row is reported again after each restart, on stderr only, until the next
  `setInterests` or Unlink. The user says nobody holds it.
- **Not done:** the stored `trading` test reads once and doesn't show `setInterests` clearing the row. Once-only reporting
  is covered by the generic test in `src/storage/preference-store.test.ts`.
