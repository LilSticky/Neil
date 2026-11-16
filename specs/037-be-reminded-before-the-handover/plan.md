# Implementation Plan: Be reminded before the Handover

**Branch**: `037-be-reminded-before-the-handover` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

## Summary

A pure rule (`src/domain/handover.ts`): `HANDOVER_REMINDER_LEADS = [24 h, 1 h]` and `dueHandoverPosts(siege, sent, now)`,
which gives the posts to send and the posts to drop for one siege. The siege moment, the City Rotation and the Holding
Alliance come from slice 035 (`nextRoyalCitySiege`, `nextHoldingAlliance`, `CityRotationStore`, `ROYAL_CITY_SIEGE_TIME`,
`CITY_ROTATION_MODE`); nothing is copied. A poster (`createHandoverReminders` in `src/discord/handover-reminders.ts`)
runs after the Duel Plan on the one-minute tick in `client.ts`, under the same running guard. It records each post in
`handover_posts` before sending it, so a post is handled once: a failed post is logged once, a missing channel too.
Texts live in `src/discord/handover-texts.ts`; the reminder's mentions go through `textWithMentions`, the announcement
has `allowedMentions: { parse: [] }`.

## Technical Context

- No new dependency, no Game API request, no new setting, no role change.
- Migration 19 (appended): `handover_posts (siege_at, kind CHECK IN ('reminder-24h','reminder-1h','announcement'),
  posted_at, PRIMARY KEY (siege_at, kind))`. No Discord user ids, so no new ADR on personal data.
- `HandoverStore` (`src/storage/handover-store.ts`): `handoverPosted(siegeAt, kind)`,
  `recordHandoverPosted(siegeAt, kind, at)` (ON CONFLICT DO NOTHING).
- The Event server adapter (`src/discord/event-server.ts`) gains `napLeadersChannelId()` and
  `kingdomAnnouncementsChannelId()` (an announcement channel), and `post` accepts announcement channels too.

## Who is outgoing and receiving

As the City Rotation card shows it: the Holding Alliance (the first in the order when none is named) is outgoing; the
next tag in the order is receiving.
