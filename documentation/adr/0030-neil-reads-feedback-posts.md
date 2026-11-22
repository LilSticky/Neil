# 30. Neil reads Feedback Posts

Date: 2026-11-22

## Status

Accepted

## Context

[ADR 6](0006-two-servers-deployed-from-main.md) left the MessageContent privileged intent off, because slash commands,
buttons and forms covered every input. [ADR 29](0029-feedback-from-the-real-server-replaces-manual-checks.md) makes
the posts Members write in `#suggestions` and `#feedback` the testing feedback, and slice 047 has Neil forward each
**Feedback Post** to `#neil-log`. Without the GuildMessages and MessageContent intents Neil receives no message text.

## Decision

We will turn on the GuildMessages and MessageContent intents for Neil and Neil Test. Neil reads message content only to
forward a Feedback Post in `#suggestions`, `#feedback` or a thread under them to `#neil-log`, with mentions off, and
reacts 📝. Every other message Neil receives is ignored at once. Nothing about a post is stored, and the Member's name
appears only in `#neil-log`. This amends ADR 6 on the intents.

## Consequences

- The user switches on Message Content Intent in the Developer Portal for both applications; without it, Neil fails to
  log in. The setup script's by-hand lines say so.
- Neil now receives every message event on the server; the handler must drop everything outside the feedback channels
  before reading it, and a test keeps it that way.
- A bot in 100 or more servers needs Discord's approval for the intent; Neil serves one server, so this does not apply.
