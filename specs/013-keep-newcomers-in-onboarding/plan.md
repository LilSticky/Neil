# Implementation Plan: Keep newcomers in onboarding

**Branch**: `013-keep-newcomers-in-onboarding` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

As in slices 009–012 the plan is short: no new storage, no Game API, no new commands, so there is no separate
research.md, data-model.md or contracts/. The decisions are below.

## Summary

Neil gives a permission-free `Onboarding` role (created on first use, like a Managed Role) to every Member who is not
Linked: on join, on an Unlink of a Member still on the server, and in a startup sweep, which also takes it from Linked
Members. It is taken off at Link (Interview and Officer Link). Finished Interview threads are deleted instead of
archived. Channel permissions are server setup, documented in HOSTING.md.

## Technical Context

TypeScript (strict), Node, discord.js, Vitest, SQLite (unchanged). Needs Manage Roles (already required, slice 006) and
the Server Members Intent (already on, slice 005) to list every Member at startup. Scale: one server, a few hundred
Members; discord.js queues the role changes within Discord's rate limits.

## Decisions

- **D1 Domain** `src/domain/onboarding-role.ts`: `ONBOARDING_ROLE_NAME = "Onboarding"`;
  `wantsOnboardingRole({ bot, linked }): boolean` (not a bot and not Linked); `planOnboardingRole(holds, wants)` →
  `"give" | "take-off" | "keep"`. `isManagedRoleName` never matches it, so Managed Role applies never touch it.
- **D2 Role changes** `src/discord/member-roles.ts`: export `giveNamedRole(guild, member, name)` and
  `takeOffNamedRole(guild, member, name)`, built from the existing private `addRole` / `removeRoles` (find the
  permission-free role, create it once when missing, refuse a role with permissions, respect the hierarchy). They
  return a `Skipped` or undefined and never throw.
- **D3 Service** `src/discord/onboarding-role.ts`: `createOnboardingRole({ members, links, logError })` with
  `give(memberId)`, `takeOff(memberId)` and `atStartup()`. `give`/`takeOff` fetch the Member (none → nothing), apply,
  and log a skip once with its reason; they never throw. `atStartup()` lists every Member (new `ServerMembers.all()`),
  and for each non-bot Member gives or takes off the role per `wantsOnboardingRole`; a failure for one Member is logged
  and the next follows; a failure to list stops the sweep with one logged line.
- **D4 Wiring**: `interview.ts` `joinMember` calls `give` for a non-bot Member without a Link, before the thread opens;
  `finishLink` calls `takeOff` right after the Link is stored (before the Rank Approval check). `corrections.ts`
  `finishOfficerLink` calls `takeOff`. `unlink.ts` calls `give` after `takeOffOnServer` when the reason is not
  `left`/`missing`. `client.ts` builds the service and runs `atStartup()` in the background next to the name and roles
  startup apply; `RolesMember` gains `bot`.
- **D5 Threads**: every place that ends a finished thread calls `channels.deleteThread` instead of `archive` /
  `lockAndArchive`: Interview Link without a pending Rank Approval, Officer Link without one, Rank Approval approved
  (button and `/rank`), Rank Approval cancelled (Member left, Unlink), Interview abandoned (left, timed out). The last
  message is no longer posted before a delete; the log line stays. `archive` and `lockAndArchive` are removed from
  `OnboardingChannels` when nothing uses them. Neil needs Manage Threads in `#onboarding` (already required).
- **D6 Docs**: HOSTING.md gets the server setup (`@everyone` without View Channel on the other channels or categories,
  `Onboarding` with View Channel, Send Messages and Send Messages in Threads on `#onboarding`, Officers with View
  Channel and Manage Threads on `#onboarding`, Neil's role above `Onboarding`). ADR 8 is amended by a short note that
  the Onboarding Role is the one role Neil gives besides Managed Roles (no new ADR: same decision, one more role).
  TEST-RUN.md §6i holds the manual check.

## Constitution Check

- I Domain-driven slicing: slice named after what it lets a Member do; term approved in DICTIONARY.md. ✅
- II TDD: every task red → green. ✅
- III Framework-free domain: `onboarding-role.ts` is pure. ✅
- IV Game API: not used. ✅
- V Least privilege: the role has no permissions; Neil changes no channel permissions; only the `Onboarding` role and
  Managed Roles are touched. ✅
- VI Context: STATUS, ROADMAP, HOSTING, DICTIONARY updated. ✅
- VII Small slice: no storage change, no new commands. ✅

## Project Structure

New: `src/domain/onboarding-role.ts`, `src/discord/onboarding-role.ts` (+ tests). Changed: `member-roles.ts`,
`interview.ts`, `interview-sweeper.ts`, `corrections.ts`, `rank-approval.ts`, `unlink.ts`, `onboarding-channels.ts`,
`name-and-roles.ts` (`ServerMembers.all`), `client.ts`, and their tests and fakes.
