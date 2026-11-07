# Audit: Call out a booty

`spec-auditor` pass on 2026-11-07 (T017), against `origin/main`. It compared the spec with the code and tests and ran nothing; the
orchestrator ran the checks.

## Coverage

Every acceptance scenario of both user stories, and FR-001 to FR-012, has a test. FR-013 is documentation. T001 to T016 were ticked and
done; T019, the manual check, is open and needs the deploy.

Edge cases with no test of their own:

- A window with equal start and end: tested in the domain and as the `/booty-alerts` default, not through a whole Booty Call.
- A Member who changed Alliance: follows from Booty Alerts being stored per Member and the roster deciding who is in the Alliance.
- A restart during a cooldown: accepted in the spec.

Tests beyond the spec, as hardening, with no new feature: corrupt rows and unknown time zones are skipped; Confirm checks again; the
reply is deferred; a throw after the claim is handled; logs keep to ADR 13.

## Drift found and fixed

- `plan.md` named the wrong files, and its note about waiting for slice 024 was stale, as were two in `tasks.md`.
- `contracts/commands.md` and `plan.md` didn't mention the deferred reply or the second check at Confirm.
- FR-005 didn't state the online rule; it now follows the dictionary.
- Neil's overwrite on `alliance-chat` wasn't in the spec or plan (now FR-014), or in `SERVER-SETUP.md` and `STARTUP-GUIDE.md`.
- `ROADMAP.md` still called the booty blocked: the alarm by Neil itself still is, and slice 026 is listed.

The auditor could not confirm the migration number; `database.test.ts` holds version 14.
