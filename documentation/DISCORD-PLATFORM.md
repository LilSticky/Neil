---
title: "Discord platform: rules and limits for Neil"
summary: What Discord's official developer docs say about intents, permissions, rate limits, interactions, commands, components and scheduled events, and how Neil uses each.
audience: [tech]
tags: [discord, intents, permissions, rate-limits, interactions, slash-commands, scheduled-events]
owner: Neil maintainers
reviewed: 2026-11-15
visibility: public
---

# Discord platform: rules and limits for Neil

## In short

Neil talks to Discord through discord.js over the gateway (events) and REST (actions). Discord sets hard rules
that shape Neil's design: which events a bot may receive (intents), which roles and Members it may change (the role
hierarchy), how fast it may call (rate limits), and how quickly it must answer a click or command (3 seconds). This
page collects those rules from the official docs and says where Neil depends on them. Update it when something
about Discord is learned; a hard number here beats a guess in code.

Sources: Discord's developer docs at `docs.discord.com/developers/…`, read on 2026-11-14 (the old
`discord.com/developers/docs/…` URLs redirect there with the same paths). The Developer Policy page
(support-dev.discord.com) refused automated reading (403) and the Developer Terms were not found; their data rules
are **not** summarised here. Neil's side: [ADR 2](adr/0002-node-typescript-discordjs.md),
[ADR 8](adr/0008-neil-creates-managed-roles.md), [ADR 11](adr/0011-reading-the-presence-of-members.md),
[ADR 12](adr/0012-setup-script-runs-under-temporary-administrator.md),
[ADR 14](adr/0014-reading-scheduled-events.md), [HOSTING.md](HOSTING.md), [SERVER-SETUP.md](SERVER-SETUP.md).

## ⚠️ Upcoming change: channel obfuscation (2026-11-16)

The permissions page says: starting **November 16, 2026**, channels are obfuscated for a bot that lacks
permission to view them; the bot receives obfuscated channel objects instead. Neil already sees only what its role
can view (ADR 14 notes this for events), but anything that reads names or details of channels Neil cannot view will
stop working. Check after that date: the setup script (`scripts/setup-server.ts`, which runs under Administrator and
so is unaffected while the grant is on), scheduled events in channels Neil cannot view, and any lookup of a channel
by name. Source: <https://docs.discord.com/developers/topics/permissions>

## Gateway intents

Source: <https://docs.discord.com/developers/topics/gateway>

- Intents have been required since API v8; discord.js uses API v10.
- **Privileged** intents: `GUILD_MEMBERS`, `GUILD_PRESENCES`, `MESSAGE_CONTENT`. They must be switched on in the
  Developer Portal (Bot → Privileged Gateway Intents) **before** login, or the gateway closes with **4014**
  (disallowed intent). Invalid intent bits close with 4013. Close codes 4004, 4010–4014 must not be retried.
- Apps under 10,000 unique users switch privileged intents on directly; above that they need review. Apps in
  **100+ servers** must be verified and get each privileged intent approved. Neil serves one server.
- Without `MESSAGE_CONTENT`, message `content`, `embeds`, `attachments` and `components` arrive empty, except for
  messages Neil sent, DMs with Neil, messages that mention Neil, and the target of a message context command.
- `GUILD_SCHEDULED_EVENTS` is not privileged; it delivers scheduled-event create/update/delete and user add/remove.
- Gateway send limit: 120 events per connection per 60 s (immediate disconnect beyond it). Identify limit: 1000 per
  24 h across shards; exceeding it ends all sessions and **resets the token**. Restart loops can hit this.

**Neil** (`src/discord/client.ts`, `createClient`): `Guilds`, `GuildMembers` (privileged, slice 005),
`GuildPresences` (privileged, ADR 11), `GuildScheduledEvents` (ADR 14); partials `GuildMember` and `User` so a
Member who left uncached still triggers `GuildMemberRemove`. No `MessageContent`, no `GuildMessages`, no
`DirectMessages`. ADR 2 plans to limit discord.js caches for Wispbyte's memory; the client currently sets no
`makeCache` or sweepers.

