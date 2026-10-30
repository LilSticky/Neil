# Hosting

How Neil runs: one bot application, Neil, on Wispbyte (ADR 6), and locally for development with the same
token while the Wispbyte server is stopped.
Why it is set up this way: [specs/001-greet-the-test-server/research.md](../specs/001-greet-the-test-server/research.md)
(R1, R2, R8). Never paste tokens into chats, issues or commits.

## 1. Discord application (once)

In the [Discord developer portal](https://discord.com/developers/applications), one application: Neil.
There is no separate test bot.

1. **New Application**, give it a name.
2. **General Information**: copy the **Application ID** → `DISCORD_APPLICATION_ID`.
3. **Bot**: **Reset Token**, copy it → `DISCORD_TOKEN` (shown once; keep it only in the `.env` files and the Wispbyte panel).
   Leave all privileged gateway intents off for now (Server Members arrives with slice 005).
   Turn **Public Bot** off so only you can invite it.
4. **OAuth2 → URL Generator**: scopes `bot` and `applications.commands`, no bot permissions. Open the
   URL and add the bot to the **test server**.

Test server ID: Discord **User Settings → Advanced → Developer Mode** on, then right-click the server
icon → **Copy Server ID** → `DISCORD_GUILD_ID`. Neil uses the test server's ID during slice 001.

## 2. Local settings

From `env.example`, in the repository root: `.env` (git-ignored) with Neil's values, the same as in the
Wispbyte panel. Used by `npm run dev` and `npm run commands:register`.

**Before `npm run dev`, Stop the Wispbyte server** in the panel, and Start it again when done. Two running
copies of one bot both receive every `/ping`; only one can answer, the other logs an error.

## 3. Wispbyte server

**Account**: turn on two-factor authentication (Wispbyte's security advice).

**Startup** tab: choose the Node.js **24** image, and set these **environment variables** (production
Neil's values; names exactly as written):

| Variable | Value |
|----------|-------|
| `DISCORD_TOKEN` | Neil's token |
| `DISCORD_APPLICATION_ID` | Neil's Application ID |
| `DISCORD_GUILD_ID` | the test server's ID (during slice 001) |
| `DATA_DIR` | `./data` |

Wispbyte writes these to `.env` in the server folder rather than exporting them; Neil loads that file at
startup. Don't delete `.env` in the file manager.

`DISCORD_TOKEN` is the token from the **Bot** page (Reset Token), not the Client Secret (OAuth2) or the
Public Key (General Information). A wrong value shows up as HTTP 401 on login.

**Server Configuration**:

| Field | Value |
|-------|-------|
| Git Repo Address | `https://github.com/LilSticky/Neil` |
| Install Branch | `deploy` |
| User Uploaded Files | `0` |
| Auto Update | `1` |
| JS file | `dist/main.js` |
| Git Username / Git Access Token | empty (the repository is public) |
| Uninstall Node packages | empty |

**First clone.** Wispbyte refuses to start an empty folder ("no files"), and on 2026-10-29
**Settings → Reinstall Server** did not clone the repository. What worked: bootstrap the clone once
from the file manager. Afterwards every start runs `git pull` (Auto Update), `npm install`, then
`node dist/main.js`.

1. **Files**: create folder `dist`, and in it a file `main.js` with this content:

   ```js
   // One-time Wispbyte bootstrap: turns the server folder into a checkout of the deploy branch.
   const { execFileSync } = require("node:child_process");
   const { rmSync } = require("node:fs");
   const git = (...args) => execFileSync("git", args, { stdio: "inherit" });
   rmSync("dist", { recursive: true, force: true });
   git("init", "-q");
   git("remote", "add", "origin", "https://github.com/LilSticky/Neil");
   git("fetch", "-q", "origin", "deploy");
   git("checkout", "-q", "-b", "deploy", "--track", "origin/deploy");
   console.log("Bootstrap done: restart the server.");
   ```

2. **Start**. The console prints `Bootstrap done`. **Restart**: from now on every start runs `git pull`
   (Auto Update) and then the real `dist/main.js`.

## 4. Deploys

Every push to `main` with green checks runs the CI `deploy` job: it builds and adds **one new commit**
to the `deploy` branch (never a force-push, or the server's `git pull` breaks). That commit holds only
`dist/`, a `package.json` without dev dependencies, a matching `package-lock.json`, `build-info.json`
(short commit sha and build time, shown by `/ping`) and a `.gitignore`. It never holds `.env` or `data/`.

After a deploy, click **Restart** in the panel: the server pulls the commit, installs the runtime
packages, and starts Neil. `/ping` then shows the new version. Restarts can't be automated:
Wispbyte's restart needs a browser login behind a bot check, not an API key.

Slash commands are registered from a developer machine with `npm run commands:register` (settings from
the local `.env`), and only when the command list changes; Neil never registers them itself.

**Data**: Neil keeps `data/neil.db` in the server folder (`DATA_DIR=./data`). `git pull` leaves it
alone because it is untracked. If the database is corrupt, Neil refuses to start and says so rather
than starting over.

**Running locally**: there is only one bot application, so **Stop** the Wispbyte server before
`npm run dev`, and **Start** it again when done.

**If `git pull` fails on start** with "untracked working tree files would be overwritten", the old
build keeps running. Delete the named file in **Files** (never `.env` or `data/`) and **Start**. It happened
once, on 2026-10-29: the placeholder had no lockfile, so the server's `npm install` created an untracked
`package-lock.json` that the first real deploy then tracked. Since `deploy` ships a lockfile that
`npm install` leaves unchanged, it should not recur.

A crash is restarted by Wispbyte itself, but it gives up after two crashes within 60 seconds. A
reinstall (if the panel offers one) wipes the folder, including `data/`; avoid it after the first setup.

Free plan: log in to Wispbyte at least every two weeks to keep the server.

**Set up and verified 2026-10-29**: production bot "Neil" (Application ID `1565184120471027963`) on the
test server (`819691545195577395`); the `deploy` placeholder confirmed Node 24.22.1, the Git checkout,
the `.env` settings, the token and the server membership.

## 5. Persistence check

Restart (2026-10-29): **kept**. `/ping` showed `Data kept since 2026-10-29 03:34 UTC · start #1`, then
`start #2` with the same time after a Restart. Redeploy (2026-10-29, `7db1eba`): **kept**, `start #3`
with the same time. `data/` persists; a reinstall is still expected to wipe it.
