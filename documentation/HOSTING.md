# Hosting

How Neil runs: a **test bot** locally for development, the **production bot** on Wispbyte (ADR 6).
Why it is set up this way: [specs/001-greet-the-test-server/research.md](../specs/001-greet-the-test-server/research.md)
(R1, R2, R8). Never paste tokens into chats, issues or commits.

## 1. Discord applications (once per bot)

Do this twice in the [Discord developer portal](https://discord.com/developers/applications): one
application named for testing (the test bot), one for production (Neil).

1. **New Application**, give it a name.
2. **General Information**: copy the **Application ID** → `DISCORD_APPLICATION_ID`.
3. **Bot**: **Reset Token**, copy it → `DISCORD_TOKEN` (shown once; keep it only in the `.env` files and the Wispbyte panel).
   Leave all privileged gateway intents off for now (Server Members arrives with slice 004).
   Turn **Public Bot** off so only you can invite it.
4. **OAuth2 → URL Generator**: scopes `bot` and `applications.commands`, no bot permissions. Open the
   URL and add the bot to the **test server**.

Test server ID: Discord **User Settings → Advanced → Developer Mode** on, then right-click the server
icon → **Copy Server ID** → `DISCORD_GUILD_ID`. Both bots use the test server's ID during slice 001.

## 2. Local settings

From `env.example`, in the repository root (both files are git-ignored):

- `.env`: the test bot's values. Used by `npm run dev` and `npm run commands:register`.
- `.env.production`: the production bot's values. Used only to register its commands:
  `npm run commands:register -- --env-file=.env.production` (exact form fixed in slice 001).

## 3. Wispbyte server

**Account**: turn on two-factor authentication (Wispbyte's security advice).

**Startup** tab: choose the Node.js **24** image, and set these **environment variables** (production
bot's values; names exactly as written):

| Variable | Value |
|----------|-------|
| `DISCORD_TOKEN` | the production bot's token |
| `DISCORD_APPLICATION_ID` | the production bot's Application ID |
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

Each start then prints what is running; with the `deploy` placeholder it is the Node version and
whether the settings are present.

Each later deploy: CI adds a commit to `deploy`; click **Restart** in the panel and the server pulls
it on startup. Restarts can't be automated: Wispbyte's restart needs a browser login behind a bot
check, not an API key. A crash is restarted by Wispbyte itself. A reinstall (if the panel offers one) wipes the folder,
including `data/`; avoid it after the first setup.

Free plan: log in to Wispbyte at least every two weeks to keep the server.

**Set up and verified 2026-10-29**: production bot "Neil" (Application ID `1565184120471027963`) on the
test server (`819691545195577395`); the `deploy` placeholder confirmed Node 24.22.1, the Git checkout,
the `.env` settings, the token and the server membership.

## 4. Persistence check

Result recorded here after the check in slice 001 (quickstart step 5): *not yet done.*
