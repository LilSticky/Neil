# Implementation Plan: Hand the King role over

**Branch**: `039-hand-the-king-role-over` | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

## Summary

A pure rule (`src/domain/king-move.ts`): `planKingMove` (prepare, or why not), `kingMoveSteps` (whom King is taken from,
whether the new King gets it) and `checkApply` (Officer, live prepared move). The adapter `createKingMoves`
(`src/discord/king-move.ts`, texts in `king-move-texts.ts`) runs `afterHandover(tag)`, which the City Rotation
(`src/discord/city-rotation.ts`) calls through a new `onHandover` dependency after a confirmed Handover and, in Contested
mode, after `/rotation holder`. The Apply button (`king:<preparedAt ms>`) is routed in `client.ts`. The server adapter
`kingMoveServerOf` (`king-move-server.ts`) reaches only the configured King role and `#neil-log`.

## Technical Context

- No new dependency, no new setting. One Game API request per Handover: `getAlliance(home, tag, "sync", "live")`, so no
  Quota Reserve. `leader_id` is already read leniently into `Alliance.leaderUid` (slice 035).
- Migration 22 (appended): `king_moves`, one row (`id = 1`), replaced by the next move. Personal data under ADR 21.
- King holders are found by listing every Member over REST, as the Daily Sync does.
- Steps run per Member; a refusal (50013 or another error) is reported and the move stays applicable, so a second press
  finishes it. An in-memory guard keeps two presses from running at once.
- Neil's role must sit above King and below Moderator: setup hint, SERVER-SETUP.md, STARTUP-GUIDE.md,
  MIGRATION-GUIDE.md, HOSTING.md, DISCORD-PLATFORM.md, TEST-RUN.md.
