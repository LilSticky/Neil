# Review: slice 017, Give Members the Doctor Role (T009)

`bot-reviewer` on `git diff main...HEAD -- src` and the server guide, 2026-11-04. Paths are under `src/` unless given.

The refactor left the Onboarding Role unchanged. Every path that makes or ends a Link is covered. Nothing else takes the
Doctor Role off. A failed give or take-off cannot stop a Link or Unlink (FR-006).

## Must

- **M1** `documentation/SERVER-SETUP.md`: every Doctor could post in the Shared announcements, because a role's allow beats
  the deny on `@everyone`. Fixed: the role that sees each announcements channel gets its own deny, threads included, and
  King gets View Channel as well.

## Should

- **S1** `documentation/SERVER-SETUP.md`: `/unlink` limited to `#alliance-hall` took it from the moderator channel. Fixed.
- **S2** `discord/link-state-role.ts`: a refused give or take-off reached only the console. Fixed: one line in the log
  channel, for both roles; the startup sweep keeps its single line.
- **S3** `documentation/SERVER-SETUP.md`, `TEST-RUN.md`: the role is created at the first give, not at the first start.
  Fixed: reworded, with what to do on a server with nobody Linked.
- **S4** `discord/interview.ts`: a Member who rejoined with a stored Link held neither role until a restart. Fixed: they are
  given the Doctor Role.

Found while writing the tests for these:

- **S5** `discord/link-state-role.ts`: the sweep counted an Officer role named Doctor as the Doctor Role. Fixed.

## Could

- **C1** The second check before a give in the sweep runs in the same tick as the first, so it adds nothing (also true on
  `main`). Not taken: harmless. An Unlink during a first-run give can leave a Doctor Role until the next restart.
- **C2** Test commands with an account that isn't an Administrator, and keep `#rules` read only. Taken, in the guide.
- **C3** `planOnboardingRole` is now used only by its test. Not taken: `onboarding-role.test.ts` stayed untouched as the guard
  of the refactor. Drop it when that test next changes.
- **C4** The comment wrap in `discord/unlink.ts`. Taken.

Not fixed, noted: an Alliance whose tag is literally `Doctor` would share the role's name.
