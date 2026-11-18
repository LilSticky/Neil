# Implementation Plan: Shield before the reset

**Spec**: [spec.md](spec.md) · **Issue**: [#118](https://github.com/LilSticky/Neil/issues/118)

## Design

- **Domain** `src/domain/shield.ts` (pure): `shieldDeadlineOf`, `shieldWeekOf`, `deadlineOfWeek`, `weekStartOf`,
  `isShieldWeek`, `SHIELD_LEAD_MINUTES` (720, 240, 60), `shieldLeadMinutesOf`, `shieldKindOf`, `shieldStandingOf`. A week
  is keyed by the Server Time date of its Saturday. The reminder plan reuses `dueReminders` of slice 028, so missed lead
  times collapse into the shortest one.
- **Managed Roles** `src/domain/managed-roles.ts`: `allianceLeadersRoleName(tag)` = `[TAG] Leaders`; `rolesFor` adds it
  for a known R4 or R5 of a Home Kingdom Alliance; `isManagedRoleName` matches `^\[(.+)\] Leaders$`; `tagOfAllianceRole`
  does not, so it gets no Alliance area and is never renamed. Every apply path (Link, Rank Approval, `/rank`, Daily Sync,
  live data, Unlink) follows from that.
- **Layout** `server-layout.json` `allianceArea`: `alliance-leaders`, `seenBy: ["<Alliance> Leaders"]`, Neil allowed
  View, Send, Embed Links, Read History. `expandLayout` resolves the placeholder per Alliance and adds each Leaders Role to
  the wanted roles, so `planSetup` creates it before the channels; `parseLayout` accepts the placeholder in the Alliance
  area only.
- **Storage** migration 27 and `src/storage/shield-store.ts` (synchronous, rows validated with zod).
- **Discord** `src/discord/shield.ts` (`/kvk-week`, `/shield-reminders`, the `shield:<week>` button),
  `src/discord/shield-reminders.ts` (the tick and its server view), `src/discord/shield-texts.ts`; `/event-kinds` shows the
  Shield line; `client.ts` routes and ticks; `unlink.ts` forgets.
- **Docs** ADR 26, ADR 8 amendment, DICTIONARY (proposed terms), SERVER-SETUP, STARTUP-GUIDE, ROADMAP, STATUS, TEST-RUN.

## Constitution check

No new dependency; no new Discord permission; the Game API is never asked about shields; the domain stays free of
discord.js, HTTP, fs and timers; applied migrations are unchanged.
