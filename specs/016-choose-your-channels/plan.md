# Implementation Plan: Choose your channels

**Branch**: `016-choose-your-channels` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

As in slices 009–013 the plan is short and holds the research, data model and contracts itself: one new table pair,
one new command, no new Game API request.

## Summary

After an Interview Link, Neil posts one **Preferences message** in the Interview thread: four select menus (Languages,
Region, Interests, Experience; none required) and a **Done** button. Each change gives or takes off the permission-free
Preference Roles at once. Done, or the Interview timeout, ends it and deletes the thread (unless a Rank Approval is
pending, as before). `/channels` shows the same menus privately, with the current Preferences preselected. NaP
discussions follows the Alliance Rank: offered to R4s, given to R5s, taken off everyone else, on every name and roles
apply (Link, Rank Approval, Daily Sync, startup). Unlink takes the Preference Roles off and forgets the Preferences.

## Technical Context

TypeScript (strict), Node, discord.js, Vitest, SQLite (`node:sqlite`, one new migration). Needs Manage Roles (already
required). One server, a few hundred Members; at most 20 Preference Roles. Discord limits that shape the design: a
message has at most 5 component rows, a select menu at most 25 options.

## Decisions (research)

- **R1 One message, not four questions in a row.** The spec's "one after another" becomes four menus in one message
  (top to bottom). *Why*: no new Interview states; the same component serves `/channels`; skipping a question is not
  touching it (SC-002: at most 4 interactions plus Done). *Rejected*: one message per question (four more states and
  restart recovery for each).
- **R2 Game Languages are a fixed list in the domain**, code → role name, ≤ 25: `en` English, `de` German, `fr` French,
  `es` Spanish, `it` Italian, `pt` Portuguese, `ru` Russian, `tr` Turkish, `pl` Polish, `nl` Dutch, `ar` Arabic, `ja`
  Japanese, `ko` Korean, `zh` Chinese, `th` Thai, `vi` Vietnamese, `id` Indonesian. *Why*: the Game API has no language
  list (GAME-API.md; fixtures show `en`, `ja`); a select menu needs fixed options. A Player Language outside the list
  (a regional code such as `zh-TW` is matched by its first part) preselects nothing. The list is checked against the
  game in the manual check. *Rejected*: configuration (nothing else needs to change it).
- **R3 Role names are the answer names**: language names above; `Americas`, `Europe/Africa`, `Asia/Oceania`; `PvP`,
  `Events`, `Trading`, `Off-topic`, `NaP discussions`; `New`, `Intermediate`, `Veteran`. None can be a Managed Role
  name (`isManagedRoleName` is checked in a test for every one).
- **R4 Thread lifetime.** A `preference_prompt` row (Member, thread, posted at) marks the open Preferences message. Done
  or the sweeper (Interview `timeoutMs` after posting) deletes the row and the thread, unless a Rank Approval for that
  Link is pending. A Rank Approval that ends deletes the thread as today; the prompt row is then dropped by the next
  sweep (deleting a gone thread is not an error, slice 013). The Member can still use `/channels`.
- **R5 Where roles are applied.** `nameAndRoles` already runs on every Link, Officer Link, Rank Approval, Daily Sync
  member and startup apply, with the rank. It calls `preferenceRoles.apply(memberId, rank)` after its own apply, so
  NaP discussions follows the rank everywhere without new hooks. Unlink calls `preferenceRoles.forget(memberId)`.
- **R6 Officer Link** sends the Member a private message pointing to `/channels` (failure ignored, as the Unlink
  message); no Preferences message in the thread.
- **R7 Who may press.** Every Preferences component's custom ID carries the Member ID; a press by anyone else is
  answered privately and changes nothing (Officers can see the thread).

## Data model

- `Preferences` (domain, `src/domain/preferences.ts`): `{ languages: ReadonlySet<GameLanguage>; region?: Region;
  interests: ReadonlySet<Interest>; experience?: Experience }`. Types are string-literal unions; `Interest` includes
  `"nap"`.
- `preferenceRolesFor(preferences, rank): string[]`: the role names wanted. `"nap"` counts only for R4; R5 always
  gets `NaP discussions`; any other rank (R1–R3, unknown, no Alliance, not Linked) never does.
- `interestOptions(rank)`: the four Interests, plus NaP discussions for R4 only.
- `preselectedLanguage(playerLanguage)`: the `GameLanguage` or undefined (R2).
- Migration 13 (11 is slice 014's, 12 slice 015's; renumbered at rebase if needed): `preference (member_id TEXT, kind TEXT,
  value TEXT, PRIMARY KEY (member_id, kind, value))` with `kind` in `language | region | interest | experience`, and
  `preference_prompt (member_id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, posted_at TEXT NOT NULL)`. Rows are read
  through zod; an unknown value is dropped and logged.

## Contracts

- **Preferences message** (thread, and `/channels` private reply): rows 1–4 string select menus, `min 0`, Languages
  `max 17`, Region `max 1`, Interests `max 5`, Experience `max 1`; row 5 a Done button. Custom IDs
  `pref:<question>:<memberId>` and `pref:done:<memberId>`. Each select change saves that question's answer, applies
  the roles, and updates the message. Picking Veteran or New adds the guides line (Veteran: invitation to write in the
  guides forum; New: pointer to it).
- **`/channels`**: no options, any Member, private reply. Not Linked → "finish onboarding first", nothing else.
- **Configuration**: `DISCORD_GUIDES_FORUM_ID` (channel ID, optional; without it the guides line names "the guides forum").
- **Log channel**: one line per Preferences change (`@Member: Languages Italian, English`), and failed role changes as
  today.

## Constitution Check

- I Domain-driven slicing: named after what a Member does; Preference, Preference Role, NaP discussions approved in
  DICTIONARY.md (2026-11-04). ✅
- II TDD: every task red → green. ✅
- III Framework-free domain: `preferences.ts` is pure. ✅
- IV Game API: no request; the Player Language comes from the Player already fetched for the Link. ✅
- V Least privilege: Preference Roles have no permissions; no channel permissions changed; NaP discussions is taken
  off whenever the rank no longer allows it. ✅
- VI Context: STATUS, ROADMAP, HOSTING (which role sees which channel), TEST-RUN updated. ✅
- VII Small slice: one table pair, one command, no new Interview states. ✅

## Project Structure

New: `src/domain/preferences.ts`, `src/storage/preference-store.ts`, `src/discord/preferences.ts` (service: apply,
forget, message, select and button handling, `/channels`), `src/discord/preferences-texts.ts` (+ tests).
Changed: `storage/database.ts` (migration), `discord/name-and-roles.ts` (calls apply), `discord/interview.ts`
(`finishLink` posts the Preferences message instead of deleting the thread), `discord/interview-sweeper.ts` (prompt
timeout), `discord/corrections.ts` (Officer Link message), `discord/unlink.ts` (forget), `discord/commands.ts`,
`discord/client.ts` (routing, wiring), `config.ts`, `documentation/HOSTING.md`, `TEST-RUN.md`.

## Coordination

Slice 015 (worktree `../Neil-015`) also changes `interview-texts.ts` and DICTIONARY.md and merges first; this branch
rebases onto it before the first code task, and renumbers its migration if 015 adds one.
