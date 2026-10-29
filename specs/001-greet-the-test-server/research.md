# Research: Greet the test server

Phase 0 of the plan. Each entry: decision, rationale, alternatives.

## R1. What Wispbyte is and how code gets there

**Findings** (2026-10-29): Wispbyte's own site blocks automated fetching (HTTP 403) and publishes no
public docs we could find. Third-party listings describe it as a Pterodactyl-style game panel with a
file manager / upload, a startup page, no SSH, undocumented CPU caps; the free plan has 512 MB RAM and
needs a login every two weeks. Reviews report occasional unplanned downtime that needs a manual restart
from the dashboard. Pterodactyl Node.js "eggs" on comparable hosts expose startup variables such as
`GIT_ADDRESS`, `BRANCH`, `AUTO_UPDATE` (git pull on every start), `USER_UPLOAD` (skip clone, upload via
SFTP/file manager), a main file and extra npm packages; the server folder (`/home/container`) is one
volume that survives restarts.

Sources: [Wispbyte blog: free hosting comparison](https://wispbyte.com/blog/free-hosting-comparison),
[Discord Bot Host Advisor: Wispbyte](https://webmatrices.com/app-ideas/discord-bot-host-advisor/solutions/wispbyte),
[Trustpilot: Wispbyte](https://www.trustpilot.com/review/wispbyte.com),
[Witchly Node.js runtime egg (comparable panel)](https://witchly-site.pages.dev/docs/languages/nodejs-runtime).

**Decision**: deploy through a **`deploy` branch** that only CI writes:

1. CI runs typecheck, lint, test and build on every pull request and push.
2. On a push to `main` with all checks green, a deploy job commits the build output (`dist/`,
   `package.json`, `package-lock.json`, `build-info.json`) to the `deploy` branch.
3. The Wispbyte server is set up once to clone `deploy` (`GIT_ADDRESS` + `BRANCH=deploy`,
   `AUTO_UPDATE=1`), so every start pulls the latest green build, installs production dependencies and
   runs `node dist/main.js`.
4. A restart makes the new build live. If the panel exposes the Pterodactyl client API
   (`POST /api/client/servers/{id}/power`), the deploy job restarts the server with a key stored as a
   GitHub secret; otherwise the restart is one manual click, documented in `documentation/HOSTING.md`.

**Rationale**: only green `main` builds ever reach the `deploy` branch (FR-010); Wispbyte needs no build
tools, TypeScript or dev dependencies (fits 512 MB); the code stays host-neutral (ADR 6); switching to
manual upload needs only the same `deploy` branch contents as a zip.

**Alternatives**: Wispbyte clones `main` and builds on start (rejected: a red `main` commit could still
deploy, and the build needs dev dependencies and memory); manual upload of a zip from CI (fallback if
the panel cannot clone a Git branch); a different host (rejected: ADR 6).

**Open until the user sets up the server** (recorded as a manual task): exact variable names in
Wispbyte's egg, whether the repository must be public for cloning or accepts a token, whether the client
API is available, Node.js version offered (needs 24).

## R2. Will the data folder persist?

**Decision**: `DATA_DIR` defaults to `./data` inside the server folder; `data/` is never part of the
`deploy` branch, so `git pull` leaves it alone. The start record (see data-model) makes persistence
visible through `/ping`. The check: `/ping` → restart → `/ping` → redeploy → `/ping`; first start time
unchanged and start count +1 each time means yes. A panel "reinstall" is expected to wipe the folder;
that is documented, not tested.

**Rationale**: Pterodactyl volumes persist across restarts; the open question is redeploys, which with
this design are only `git pull` on start.

**Alternatives**: a hosted database now (rejected: premature; ADR 5 is superseded only if the check fails).

## R3. Storage for the start record

**Decision**: one SQLite file `neil.db` in `DATA_DIR` through `node:sqlite` (ADR 5), with a numbered
migration table. The start record is one row.

**Rationale**: slice 001 then also proves `node:sqlite` runs on Wispbyte and survives redeploys, which
is exactly what ADR 5 needs; later slices add tables, not a second storage mechanism.

**Alternatives**: a JSON file (simpler, but proves nothing about ADR 5 and would be replaced in slice 002+).

## R4. Stack and tooling

**Decision**: Node.js 24 LTS, TypeScript strict, ES modules (`"type": "module"`, `NodeNext`),
discord.js current major, zod for configuration and stored-data validation, Vitest, ESLint flat config
with typescript-eslint `strictTypeChecked`, `tsx watch` for `npm run dev`, `node --env-file=.env` for
local settings (no dotenv dependency), `tsc` for the build.

**Rationale**: ADR 2 and the constitution; fewest dependencies that cover each need.

**Alternatives**: bundling with esbuild/tsup (not needed; `tsc` output runs directly on Node 24),
Jest (Vitest is the constitution's choice).

## R5. Discord intents, permissions and command registration

**Decision**: gateway intent `Guilds` only. The invite uses scopes `bot applications.commands` with
permissions `0`; interaction replies need no permission. `GuildMembers` (ADR 6) is added in slice 004,
when Neil first reacts to joins. Commands are registered per guild with
`npm run commands:register` (REST `PUT /applications/{app}/guilds/{guild}/commands`), run from a
developer machine with the right env file (`--env-file=.env` for test, `--env-file=.env.production` for
the Wispbyte bot); Neil does not register commands on startup.

**Rationale**: least privilege (constitution V, FR-008); registration as a separate repeatable step
(FR-006, ADR 6).

## R6. Version shown by `/ping`

**Decision**: the deploy job writes `build-info.json` (`{ "version": "<short commit sha>", "builtAt":
"<ISO time>" }`) next to `dist/`. Neil reads and validates it at startup; without it (local dev) the
version is `dev`.

**Rationale**: the version must change with each deploy without anyone editing Wispbyte's settings;
baking it into the build does that. (Spec assumption "supplied through configuration" is adjusted to
"supplied by the build".)

## R7. Failure behaviour

**Decision**: configuration, data folder and start record are checked before login; any failure prints
a list of named problems (never values of secret settings) and exits with status 1. A rejected token or
unreachable Discord also exits with 1; the host restarts the process, so there is no in-process retry
loop. `SIGINT`/`SIGTERM` destroy the Discord client and close the database, then exit 0.

**Rationale**: spec edge cases, constitution IV's spirit of no tight retry loops.
