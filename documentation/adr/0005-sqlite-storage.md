# 5. SQLite for Links, interviews and quota

Date: 2026-10-29

## Status

Proposed

## Context

Neil has to remember Links (Member ↔ Player), Onboarding Interviews in progress, Officer Reviews, the
daily quota count and the cache across restarts. The amount of data is small (one kingdom). Pella offers
disk space (5 GB on the free tier), but it is not yet confirmed that the disk survives redeploys.

## Decision

We will store data in one SQLite file through Node's built-in `node:sqlite`, behind the store ports
(ADR 3), with numbered schema migrations run at startup. The file path is configuration (`DATA_DIR`). We
store only Discord user IDs, player uids, interview state and review decisions; screenshots of In-game
Proof stay in Discord, referenced by message link, and are not copied.

If Pella's disk does not persist across redeploys, this ADR is superseded by a hosted database.

## Consequences

- No extra service or dependency; easy to back up (one file).
- `node:sqlite` is newer than better-sqlite3; if it blocks us, swap the adapter, not the domain.
- Must verify persistence on Pella in slice 001 (deploy twice, check the file survives).
