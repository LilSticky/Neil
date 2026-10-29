# 2. Node.js, TypeScript and discord.js

Date: 2026-10-29

## Status

Accepted

## Context

Neil is a Discord bot in TypeScript (user requirement). It runs on a small Wispbyte bot-hosting plan (ADR 6), which may
offer as little as about 100 MB RAM. The constitution asks for current major versions and strict typing.

## Decision

We will use Node.js 24 LTS, TypeScript in strict mode with ES modules, discord.js (current major) for the
gateway and interactions, Vitest for tests, ESLint (typescript-eslint, strict) for linting, and zod to
validate configuration, Game API responses and stored data at the boundaries. The bot compiles with `tsc`
to `dist/` and runs as `node dist/main.js`; during development `tsx watch` runs it from source.

## Consequences

- One language and toolchain for bot, scripts and tests.
- discord.js caches by default; we limit its caches (members, messages) and intents to stay within a small
  memory budget, and measure memory on the test server in slice 001.
- zod adds a dependency but keeps untrusted data out of the domain (constitution III).
