# Implementation Plan: Change the City Rotation together

**Branch**: `040-change-the-city-rotation-together` | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

## Summary

Pure rules in `src/domain/city-rotation.ts`: `mayChangeCityRotation` (R5 of an Alliance in the order), `RotationTurns`
(order, holder, next recorded after a skip or a leave, expected Alliance of an open Turn), `upcomingAlliance`,
`moveAlliance`, `skipTurn` and `leaveRotation`, each returning a result or a problem. The adapter `createCityRotation`
(`src/discord/city-rotation.ts`) gains `move`, `skip`, `leave`, `pause`, `resume` and `allianceChoices`; texts in
`city-rotation-texts.ts`. When a skip or a leave hands an open Turn to another Alliance, the old request in
`#nap-leaders` loses its button and Neil reads the new Alliance's R5 live and asks it to confirm, as after a siege.
`#home-kingdom-announcements` is found by name in `city-rotation-server.ts`. Routing and autocomplete in `client.ts`;
the subcommands in `commands.ts`, so `/help` lists them.

## Technical Context

- No new dependency, no new setting, no new term.
- Migration 23 (appended): `city_rotation.paused` (0 or 1) and `city_rotation.next_tag` (the Alliance recorded as next
  after a skip or a leave; NULL when next follows the Holding Alliance). No Discord user ids (ADR 18 unchanged).
- A Handover confirmation, `/rotation set` and `/rotation holder` clear the recorded next; the after-siege step turns it
  into the expected Alliance of the new Turn.
- While paused, the after-siege step records the siege and writes one log line, nothing else.
- The Handover Reminders (slice 037) are unchanged: they still name the Alliance after the Holding Alliance and do not
  know of a skip, a leave of the holder or a pause.
