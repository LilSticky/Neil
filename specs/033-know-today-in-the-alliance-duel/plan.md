# Implementation Plan: Know today in the Alliance Duel

**Branch**: `033-know-today-in-the-alliance-duel` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

## Summary

A pure Server Time helper (`src/domain/server-time.ts`: `SERVER_TIME_OFFSET_MINUTES = -120`, `serverDayOf`,
`nextServerReset`) and the Duel Plan rules (`src/domain/duel-plan.ts`: `DuelDay`, `DuelPlan`, `duelDayOf`,
`nextDuelReset`). The texts live in `src/duel-plan.ts`, a TypeScript module so the build puts them in `dist` (CI ships only
`dist`). A poster (`src/discord/duel-plan.ts`) runs after the Event Reminders on the existing one-minute tick in
`client.ts`, under the same running guard. It records the Server day in `duel_plan_posts` before it posts, so a day is
handled once: a failed post is logged once, an empty text logs one `#neil-log` line. The card (`duelPlanMessage` in
`src/discord/event-texts.ts`) is an embed with `allowedMentions: { parse: [] }`. `/event-kinds list` gets a clock
(`now`) and, for the kingdom, appends the built-in Alliance Duel line.

## Technical Context

- No new dependency, no Game API request, no new setting.
- Migration 16 (appended): `duel_plan_posts (server_day TEXT PRIMARY KEY CHECK (GLOB date), posted_at TEXT NOT NULL)`.
- `EventStore`: `duelPlanPostedOn(serverDay)`, `recordDuelPlanPosted(serverDay, at)`.

## Why a built-in line, not a stored Event Kind

Stored Event Kinds carry lead times and match Discord scheduled events; the Duel Plan is a daily post with neither. A
stored kind as an on/off switch would add rules the owner did not ask for, so the kingdom's list shows it as a fixed line,
and `/event-kinds remove` cannot remove it.
