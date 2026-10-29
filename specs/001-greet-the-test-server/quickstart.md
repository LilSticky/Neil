# Quickstart: validating Greet the test server

## Prerequisites

- Node.js 24, `npm ci` done.
- Neil's one Discord application, invited to the **test server** with scopes
  `bot applications.commands` and permissions `0`.
- `.env` filled from `env.example` with Neil's values; git-ignored.
- For local runs, the Wispbyte server is **stopped**, so only one copy of Neil answers.

## 1. Automated checks (FR-009)

```powershell
npm run typecheck; npm run lint; npm run test
```

All green; the same runs in CI on the pull request.

## 2. Bad configuration (User Story 2)

Run `npm start` with `DISCORD_TOKEN` and `DISCORD_GUILD_ID` removed: exit status 1, both variables
named, no token in the output. See [contracts/configuration.md](contracts/configuration.md).

## 3. Local `/ping` (User Story 1)

```powershell
npm run commands:register   # once per command change
npm run dev
```

Stop the Wispbyte server first. On the test server: Neil shows online; `/` offers `/ping`; running it gives the ephemeral
reply from [contracts/ping-command.md](contracts/ping-command.md) within 3 seconds, version `dev`.

## 4. Wispbyte (User Story 3)

Follow `documentation/HOSTING.md` (written in this slice). Merge a change to `main`, wait for CI and
the deploy job, click **Restart** in the panel, then `/ping`: the version is the
merge commit's short sha.

## 5. Persistence (User Story 4)

On Wispbyte: `/ping` (note first start and start #), restart the server from the panel,
`/ping` (same first start, # +1), redeploy (merge any change), `/ping` (same first start, # +1).
Record the result in `tasks.md` and `documentation/HOSTING.md`; if the first start changed, supersede
ADR 5.
