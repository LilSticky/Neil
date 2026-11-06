# Contracts: Call out a booty

## `/booty`

No options. Guild only. Visible to every Member; Neil checks the channel and the caller.

- Allowed: the answer is private, with buttons `booty:confirm:{memberId}:{issuedAtMs}` and `booty:cancel:{memberId}`.
- Refused: a private text; nothing else happens.

A press by anyone else than `memberId` is refused privately.

## `/booty-alerts`

Guild only. Every option is optional; an option left out keeps what is recorded. With no options it only shows the Booty Alerts.

| Option | Type | Values |
|--------|------|--------|
| `mode` | choice | Off, Always, Only when online, Only when offline |
| `from` | string | `HH:MM`, 24-hour |
| `to` | string | `HH:MM`, 24-hour |
| `time-zone` | string, autocomplete | an IANA name, such as `Europe/Lisbon` |

The answer is always private and shows the resulting Booty Alerts. Invalid input is refused and nothing changes.

## Log line in `#neil-log`

Caller, Alliance tag, how many Members were mentioned, and a note when the Game API could not answer.
