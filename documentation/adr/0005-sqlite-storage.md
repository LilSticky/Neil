# 5. SQLite for Links, interviews and quota

Date: 2026-10-29

## Status

Accepted

## Context

Neil has to remember Links (Member ↔ Player), Onboarding Interviews in progress, Officer Reviews, the
daily quota count and the cache across restarts. The amount of data is small (one kingdom). Production runs on Wispbyte (ADR 6), whose
disk persistence across restarts and redeploys still has to be confirmed.

## Decision

We will store data in one SQLite file through Node's built-in `node:sqlite`, behind the store ports
(ADR 3), with numbered schema migrations run at startup. The file path is configuration (`DATA_DIR`). We
store only Discord user IDs, player uids and interview state.

If the Wispbyte disk does not persist across redeploys, this ADR is superseded by a hosted database.

## Consequences

- No extra service or dependency; easy to back up (one file).
- `node:sqlite` is newer than better-sqlite3; if it blocks us, swap the adapter, not the domain.
- Must verify persistence on Wispbyte in slice 001 (deploy twice, check the file survives).
