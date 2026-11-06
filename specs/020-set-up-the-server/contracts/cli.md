# Contract: `npm run server:setup`

```text
npm run server:setup                     dry run: prints the Setup plan, writes nothing
npm run server:setup -- --apply          real run: needs Administrator on Neil
npm run server:setup -- --layout <path>  another layout file (default: server-layout.json)
```

**Reads**: `DISCORD_TOKEN`, `DISCORD_GUILD_ID`, `HOME_KINGDOM` from the environment or `.env`.

**Exit code**: 0 when the plan ran or was printed, also with findings. 1 for a missing setting, a mistake in the layout, a
real run without Administrator, or any failed write.

**Output**, in this order: what will or did change; warnings (`hides-from-everyone` first); what's outside the layout; failures;
`Nothing to do.` when there are no steps; IDs as `SETTING=value` lines; the steps left by hand; on a real run the last line:
`Now take Administrator off Neil's role.`

The token never appears in the output.
