# 17. Neil Police acts on the test server

Date: 2026-11-15

## Status

Accepted. Partly supersedes [ADR 15](0015-neil-police-test-bot-and-server-crawl.md) (Police's read-only permissions on
the test server). The crawl of the real server is unchanged.

## Context

With a hosted test Neil ([ADR 16](0016-develop-branch-and-test-environment.md)), each slice's checks should run as real
test cases on the test server, and a session should see the results. Police only reads there (ADR 15), so it can watch
what Neil does but cannot set anything up. The user decided on 2026-11-15 to give Police write rights for testing.

Discord limits what any bot can do to another bot: it cannot run slash commands, press another bot's buttons or select
menus, or join a server as a new member. Those steps stay with a person.

## Decision

Police holds these permissions on the **test server only** (invite permissions `17910416362688`): View Channels, Read
Message History, View Audit Log, Send Messages, Send Messages in Threads, Create Public Threads, Embed Links, Add
Reactions, Manage Nicknames, Manage Roles, Manage Events and Create Events. No Administrator, no Kick, Ban or Timeout,
no Manage Channels, Manage Server or Manage Webhooks.

A session uses them to arrange and drive test cases: create, edit and delete scheduled events (Event Invitations and
reminders), give, take and rename roles and nicknames (Neil's corrections, the Daily Sync), post and react in channels and
threads, and clean up what it created. Every expected result is then read back through Police. Steps Discord reserves to
people (slash commands, buttons, joining) are handed to the user as numbered steps, and Police verifies what follows.

The MCP server stays limited to `NEIL_POLICE_GUILD_IDS` (the test server). Its toolsets are unchanged; the permissions
above are what bounds Police.

## Consequences

- Test cases can be set up and checked in one session; only interactions need the user.
- A leaked Police token can now change roles, nicknames, events and messages on the test server (not the real one).
- Police's role must sit above the roles it changes, and below Neil Test's role, so it cannot change Neil Test itself.
- Kicking Police from the real server after the crawl (ADR 15) still matters: this ADR grants nothing there.
