# Implementation Plan: See whose turn it is

**Branch**: `035-see-whose-turn-it-is` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

## Summary

- **Domain** `src/domain/city-rotation.ts`: `nextRoyalCitySiege` / `lastRoyalCitySiege` on Server Time
  (`serverTimeOf`, `SERVER_TIME_OFFSET_MINUTES`, never a second offset), `cityRotationOf` (2 to 10 distinct tags, the
  holder among them), `nextHoldingAlliance` (wraps), `mayEditCityRotation` (an R5 from the Game API or a Rank Approval,
  Home Kingdom, tag in the current order or, with none, the new one). `Editor` gains the optional `allianceTag`, read by
  `editorOf` from the Applied State.
- **Settings** `ROYAL_CITY_SIEGE_TIME` (optional `HH:MM`) and `CITY_ROTATION_MODE` (`rotation` default, or `contested`).
- **Storage**: migration 18, one `city_rotation` row; `CityRotationStore` (`load`, `save`, `update`) reads through zod and
  throws on a corrupt row. No Discord user ids (ADR 18).
- **Game API**: `allianceBodySchema.leader_id` (lenient) → `Alliance.leaderUid`.
- **Discord**: `src/discord/city-rotation.ts` (the service: show, set, holder, confirm, tick, refreshCard),
  `city-rotation-texts.ts` (card, button, texts), `city-rotation-server.ts` (channels by name, post, edit, pin, log).
  `/rotation` in `commands.ts`; routed in `client.ts`, with the `rotation-confirm:` button prefix. The tick runs after
  the Duel Plan on the one-minute tick; the card is refreshed once at startup.
- **Setup**: `PinMessages` in the layout's permissions; Neil may post and pin in `nap-announcements` (the copies get no
  overwrites of the original) and post in `nap-leaders`.

## Once per siege

The tick compares the last siege with the stored last handled siege and records it before it acts, with no await in
between, so overlapping ticks and restarts act once; missed sieges give one step. The very first tick (no siege handled
yet) only records the siege. A Handover still waiting when another siege passes is not asked again; one log line says
so.

## Confirm button

The custom id carries the siege and the expected tag; a press is accepted only while that Handover waits, from the
Member Linked to the stored R5 uid or an Officer. The check and the change run without an await in between.
