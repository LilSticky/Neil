# Implementation Plan: Start Interviews for unlinked Members

**Branch**: `018-start-interviews-for-unlinked-members` | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

As in slices 009–015 the plan is short and holds its decisions here. The texts are in
[contracts/interview-start.md](contracts/interview-start.md) and the checks in [quickstart.md](quickstart.md). No
research.md and no data-model.md: the open questions were settled with the user, and nothing new is stored.

## Summary

Neil subscribes to Discord's presence updates. When a Member goes from offline to any other status, and when Neil starts
for each Member it sees online, the Interview service applies one rule: not a bot, not Linked, no open Interview, no
hand-off waiting. If it holds, the Interview opens as it does on joining. Online status stays in discord.js's memory.

## Technical Context

TypeScript (strict), Node, discord.js, Vitest. No migration, no new table, no environment variable, no slash command, no
Game API endpoint. New: the `GuildPresences` privileged intent, which must be switched on in the Developer Portal **before**
the deploy starts: without it Neil cannot log in. Scale: a few hundred Members.

## Constitution Check

| Principle | Check |
|-----------|-------|
| I Domain slicing | Named after what happens for a Member. No new dictionary term. |
| II TDD | Every task goes red first. |
| III Framework-free domain | `src/domain/interview-start.ts` is pure. |
| IV Respect the Game API | No new endpoint. Each Interview makes the reads it makes today, within the Quota Reserve. |
| V Least privilege | A new privileged intent, which the user accepted for this feature; ADR 11 records it (D6). Nothing about presence is stored. |
| VI Context | STATUS, ROADMAP and HOSTING.md updated. |
| VII Small slices | Two stories on one rule, usable end to end. |

No deviations.

## Decisions

- **D1 Domain** `src/domain/interview-start.ts` (pure):
  - `cameOnline(before, after)`: `before` is a status or undefined, `after` a status. True when `before` is offline or
    undefined and `after` is not offline. Undefined counts as offline: Discord does not send offline Members' presence, so
    a Member Neil holds no presence for was offline.
  - `wantsInterview({ bot, linked, open, handedOff })`: true when all four are false.
- **D2 One entry point** `Interviews.onMemberOnline(member)`, beside `onMemberJoined`, and guarded the same way. It asks
  `wantsInterview`, with `links.linkFor`, `interviews.openFor` and `interviews.latestFor(id)?.step === "handed-off"`; then
  gives the Onboarding Role and calls `openInterview`, as `joinMember` does. `joinMember` itself does not change (FR-008).
  A Member Officer-Linked after a hand-off has a Link, so `latestFor` is only read for a Member without one.
- **D3 At most one, also at the same moment.** `createOrDiscard` already keeps one open Interview, but it throws away a
  thread opened in vain, which a Member could see for a moment. So `onMemberOnline` holds an in-memory set of Member ids
  being started; a second call for the same Member returns at once. The set is emptied in `finally`.
- **D4 Startup check** `Interviews.onlineAtStartup(members)` in sequence, one Member after another, counting `started` and
  `failed`; it logs one line when either is above 0 (contract). A failure is logged and the next Member follows. So
  `onMemberOnline`'s inner step reports its outcome, and the guarded public method keeps not throwing.
- **D5 Adapter** in `src/discord/client.ts`: `GatewayIntentBits.GuildPresences`; `Events.PresenceUpdate` checks the guild id
  like `GuildMemberAdd`, then `cameOnline(old?.status, new.status)`, and reads the Member from the event or with
  `fetchMember`, which is REST. Who is online at startup comes from `guild.presences.cache`: online Members only, then
  `fetchMember` for each. It runs after the Onboarding and Doctor Role sweeps in the same chain, so roles are right first.
  Never `guild.members.fetch()` with no id (#53).
- **D6 ADR 11** Reading presence: what Neil sees (every Member's status), why, and that it stays in memory; online status is
  never logged, stored or shown.
- **D7 Reconnects** are not special: discord.js keeps the cached presence, so a Member seen online stays online and D1 gives
  false. A Member who came online while Neil was disconnected gets their Interview the next time they come online or
  Neil starts.
- **D8 Deploy order** in HOSTING.md: switch on **Presence Intent** in the Developer Portal first, then deploy and Restart.

## Project Structure

```text
src/domain/interview-start.ts       new: D1
src/discord/interview.ts            onMemberOnline, onlineAtStartup: D2, D3, D4
src/discord/interview-texts.ts      startup line
src/discord/client.ts               intent, PresenceUpdate, startup chain: D5
documentation/adr/0011-*.md         D6
documentation/HOSTING.md            D8
```

## Complexity Tracking

None.