## Permissions and the role hierarchy

Source: <https://docs.discord.com/developers/topics/permissions>

- A bot can give and remove only roles **below its own highest role**, and can edit such roles only with
  permissions it holds itself.
- A bot can kick, ban and **change the nickname** only of Members whose highest role is below the bot's. The
  server owner has every permission and cannot be renamed by a bot (Neil documents this in HOSTING.md; the
  permissions page itself only states the hierarchy rule).
- A bot can set a permission overwrite only for permissions it holds (why the setup script needs Administrator,
  ADR 12).
- Channel permissions resolve in this order: @everyone base → role permissions → @everyone overwrite deny/allow →
  role overwrites deny/allow → member overwrite deny/allow. Administrator bypasses overwrites.
- If the server requires 2FA for moderation, permissions such as Manage Roles and Manage Channels need the bot's
  owner account to have 2FA.
- Bits Neil cares about: Manage Roles `1<<28`, Manage Nicknames `1<<27`, Create Events `1<<44`, Manage Events
  `1<<33`, View Channel `1<<10`, Send Messages `1<<11`, Manage Channels `1<<4`, Administrator `1<<3`, Pin Messages
  `1<<51`.
- **Pin Messages** (`1<<51`) is a permission of its own, apart from Manage Messages. A bot pins with it, and edits its
  own messages with no permission beyond seeing the channel.

