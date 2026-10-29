# 6. Test and production server, deployed from main to Pella

Date: 2026-10-29

## Status

Proposed

## Context

Slices are accepted on a test Discord server before they reach the community (constitution, Definition of
Done). The bot is hosted on Pella, which deploys from a GitHub repository.

## Decision

We will run two bot instances from the same code: a **test** instance (own bot application and token)
for development and acceptance, and the **production** instance. All IDs (guild, roles, channels) and
secrets come from environment variables, validated at startup. Pella deploys the production instance from
`main` after CI is green; developers run the test instance locally with `npm run dev`. Slash commands are
registered per guild with `npm run commands:register`.

The GuildMembers privileged intent is enabled, because Neil reacts to joins and changes nicknames and
roles; MessageContent is not, because interaction (slash commands, buttons, modals) covers every input.

## Consequences

- A bad change reaches the community only through `main`, after review and the test-server check.
- Two bot applications to maintain in the Discord developer portal.
- Exact Pella setup (start command, env vars, build step) is recorded in slice 001.
