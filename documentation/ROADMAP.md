# Roadmap

Ordered slices, cut by capability (see the constitution). Each slice goes through Spec Kit on its own
branch and is squash-merged into `main` through a pull request that closes its issue, once its Definition
of Done gate is green. Where work stands right now: [STATUS.md](STATUS.md). Where the slices come from:
[discovery/initial.md](discovery/initial.md).

States: `planned` · `in progress` · `in review` · `done`

## Next

| # | Slice | Lets… | Domain | Adapters | State |
|---|-------|-------|--------|----------|-------|
| 001 | Greet the test server | an Officer see Neil online and answer `/ping` on the test server, deployed from `main` to the host | – (config validation) | discord.js client, slash-command registration, env config, CI, deploy to the host (ADR 6) | planned |
| 002 | Look up a player | any Member run `/player` by uid, name, or kingdom + name, and see a profile card | Player, Kingdom, Alliance; ambiguous-name handling | Game API client (auth, User-Agent, schema validation, error mapping), recorded fixtures, embed | planned |
| 003 | Look up players within the daily quota | lookups to keep working all day: repeated lookups served from cache, a reserve kept, `/quota` for Officers, a clear message when the quota is spent | quota budget (reserve, per-purpose shares) | cache (≥10 min TTL), persisted quota counter, `X-RateLimit-*` headers, 429/503 handling | planned |
| 004 | Interview a new member | a Member who joins be walked through giving their player uid in a private thread, confirm the Player Neil found, and get Linked | Onboarding Interview (state machine), In-game Proof (uid), Link | `guildMemberAdd`, private thread, buttons/modals, storage | planned |
| 005 | Give a member their name and roles | an approved Member get their nickname (`[TAG\|R5] Nick \| #331`) and alliance, rank, kingdom and bracket roles | nickname format, role mapping, Managed Roles | role/nickname changes, role hierarchy checks, log channel | planned |

## Later (unordered)

- **Keep roles in sync**: re-read alliance rosters within the budget and update roles and nicknames when a
  Player changes alliance, rank or kingdom.
- **Correct a link**: Officers relink, unlink or override a Member; a Member asks for a re-check.
- **Say goodbye**: clean up Links and roles when a Member leaves.
- **Alliance overview**: `/alliance` roster lookups, activity (`active`, `daily_honor`, `daily_tech`).

## Project infrastructure (not slices)

- **GitHub repository**: [LilSticky/Neil](https://github.com/LilSticky/Neil). CI (typecheck, lint, test)
  arrives with slice 001; issue templates, triage and Dependabot can follow as needed.
- **Agentic toolkit**: constitution, AGENTS.md, Spec Kit, `.claude/` agents, skills and hooks.
