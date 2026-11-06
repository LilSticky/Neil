# Research: Call out a booty

## Roster source

- **Decision**: `getPlayer(callerUid)`, uncharged.
- **Rationale**: `alliance_members` is the whole roster, and `/alliances/{kingdom}/{alliance}` would need the Alliance's Kingdom, which a Guest's Alliance doesn't give us from the channel.
- **Alternatives**: one request per Member (wasteful); the Alliance endpoint (needs a Kingdom).

## Time zones

- **Decision**: `Intl.DateTimeFormat` with `timeZone` for the local time, `Intl.supportedValuesOf("timeZone")` for the list.
- **Rationale**: built into Node.js, and follows daylight saving.
- **Alternatives**: Luxon or date-fns-tz (a dependency for one conversion).

## Confirmation state

- **Decision**: stateless, in the custom id.
- **Rationale**: the one-minute expiry is a comparison of two times; nothing needs storing.
- **Alternatives**: an in-memory session, as with pick sessions (lost at restart, more code).

## Cooldown

- **Decision**: in memory, per Alliance tag, holding the time and the card's link.
- **Rationale**: one minute is short, and the spec accepts a repeat after a restart.
- **Alternatives**: a table (a migration for no user-visible gain).
