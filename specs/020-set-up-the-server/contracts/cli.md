# Contract: `npm run server:setup`

```text
npm run server:setup                     dry run: prints the Setup plan, writes nothing
npm run server:setup -- --apply          real run: needs Administrator on Neil
npm run server:setup -- --layout <path>  another layout file (default: server-layout.json)
```

**Reads**: `DISCORD_TOKEN`, `DISCORD_GUILD_ID`, `HOME_KINGDOM` from the environment or `.env`. Optional (issue #127):
`NEIL_POLICE_ROLE_ID` (Neil Police's role, 17 to 20 digits) and `NEIL_POLICE_GUILD_IDS` (comma-separated). When the role is
set and `DISCORD_GUILD_ID` is in the list, every category and channel hidden from @everyone also gets a role overwrite
allowing Police View Channel and Read Message History. A malformed `NEIL_POLICE_ROLE_ID` is a missing setting.

**Exit code**: 0 when the plan ran or was printed, also with findings. 1 for a missing setting, a mistake in the layout, a
real run without Administrator, or any failed write.

**Output**, in this order: what will or did change; warnings (`hides-from-everyone` first, and
`Neil Police's role (NEIL_POLICE_ROLE_ID <id>) is not on this server; no overwrites for it` when the role is missing);
`NEIL_POLICE_ROLE_ID is set, but this server is not in NEIL_POLICE_GUILD_IDS: no overwrites for Neil Police.` when the
role is set but the server isn't listed; what's outside the layout; failures;
`Nothing to do.` when there are no steps; IDs as `SETTING=value` lines; the steps left by hand; on a real run the last line:
`Now take Administrator off Neil's role.`

The token never appears in the output.
