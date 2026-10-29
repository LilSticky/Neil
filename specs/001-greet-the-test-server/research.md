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
4. A restart makes the new build live. It is one manual click on **Restart** in the panel (see
   "Restarts" below for why it is not automated).

**Rationale**: only green `main` builds ever reach the `deploy` branch (FR-010); Wispbyte needs no build
tools, TypeScript or dev dependencies (fits 512 MB); the code stays host-neutral (ADR 6); switching to
manual upload needs only the same `deploy` branch contents as a zip.

**Alternatives**: Wispbyte clones `main` and builds on start (rejected: a red `main` commit could still
deploy, and the build needs dev dependencies and memory); manual upload of a zip from CI (fallback if
the panel cannot clone a Git branch); a different host (rejected: ADR 6).

**Confirmed from the user's panel screenshot (2026-10-29)**: the "Server Configuration" page is the
standard Pterodactyl Node.js egg with exactly these fields: Git Repo Address, Install Branch, User
Uploaded Files (0/1), Auto Update (0/1, `git pull` on startup), JS file (default `index.js`), Git
Username, Git Access Token, Uninstall Node packages. There is **no field for custom environment
variables** on that page; the user reports a separate place for environment variables, which
Wispbyte's knowledge base confirms (below). That egg's startup runs, in order: `git pull` (if Auto Update = 1 and `.git` exists),
`npm install` (if `package.json` exists), then `node <JS file>`.

Settings for Neil:

| Field | Value |
|-------|-------|
| Git Repo Address | `https://github.com/LilSticky/Neil` (public, so no Git Username / Access Token) |
| Install Branch | `deploy` |
| User Uploaded Files | `0` |
| Auto Update | `1` |
| JS file | `dist/main.js` |

Consequences for the design:

- The `deploy` branch MUST only grow (one new commit per deploy, never force-pushed), or the startup
  `git pull` fails on diverged history.
- The deploy job strips `devDependencies` from the `package.json` it commits, so the startup
  `npm install` installs only runtime dependencies.
- Settings go in the panel's environment variables (see R8).

**Wispbyte knowledge base** (second research pass, 2026-10-29; pages are only readable through search
results, the site blocks automated fetching): the client panel has console, file manager, startup
settings, logs and resource graphs; SFTP is premium only. Setup is: choose a Docker image, set the
startup and environment variables. The security page says to keep bot tokens in **Startup →
environment variables** rather than in uploaded files, and to enable two-factor authentication. Fair
use: one free account per person and one bot per Discord server. Sources:
[KB](https://wispbyte.com/kb), [Getting Started](https://wispbyte.com/kb/getting-started),
[Server Management](https://wispbyte.com/kb/server-management),
[Security Best Practices](https://wispbyte.com/kb/security),
[community: bot not working](https://wispbyte.com/community/t/9a1f1ed1-213d-4601-8363-3d6e7feb44b3).

**Restarts**: Wispbyte is not plain Pterodactyl. Its panel is its own client area
(`wispbyte.com/client`), and its restart endpoint (`/client/api/server/restart`) takes a browser login
session behind a Cloudflare Turnstile check, not an API key; community auto-restart scripts drive a
real browser to get through it ([example](https://github.com/lovevampde5/Wispbyte)). We do not automate
that: it would mean storing the account password in CI and getting around a bot check. Each deploy
therefore ends with a manual **Restart**. A crashed process is restarted by Wispbyte itself
([Wispbyte tutorial](https://wispbyte.com/how-to-host-discord-bot-wispbyte)). SC-003 ("without copying
code by hand") still holds; the restart click is the one manual step.

**Verified on the server (2026-10-29)**: the image runs Node.js v24.22.1; the startup command is the
egg's (`git pull` if `.git` and Auto Update = 1, `npm install` if `package.json`, `node
/home/container/${JS_FILE}`). Reinstall did not clone; a one-time bootstrap script did (HOSTING.md),
and the next start pulled and ran the `deploy` placeholder. Wispbyte auto-restarts a crashed process
but gives up after two crashes within 60 seconds.

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

## R8. Where settings live on Wispbyte

**Verified on the server (2026-10-29)**: Wispbyte's panel environment variables are **not** passed to
the process. The panel writes them to `/home/container/.env`; the process environment holds only the
egg's own variables (`GIT_ADDRESS`, `BRANCH`, `JS_FILE`, `AUTO_UPDATE`, …). This matches a community
report that Wispbyte "stores configuration in .env without exporting it".

**Decision**: settings are entered in the panel's environment variables (Wispbyte's security
guidance); at startup, before validating configuration, Neil loads `.env` from its working directory if
the file exists (`process.loadEnvFile`, built into Node). Variables already set in the process
environment win over the file, so hosts that do export variables keep working. Locally the same `.env`
holds the test bot's settings; `.env.production` is used only to register the production bot's
commands. `.env` is untracked, so `git pull` on start leaves it alone, and it must never be committed
to `deploy`.

**Rationale**: it is the only way the panel's settings reach Neil; the start command stays a plain
`node dist/main.js`; the code stays host-neutral (ADR 6).

**Alternatives**: reading only `process.env` (rejected: Wispbyte does not export the panel variables);
a dotenv dependency (not needed, Node has `process.loadEnvFile`).

## R7. Failure behaviour

**Decision**: configuration, data folder and start record are checked before login; any failure prints
a list of named problems (never values of secret settings) and exits with status 1. A rejected token or
unreachable Discord also exits with 1; the host restarts the process, so there is no in-process retry
loop. `SIGINT`/`SIGTERM` destroy the Discord client and close the database, then exit 0.

**Rationale**: spec edge cases, constitution IV's spirit of no tight retry loops.
