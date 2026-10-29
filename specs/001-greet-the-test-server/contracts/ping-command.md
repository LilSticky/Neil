# Contract: `/ping`

Temporary; removed in a later slice.

## Registration

| Field | Value |
|-------|-------|
| name | `ping` |
| description | `Check that Neil is online` |
| type | chat input (slash command), no options |
| scope | guild command, `DISCORD_GUILD_ID` only |
| default member permissions | none (anyone may run it) |
| contexts | guild only, no DMs |

## Reply

Ephemeral (only the caller sees it), sent as the initial interaction response within Discord's
3-second window, so no deferral.

```text
👋 Hi, I'm Neil and I'm online.
Latency: 123 ms (gateway 45 ms)
Version: 2f7a537 (built 2026-10-29 14:02 UTC)
Data kept since 2026-10-29 12:00 UTC · start #3
```

- `Latency` = time from the interaction's creation to the reply being sent; `gateway` = the client's
  current websocket ping. Before the first heartbeat the gateway value is shown as `–`.
- `Version` is `dev` when no build info exists; then the `(built …)` part is left out.
- Times are UTC, minute precision.
- The text is produced by a pure function `renderPingReply(input)` so it is unit-tested without Discord.

## Errors

If replying fails, the error is logged (without tokens) and Neil keeps running.
