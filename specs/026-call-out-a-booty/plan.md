# Implementation Plan: Call out a booty

**Branch**: `026-call-out-a-booty` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

## Summary

`/booty` in an `alliance-chat` asks for a private confirmation, then posts a Booty Call card that mentions the Members of that
Alliance whose Booty Alerts match. `/booty-alerts` records those choices. One new table, two new commands, one Game API request
per Booty Call. See [research.md](research.md), [data-model.md](data-model.md), [contracts/commands.md](contracts/commands.md) and
[quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript strict, Node.js 24 LTS

**Primary Dependencies**: discord.js, zod. No new dependency: `Intl` handles time zones.

**Storage**: `neil.db`, one new migration (`booty_alerts`). The cooldown lives in memory (the spec accepts a restart).

**Testing**: Vitest, with fakes at the adapter boundary

**Target Platform**: Wispbyte

**Performance Goals**: the card is posted within Discord's interaction window; the roster read is deferred behind the button press.

**Constraints**: one uncharged Game API request per Booty Call; at most 100 mentioned users per message (Discord).

**Scale/Scope**: one domain module, one Discord module with texts, one store, wiring

## Constitution Check

| Principle | Check |
|-----------|-------|
| I. Domain-Driven Slicing | Named after what a Member does. Booty, Booty Call and Booty Alerts approved by the user; they enter the dictionary first. |
| II. TDD | Every code task is `test-first`, then `implementer`. |
| III. Framework-Free Domain | `src/domain/booty.ts` takes time, presence and the local minute as inputs. `Intl` stays in the adapter. |
| IV. Respect the Game API | One uncharged request through the client; a failure falls back to Discord alone. |
| V. Least Privilege | No new intent or role. Stored personal data (mode, window, time zone) is recorded in ADR 13, as this principle asks. Booty Calls are logged. |
| VI. Context Never Gets Lost | STATUS, ROADMAP, DICTIONARY, guides and an ADR change in this slice. |
| VII. Small Vertical Slices | One PR, usable end to end. |

Passes, before and after design.

## Project Structure

```text
src/domain/booty.ts                 rules: mode, window, match, cooldown, expiry
src/discord/booty.ts                /booty, its buttons, /booty-alerts
src/discord/booty-texts.ts          card, confirmation, refusals
src/storage/booty-alerts-store.ts   Booty Alerts
src/storage/database.ts             migration
src/discord/commands.ts, client.ts, unlink.ts, src/main.ts   wiring
```

## Decisions

- **Which Alliance**: the channel must be named `alliance-chat`, its category must be an Alliance role's name (`tagOfAllianceRole`),
  and the caller must be Linked and hold that role. This needs no Game API request, so a refusal costs nothing.
- **Confirmation**: private Confirm and Cancel buttons. The custom id holds the caller and the time it was issued, so expiry needs
  no stored state, and a restart does not lose it.
- **Roster**: an uncharged Player lookup of the caller's uid, purpose `lookup`. The answer's `alliance_members` is the whole Alliance
  roster. The client kept only uid and rank, so it now also reads `online` and `last_online_at` and gives them as an optional
  `roster` on the Player, as `shielded` is optional. This needs no Kingdom, so it works for Guests too, and no second request.
- **Online**: `lastSeen` from `src/domain/alliance-overview.ts`, the rule the cards and the Alliance Overview use: `online` is true, or
  there is no Last Online (the user's decision in slice 012: a Player without one is online now, whatever the flag says). Discord
  presence that is not offline counts as online too.
- **Fallback**: on a failed lookup, or an answer with no roster, the Alliance is the holders of the `[TAG]` role, and Discord alone
  decides who is online. The `lookup` purpose stops at the Quota Reserve, which also lands here.
- **Mentions**: in the message content, since embeds do not ping, with `allowedMentions.users` set to exactly those Members. Chunks of
  80 stay under both the 100-user and the 2,000-character limit. The first chunk rides on the card.
- **Cooldown**: claimed in memory before the first `await` of the press, which also settles two Members confirming at once. It is
  released if posting the card fails, so a failed post doesn't block the Alliance.
- **Time zone**: `/booty-alerts` autocompletes `Intl.supportedValuesOf("timeZone")`. Defaults: whole day (00:00 to 00:00), UTC.
- **Peers**: `client.ts` is also touched by slice 024. DICTIONARY, the guides, TEST-RUN, STATUS and ROADMAP wait until 024 has merged, as agreed with its session.
