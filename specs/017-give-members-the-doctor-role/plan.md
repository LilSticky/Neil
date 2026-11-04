# Implementation Plan: Give Members the Doctor Role

**Branch**: `017-give-members-the-doctor-role` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

## Summary

The Doctor Role is the mirror of the Onboarding Role: held while Linked instead of while not Linked. It follows the same
three moments (Link, Unlink, startup), so the Onboarding Role service is generalised and both roles use it. The rest of
the slice is the server guide. No migration, no new command, no Game API request, no new configuration.

## Technical Context

TypeScript, discord.js, Vitest, as in the rest of Neil. Storage is untouched: holding the role follows from the Link.

## Decisions

- **R1 One service, two roles.** `src/discord/onboarding-role.ts` holds the sweep, the logging and the skip handling.
  Copying 100 lines for a mirror image would let the two drift, so they move to `src/discord/link-state-role.ts`:
  `createLinkStateRole` takes the role's name, whether it is wanted when Linked, and its startup log line.
  `createOnboardingRole` and the new `createDoctorRole` are thin wrappers, and `onboarding-role.test.ts` stays as it is, as
  proof that nothing changed.
- **R2 The domain rule.** `src/domain/doctor-role.ts`: `DOCTOR_ROLE_NAME` and `wantsDoctorRole` (not a bot, and Linked).
  `planOnboardingRole` is about any role, so it becomes `planRoleStep` in `src/domain/link-state-role.ts`, which both use.
- **R3 Order at Link: Doctor first.** The Doctor Role is given before the Onboarding Role is taken off, so a Member never
  stands between the two with nothing visible (`interview.ts` `finishLink`, `corrections.ts` after an Officer Link).
- **R4 Order at Unlink: Doctor off, then Onboarding on.** In `unlinkMember`, in the branch for a Member still on the server.
  A Member who left has lost their roles already, so nothing is asked of Discord (US2.2).
- **R5 The startup sweep runs after the Onboarding one.** Both list the Members; they stay separate calls, because a
  startup runs once and the second listing costs nothing against the Game API. They run in a chain, not side by side, so
  the two log lines come in a fixed order and role changes for one Member do not race.
- **R6 A race at startup.** As for Onboarding, the wish is checked again just before a give, so a Member Unlinked after the
  listing is not given the role.
- **R7 No Daily Sync.** Being Linked does not depend on the game, so the Daily Sync adds nothing (spec, Assumptions).
- **R8 Existing guards are enough.** `giveNamedRole` and `takeOffNamedRole` already refuse a role with permissions and an
  Officer role of that name, and create the role without permissions on first use (ADR 8). FR-005 needs no new code, only
  a test through the Doctor wrapper.
- **R9 Roll-out order.** The guide says to restart Neil first and check that Linked Members hold Doctor, and only then to
  move channels from `#330` to Doctor. The other order would cut Members off until the restart.

## Constitution Check

- Domain stays pure: the two new domain files hold constants and pure functions.
- Adapters: no new input from outside; the role name is a constant.
- Game API: no request added.
- Least privilege: the role has no permissions, Neil's own permissions do not change, and channel permissions stay by hand.
- TDD: every step below is test first; `onboarding-role.test.ts` guards the refactor.
- Dictionary: Doctor Role, Home Kingdom information and Shared information approved on 2026-11-04.
- No ADR: this follows ADR 8 and the decisions of slice 013.

## Project Structure

- `src/domain/link-state-role.ts`, `src/domain/doctor-role.ts`: new. `src/domain/onboarding-role.ts`: uses the shared step.
- `src/discord/link-state-role.ts`, `src/discord/doctor-role.ts`, `src/discord/__fakes__/doctor-role.ts`: new.
- `src/discord/onboarding-role.ts`, `onboarding-role-texts.ts`: wrapper, and a sibling line for Doctor.
- `src/discord/interview.ts`, `corrections.ts`, `unlink.ts`, `client.ts`: the three moments and the wiring.
- `documentation/SERVER-SETUP.md`, `HOSTING.md`, `TEST-RUN.md`: the guide and the manual check.
