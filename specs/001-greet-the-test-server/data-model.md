# Data model: Greet the test server

No domain terms from the dictionary are involved in this slice. Both entities are technical; they are
not dictionary terms.

## Configuration

Validated once at startup from environment variables (`src/config.ts`), after loading `.env` from the
working directory if it exists; Wispbyte writes its panel variables there instead of exporting them
(research R8). The rest of the code receives the typed result and never reads `process.env`.

| Field | Env variable | Rule | Secret |
|-------|--------------|------|--------|
| `discordToken` | `DISCORD_TOKEN` | required, non-empty | yes |
| `applicationId` | `DISCORD_APPLICATION_ID` | required, Discord snowflake (17–20 digits) | no |
| `guildId` | `DISCORD_GUILD_ID` | required, Discord snowflake; the one server Neil serves (the test server in this slice) | no |
| `dataDir` | `DATA_DIR` | optional, default `./data`; must exist or be creatable, and writable | no |

- Validation collects every problem, then fails with all of them (FR-002). Messages name the variable
  and the rule, never the value of a secret.
- `LAP_TRACKER_API_KEY` and `HOME_KINGDOM` stay in `env.example` but are not required until slice 002.

## Build info

`build-info.json`, written by the deploy job, read at startup.

| Field | Rule |
|-------|------|
| `version` | non-empty string (short commit sha) |
| `builtAt` | ISO 8601 timestamp |

Missing file → version `dev`. Present but invalid → startup error.

## Start record

One row in table `start_record` of `DATA_DIR/neil.db`.

| Field | Rule |
|-------|------|
| `firstStartedAt` | ISO 8601 timestamp, set once, never changed |
| `startCount` | integer ≥ 1 |

Transition, as a pure function `recordStart(previous: StartRecord | undefined, now: Date): StartRecord`
in `src/domain/` (no I/O):

- no previous record → `{ firstStartedAt: now, startCount: 1 }`
- previous record → `{ firstStartedAt: previous.firstStartedAt, startCount: previous.startCount + 1 }`

The storage adapter validates the row it reads (zod); an invalid row is a startup error, never a silent
reset (spec edge case).

## Schema migrations

Table `schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`; migrations are an
ordered list in `src/storage/`, applied in a transaction at startup. Migration 1 creates
`start_record(id INTEGER PRIMARY KEY CHECK (id = 1), first_started_at TEXT NOT NULL, start_count
INTEGER NOT NULL CHECK (start_count >= 1))`.
