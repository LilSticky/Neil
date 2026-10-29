# 6. Test and production server, production hosted on Wispbyte

Date: 2026-10-29

## Status

Accepted

## Context

Slices are accepted on a test Discord server before they reach the community (constitution, Definition of
Done). The production bot needs an always-on host. Wispbyte and Pella were compared; the user chose
Wispbyte on 2026-10-29. What matters on the host: always-on uptime, enough memory for discord.js, a disk
that survives restarts and redeploys (ADR 5), environment variables for secrets, and an easy deploy.

## Decision

We will run two bot instances from the same code: a **test** instance (own bot application and token)
for development and acceptance, and the **production** instance on **Wispbyte**. All IDs (guild, roles,
channels, Home Kingdom) and secrets come from environment variables, validated at startup. Production is
deployed from `main` after CI is green; developers run the test instance locally with `npm run dev`.
Slash commands are registered per guild with `npm run commands:register`.

The code stays host-neutral: `npm ci && npm run build`, then `npm start`; configuration only through
environment variables; data only under `DATA_DIR`. The exact Wispbyte setup (start command, how code
gets there, where env vars go, which folder persists) is written down in slice 001.

The GuildMembers privileged intent is enabled, because Neil reacts to joins and changes nicknames and
roles; MessageContent is not, because interaction (slash commands, buttons, modals) covers every input.

## Consequences

- A bad change reaches the community only through `main`, after review and the test-server check.
- Two bot applications to maintain in the Discord developer portal.
- Slice 001 must confirm that Wispbyte keeps `DATA_DIR` across restarts and redeploys; if not, ADR 5 is
  superseded.
- Switching hosts later costs only the deploy setup, not code.
