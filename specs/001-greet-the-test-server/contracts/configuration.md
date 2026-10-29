# Contract: configuration and startup

Neil's interface towards whoever runs it. Fields and rules: [data-model.md](../data-model.md#configuration).

## Environment

See the table in the data model. `env.example` lists every variable with a placeholder value.

## Startup output on invalid configuration

Printed to stderr, exit status 1, before any connection to Discord:

```text
Neil cannot start, configuration is invalid:
- DISCORD_TOKEN: required
- DISCORD_GUILD_ID: must be a Discord ID (17–20 digits)
- DATA_DIR: ./data is not writable
```

Never contains the value of `DISCORD_TOKEN` (or any later secret).

## Exit statuses

| Status | When |
|--------|------|
| 0 | stopped by `SIGINT` / `SIGTERM` after a clean shutdown |
| 1 | invalid configuration, invalid build info, unusable data folder or start record, rejected login |

## npm scripts

| Script | Does |
|--------|------|
| `npm run dev` | run from source with reload, settings from `.env` |
| `npm run build` | compile to `dist/` |
| `npm start` | `node dist/main.js` (settings from the environment) |
| `npm run test` / `test:watch` | Vitest |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm run commands:register` | register guild commands for `DISCORD_GUILD_ID` (settings from `.env`) |
