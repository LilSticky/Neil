# 3. Framework-free domain with adapters

Date: 2026-10-29

## Status

Proposed

## Context

The rules (role mapping, nickname format, interview flow, quota budget) must be testable without Discord
or the Game API (constitution II and III), and should survive changes to discord.js or the tracker API.

## Decision

We will structure the code as ports and adapters:

- `src/domain/`: pure TypeScript rules and types; no discord.js, HTTP, fs, timers or `process.env`.
  It declares ports (interfaces) such as `PlayerDirectory`, `LinkStore`, `MemberRoles`, `Clock`.
- `src/game-api/`: the only implementation of `PlayerDirectory`, with rate budget and cache.
- `src/discord/`: discord.js client, slash commands and event handlers; thin: parse → domain → reply.
- `src/storage/`: persistence behind the store ports.
- `src/main.ts`: the composition root that wires adapters into the domain from validated config.

Tests use fakes of the ports (`__fakes__/`), never discord.js mocks.

## Consequences

- Most tests are fast unit tests of the domain.
- Some boilerplate for ports and fakes.
- Handlers that grow logic are a review finding (`bot-reviewer`).
