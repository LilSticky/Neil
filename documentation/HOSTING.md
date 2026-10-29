# Hosting

How Neil runs: a **test bot** locally for development, the **production bot** on Wispbyte (ADR 6).
Why it is set up this way: [specs/001-greet-the-test-server/research.md](../specs/001-greet-the-test-server/research.md)
(R1, R2, R8). Never paste tokens into chats, issues or commits.

## 1. Discord applications (once per bot)

Do this twice in the [Discord developer portal](https://discord.com/developers/applications): one
application named for testing (the test bot), one for production (Neil).

1. **New Application**, give it a name.
2. **General Information**: copy the **Application ID** → `DISCORD_APPLICATION_ID`.
3. **Bot**: **Reset Token**, copy it → `DISCORD_TOKEN` (shown once; keep it only in the `.env` files).
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

**Startup** tab: choose the Node.js **24** image.

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

**Order matters.** The panel clones only into an empty server folder, and the `deploy` branch exists
only after the first green build on `main`. So:

1. Wait until the `deploy` branch exists on GitHub.
2. **Settings → Reinstall Server**, so the folder gets the clone.
3. **Files**: create `.env` in the top folder with the production bot's values
   (`DATA_DIR` stays `./data`).
4. **Start**. The console should show Neil logging in; `/ping` on the test server answers.

Each later deploy: CI adds a commit to `deploy`, then the server restarts (automatic if a panel API
key is configured, otherwise **Restart** in the panel) and pulls it. A reinstall wipes the folder,
including `.env` and `data/`; avoid it after the first setup.

Free plan: log in to Wispbyte at least every two weeks to keep the server.

## 4. Persistence check

Result recorded here after the check in slice 001 (quickstart step 5): *not yet done.*
