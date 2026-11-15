# Neil Police: the test bot and the server crawl

Neil Police is a second Discord application, separate from Neil. It lets a Claude Code session **read** the test server
through an MCP server, so Neil's real output can be checked. It also runs a **crawl** that records a server's existing
layout, once on the real server before the release. Why and what it stores: [ADR 15](adr/0015-neil-police-test-bot-and-server-crawl.md).

Police only reads. It never runs Neil's code, and Neil never uses Police's token.

## 1. Set up the application (once)

In the [Developer Portal](https://discord.com/developers/applications), open **Neil Police**:

1. **Bot**: reset the token and copy it. Under *Privileged Gateway Intents*, switch on **Server Members Intent** and
   **Message Content Intent**. Without the first, members cannot be listed. Without the second, Neil's messages come back
   empty. Switch *Public Bot* off.
2. **OAuth2**: copy the application id (Client ID).

Add to `.env` (git-ignored). Neil ignores these, and Wispbyte never needs them:

```
NEIL_POLICE_TOKEN=police-bot-token
# Servers the MCP server may read: the test server only
NEIL_POLICE_GUILD_IDS=test-server-id
```

## 2. Invite Police to the test server

Open, with the Client ID filled in:

`https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&scope=bot&permissions=66688`

`66688` = View Channels + Read Message History + View Audit Log. Police gets no other rights. A channel Police's role
cannot see stays hidden from it: since 2026-11-16, Discord sends obfuscated channels to bots that cannot view them. To
check such a channel, add Police's role to it on the test server.

## 3. The MCP server

`.mcp.json` starts `neil-police`, which runs `scripts/police-mcp.ts`. It starts `@pasympa/discord-mcp` (pinned in
`package.json`) with:

- `DISCORD_TOKEN` = `NEIL_POLICE_TOKEN`; Neil's `DISCORD_*` settings and every other secret from `.env` are left out;
- `DISCORD_ALLOWED_GUILDS` = `NEIL_POLICE_GUILD_IDS`, so any call on another server is refused;
- `DISCORD_MCP_TOOLSETS` = `discovery,messages,members,roles,permissions,forums,scheduled_events,stats,moderation`
  (`NEIL_POLICE_TOOLSETS` overrides it). DMs, webhooks, invites, channels and screening are left out;
- an empty working folder, so the server's own `.env` loading cannot find Neil's token.

It refuses to start, and says why, when `NEIL_POLICE_TOKEN` or `NEIL_POLICE_GUILD_IDS` is missing.

Claude Code asks once to enable the project's MCP server, then asks before each tool until you allow it. Allow the
read-only ones (`discord_list_*`, `discord_get_*`, `discord_read_messages`, `discord_search_*`, `discord_fetch_pinned_messages`,
`discord_audit_permissions`) in your own `.claude/settings.local.json` if you like. Police's permissions refuse writes
anyway.

Typical checks: read an Interview thread (`discord_list_channel_threads`, `discord_read_messages`), a Member's roles and
nickname (`discord_get_member_info`), a channel's overwrites (`discord_get_channel_permissions`), the audit log.

## 4. The server crawl

```
npm run server:crawl -- --guild <server-id>
```

The crawl reads one server over REST (no gateway) with `NEIL_POLICE_TOKEN` and changes nothing. It writes to
`DATA_DIR/crawl/<server-id>-<UTC time>/`:

- `snapshot.json`: everything it read, as Discord returned it, in sections. A section it could not read records why
  (usually a missing permission) instead of failing the crawl. Only the server, its channels and its roles must be readable.
- `summary.md`: a readable overview. Server settings, unreadable sections, roles with member counts and key permissions,
  the channel tree with types, overwrites and last activity, member figures, threads, events, emojis, automod, invites,
  webhooks, integrations and recent audit-log actions. It names no Member.

What it reads: the server (with counts), channels, roles, members (paged), active threads, each channel's public
archived threads (first page), scheduled events, emojis, stickers, automod rules, invites, webhooks, integrations, the
last 100 audit-log entries, the welcome screen and onboarding. Last activity comes from each channel's last message id.
No message is read.

### On the real server (once)

1. The owner invites Police with Administrator:
   `https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&scope=bot&permissions=8`
2. `npm run server:crawl -- --guild <real-server-id>`
3. The owner **kicks Police** from the real server. The crawl's last line says so.
4. Read `summary.md`. Keep `snapshot.json` on this PC only, and delete it once the release migration is done (ADR 15).

## Related

[DISCORD-PLATFORM.md](DISCORD-PLATFORM.md) (intents, permissions, obfuscated channels) ·
[MIGRATION-GUIDE.md](MIGRATION-GUIDE.md) · [ADR 12](adr/0012-setup-script-runs-under-temporary-administrator.md)
