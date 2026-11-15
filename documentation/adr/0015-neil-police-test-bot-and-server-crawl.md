# 15. Neil Police: a test bot and a one-time server crawl

Date: 2026-11-15

## Status

Accepted

## Context

Neil's output on the test server (Interview threads, cards, log lines, roles and nicknames) has only been checked by a
person looking at Discord. Claude Code sessions cannot see it, so the manual checks of several slices stay open
(STATUS, "Merged red"). An MCP server for Discord lets a session read the test server directly. Running it under Neil's own
token would give the MCP server Neil's rights, and would let a mistake in that third-party code act as Neil.

Before the release, the real server's existing layout (channels, roles, overwrites, members, bots, integrations) must be
known so the setup script and the migration do not break it (MIGRATION-GUIDE.md). Today nobody has a full record of it.

The user created a separate Discord application, **Neil Police**, on 2026-11-15, and chose on the same day:

- for the crawl of the real server, temporary Administrator for one run, then Police is removed;
- last activity per channel only (read from the channel's last message id), no reading of message history.

## Decision

We will use **Neil Police**, a Discord application separate from Neil, for two things.

1. **The MCP server** `@pasympa/discord-mcp`, pinned to an exact version as a dev dependency, runs under Police's token
   through `scripts/police-mcp.ts`. The wrapper passes only Police's token and settings, never Neil's, and starts the
   server in an empty folder so it cannot load Neil's `.env`. `DISCORD_ALLOWED_GUILDS` limits it to the servers in
   `NEIL_POLICE_GUILD_IDS`: the test server only. Police holds read-only permissions there (View Channels, Read Message
   History, View Audit Log). The toolsets that send DMs or manage webhooks, invites, channels and screening are left out.
2. **The server crawl** (`npm run server:crawl -- --guild <id>`) reads one server over REST only and writes a snapshot and a
   summary under `DATA_DIR/crawl/`. It never changes anything. For the one run on the real server, the owner invites
   Police with Administrator, runs the crawl, and removes Police again.

What the crawl stores about Members, and for how long:

- per Member: Discord id, username, display name, server nickname, role ids, join time, boosting since, timeout until,
  whether they are a bot and whether they are still pending the server's rules screening;
- the last 100 audit-log entries: who did what to whom, as ids, with the changed values (such as a nickname);
- webhook objects without their tokens; invites without their inviter; events, emojis, stickers and integrations without
  the user object of who made them. Discord's plain id references stay (an event's `creator_id`, a thread's
  `owner_id`, an automod rule's `creator_id`), as does an integration's `account` (the bot or linked channel it is for);
- no message content and no message history.

The snapshot stays on the owner's PC under `data/`, which git ignores. It is never committed, posted or sent to a service.
It is deleted once the release migration is done.

## Consequences

- Sessions can check Neil's real output on the test server without touching Neil's token.
- Police needs the Server Members and Message Content intents in the Developer Portal: members cannot be listed without
  the first, and other bots' messages come back empty without the second.
- While Police holds Administrator on the real server, a leaked Police token controls the whole server. Nothing forces
  the owner to remove it: the crawl's last line is the only reminder, as with ADR 12.
- The MCP server is third-party code. Updating it is a deliberate version bump, not `latest`.
- Keeping the snapshot longer, crawling message history, or giving Police write rights needs a new ADR.