**Neil**: Manage Roles and Manage Nicknames, with its role above the Managed Roles, `Onboarding` and `Doctor`, and
below Moderator and King (ADR 8, SERVER-SETUP.md). In `#nap-announcements` it posts and pins the City Rotation card
(Pin Messages, slice 035) and edits it later; a card that is gone (REST error **10008**, Unknown Message) is posted
again. In `#nap-leaders` it posts the Handover question after each Royal City siege and the Handover Reminders (slices
035 and 037), and the NaP join requests with their Approve button and the leave notices (slice 038); it edits a join
request through the button's interaction (`update`), which needs no permission beyond the post. When the R5 runs `/nap join` again while the request is open, Neil edits the
request's message; when Discord answers **10008** (or the message is not in the current `#nap-leaders`), it posts the
same request again with the same Approve button (issue #148). Every NaP message has
mentions off. Missing permissions surface as REST error **50013**
(`src/discord/member-roles.ts`). Neil has no Manage Events (ADR 14) and no Manage Channels (ADR 12).

## Rate limits

Source: <https://docs.discord.com/developers/topics/rate-limits>

- Global: **50 requests per second** per bot. Interaction responses are **not** counted against it.
- Per-route buckets, scoped by top-level ids (channel, guild, webhook). Never hard-code limits; read the
  `X-RateLimit-*` headers (`Limit`, `Remaining`, `Reset`, `Reset-After`, `Bucket`, and on 429 `Global`, `Scope`).
  A 429 body carries `retry_after` (seconds, float). discord.js's REST layer queues and retries for us.
- **Invalid request limit: 10,000 per 10 minutes per IP** (401, 403, 429; shared-scope 429s excluded). Beyond it
  Cloudflare bans the IP for a while. A loop that keeps trying a forbidden role change (50013 → 403) counts towards
  this, so skip and log instead of retrying.
- DMs: opening DM channels too fast gives error **40003**; the docs warn against DMing everyone in a server.

## Interactions (slash commands, buttons, selects, modals)

Source: <https://docs.discord.com/developers/interactions/receiving-and-responding>

- The first response must arrive within **3 seconds**, or the interaction fails (error 10062 "Unknown
  interaction" afterwards). Anything slower (Game API calls, database work) must defer first (`deferReply`,
  or `deferUpdate` for components).
- The interaction token stays valid for **15 minutes** for edits and follow-ups.
- Ephemeral flag `1<<6` (64). On a deferred reply it is the only valid flag, and it is fixed at deferral:
  decide ephemeral-or-not before `deferReply`.
- Answering twice gives 40060 "Interaction has already been acknowledged".
- A modal cannot be shown in reply to a modal submit. Modal: `custom_id` 1–100 chars, title ≤ 45, 1–5 components.
- Autocomplete: at most **25** choices; the input is validated only client-side, so re-validate on submit.

**Neil** defers in `lookup.ts`, `corrections.ts`, `interview.ts`, `reaper.ts`, `booty-call.ts` and `client.ts`.

## Application commands

Source: <https://docs.discord.com/developers/interactions/application-commands>

- **Guild** commands update instantly; **global** ones are for every server. Guild commands are not available in DMs.
- Per app (and per guild for guild commands): 100 chat-input, 15 user, 15 message commands. At most **200
  command creates per day per guild**: a registration loop can run out.
- Names: 1–32 chars, lowercase, `^[-_ʼ\p{L}\p{N}…]{1,32}$`. Descriptions 1–100. At most 25 options, required
  before optional; at most 25 choices; choices and `autocomplete` are exclusive. Whole command ≤ 8000 chars.
  One nesting level: group → subcommand; a command with subcommands cannot be run bare.
- `default_member_permissions: "0"` hides a command from everyone but Administrators until a server admin
  grants it in Server Settings → Integrations. A bot token cannot set per-command permissions (needs a user Bearer
  token with Manage Guild and Manage Roles).
- `contexts` replaces the deprecated `dm_permission`; `default_permission` is being deprecated.

**Neil** registers guild commands only (`scripts/register-commands.ts`, `Routes.applicationGuildCommands`), every
command with `contexts: [Guild]`; Officer commands use `HIDDEN_FROM_MEMBERS` (`"0"`), and HOSTING.md tells the
owner to grant them per server.

## Messages, components and embeds

Sources: <https://docs.discord.com/developers/resources/message>,
<https://docs.discord.com/developers/interactions/message-components>

- Message content ≤ **2000** chars; ≤ 10 embeds; request ≤ 25 MiB.
- Embeds: title 256, description 4096, ≤ 25 fields (name 256, value 1024), footer 2048, author 256; all embeds of
  a message together ≤ **6000** chars. Over a limit → 400 (50035 "Invalid form body").
- Components: `custom_id` 1–100 chars, unique per message. Action row: up to 5 buttons **or** one select; up to 5
  rows (Components V2 messages: up to 40 components, and the `IS_COMPONENTS_V2` flag cannot be removed and
  forbids `content`/`embeds`).
- Button label ≤ 80 (design advice: ≤ 34–38); link buttons have a `url` (≤ 512) and no `custom_id`.
- Select: ≤ 25 options, label/value/description ≤ 100, placeholder ≤ 150.
- Text input (modals only): value up to 4000 chars, placeholder ≤ 100.
- Discord timestamps `<t:UNIX:STYLE>` render in each reader's local time zone. They work in message content, embed
  descriptions and field values, but not in embed titles, field names or footers. Neil uses them for Server Time
  moments, for example the end of a Duel day (`nextServerReset`). Card footers still show UTC
  ([#124](https://github.com/LilSticky/Neil/issues/124)).
- Neil posts into an **announcement channel** (`ChannelType.GuildAnnouncement`) as into a text channel: the Battle Plan
  card goes to `#kvk-announcements` (slice 034), so Neil needs View Channel, Send Messages and Embed Links there, which
  the layout grants. Neil does not crosspost (Publish) the message to following servers. Whether Interaction Bot
  translates a bot's embed into the translated copies is not verified yet.

## Dates and times: Discord timestamps

Source: <https://docs.discord.com/developers/reference#message-formatting> (timestamp styles), read on 2026-11-15.

- A timestamp is written `<t:UNIX:STYLE>`, with UNIX in whole seconds. Discord shows it in each reader's own time
  zone and language. Styles: `t` short time (16:20), `T` long time (16:20:30), `d` short date (20/04/2021), `D` long
  date (20 April 2021), `f` short date and time, `F` long date and time with weekday, `R` relative ("in 2 hours",
  "3 days ago"); without a style Discord uses `f`.
- It renders in message content, embed descriptions and embed field values. It does **not** render in embed titles,
  footers, author names, field names, or button and select labels: there it shows as the raw `<t:…>` text.

**Neil's rule**: every date or time Neil posts is a Discord timestamp, so each Member reads it in their own time zone
and sees how long until or since. A moment is usually shown as an absolute style followed by the relative one, such
as `<t:…:t> (<t:…:R>)` for a reset or `<t:…:F> (<t:…:R>)` for an Event start; a day alone uses `D`. Every text
builds them through `src/discord/timestamps.ts` (`timestamp(moment, style)`, `unixOf(moment)`). A time that must go
where Discord does not render timestamps moves to the description or a field value: the cards' "As of …" line sits
at the end of the description, not in the footer.

Exceptions, which stay plain text:

- **Footers**: the usage line ("… resets 00:00 UTC") sits in a card footer, so it keeps plain UTC text.
- **A UTC day that names a counting period**: /quota's header ("Daily Quota for YYYY-MM-DD (UTC)") and the Daily
  Sync log line name the UTC day that is counted. A date timestamp would show a different date to readers west or
  east of UTC.
- **A recurring time of day in the Member's own zone**: the Booty Alert window is an HH:MM the Member chose in their
  time zone, not a moment, so it stays as HH:MM.

## Members, nicknames and DMs

Source: <https://docs.discord.com/developers/resources/user>,
<https://docs.discord.com/developers/topics/opcodes-and-status-codes>

- Nicknames: **1–32 characters**. A nickname built from the Player Name plus decoration must fit.
- Usernames: 2–32 chars.
- Errors Neil meets: **50007** cannot send messages to this user (DMs closed or blocked; Neil handles it,
  `RESTJSONErrorCodes.CannotSendMessagesToThisUser`), 50278 no mutual guild, **10007** unknown member (left the
  server; `src/discord/client.ts`), **50013** missing permissions, 50001 missing access, 10062 unknown interaction,
  40060 already acknowledged.

## Scheduled events

Source: <https://docs.discord.com/developers/resources/guild-scheduled-event>

- At most 100 scheduled or active events per server (error 30038). Name 1–100, description 1–1000, location 1–100.
- Types: stage 1, voice 2, external 3 (external needs a location and an end time). Status: scheduled 1 → active 2
  → completed 3, or scheduled → canceled 4; completed and canceled are final.
- Discord automates status: external events go active at start and completed at end; voice/stage events end when
  empty for a few minutes; scheduled events not started a few hours after start are canceled.
- Creating needs Create Events (plus channel rights for voice/stage); editing or deleting needs Manage Events, or
  Create Events for one's own event. Neil holds neither; `R4` and `R5` get Create Events from the setup script.
- "Get users" (who is Interested) returns up to 100 per page; Neil reads them at reminder time (ADR 14).

## For engineers

- Every Discord call lives in `src/discord/` (adapters); the domain never sees discord.js (ADR 3).
- When a Discord number changes behaviour (limits, timeouts), put it in a named constant next to a link to this page.
- Re-read the official page before relying on a limit marked here; Discord changes them (see the obfuscation note).

## Related

- [GAME-API.md](GAME-API.md): the other external API.
- [HOSTING.md](HOSTING.md): Developer Portal setup, intents to switch on, invite URL.
- [SERVER-SETUP.md](SERVER-SETUP.md): roles, positions and channel permissions on a server.
