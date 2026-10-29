# 6. Test and production server, deployed from main

Date: 2026-10-29

## Status

Proposed

## Context

Slices are accepted on a test Discord server before they reach the community (constitution, Definition of
Done). The production bot needs an always-on host. The host is not chosen yet: Wispbyte and Pella are the
candidates. What matters for the choice: always-on uptime, enough memory for discord.js, a disk that
survives redeploys (ADR 5), environment variables for secrets, and deployment from GitHub or by upload.

## Decision

We will run two bot instances from the same code: a **test** instance (own bot application and token)
for development and acceptance, and the **production** instance. All IDs (guild, roles, channels) and
secrets come from environment variables, validated at startup. The production instance is deployed from
`main` after CI is green; developers run the test instance locally with `npm run dev`. Slash commands are
registered per guild with `npm run commands:register`.

The code stays host-neutral: a plain `npm ci && npm run build` then `npm start`, configuration only through
environment variables, data only under `DATA_DIR`. The host is chosen, and recorded in a follow-up ADR, by
the end of slice 001.

The GuildMembers privileged intent is enabled, because Neil reacts to joins and changes nicknames and
roles; MessageContent is not, because interaction (slash commands, buttons, modals) covers every input.

## Consequences

- A bad change reaches the community only through `main`, after review and the test-server check.
- Two bot applications to maintain in the Discord developer portal.
- Switching hosts later costs only the deploy setup, not code.
