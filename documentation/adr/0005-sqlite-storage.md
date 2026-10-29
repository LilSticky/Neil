# 5. SQLite for Links, interviews and quota

Date: 2026-10-29

## Status

Proposed

## Context

Neil has to remember Links (Member ↔ Player), Onboarding Interviews in progress, Officer Reviews, the
daily quota count and the cache across restarts. The amount of data is small (one kingdom). The host is not chosen yet (ADR 6); bot
hosts usually offer some disk, but whether it survives redeploys must be confirmed for the chosen one.

## Decision

We will store data in one SQLite file through Node's built-in `node:sqlite`, behind the store ports
(ADR 3), with numbered schema migrations run at startup. The file path is configuration (`DATA_DIR`). We
store only Discord user IDs, player uids, interview state and review decisions; screenshots of In-game
Proof stay in Discord, referenced by message link, and are not copied.

If the chosen host's disk does not persist across redeploys, this ADR is superseded by a hosted database.

## Consequences

- No extra service or dependency; easy to back up (one file).
- `node:sqlite` is newer than better-sqlite3; if it blocks us, swap the adapter, not the domain.
- Must verify persistence on the chosen host in slice 001 (deploy twice, check the file survives).
