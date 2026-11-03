# Roadmap

Ordered slices, cut by capability (see the constitution). Each slice goes through Spec Kit on its own
branch and is squash-merged into `main` through a pull request that closes its issue, once its Definition
of Done gate is green. Where work stands right now: [STATUS.md](STATUS.md). Where the slices come from:
[discovery/initial.md](discovery/initial.md).

States: `planned` · `in progress` · `in review` · `done`

## Next

| # | Slice | Lets… | Domain | Adapters | State |
|---|-------|-------|--------|----------|-------|
| 001 | Greet the test server | an Officer see Neil online and answer `/ping` on the test server, deployed from `main` to Wispbyte | – (config validation) | discord.js client, slash-command registration, env config, CI, Wispbyte deploy (ADR 6), persistence check | done |
| 002 | Look up a player | any Member run `/player` by uid (and `/alliance` by kingdom + alliance) and see a profile card with rank | Player, Kingdom, Alliance, Alliance Rank | Game API client (auth, User-Agent, schema validation, error mapping), recorded fixtures, embed | done |
| 003 | Look up players within the daily quota | lookups to keep working all day: repeated lookups served from cache, `/quota` for Officers, a clear message when the Daily Quota is spent | Daily Quota | cache (≥10 min TTL), persisted quota counter, `X-RateLimit-*` headers, 429/503/504 handling | done |
| 004 | Find a player by name or alliance | any Member run `/player` by name (with a pick list when the name matches Players in several kingdoms; the kingdom narrows it) and see an Alliance's members with their uids on `/alliance`, to look up any of them; lookups stop short of the Quota Reserve, which is kept for Onboarding Interviews | Player name, Alliance roster, Quota Reserve | `/players/name/{name}`, `/players/{kingdom}/{name}`, `/alliances/name/{name}` (exact full name), 409 match list, select menu or buttons | done |
| 005 | Interview a new member | a Member who joins be walked through giving their player uid in a private thread, confirm the Player Neil found, and get Linked (an already linked uid is refused; an unknown rank goes to the Alliance's R5); it starts by recommending the Player whose name matches the Member's Discord name, and lookups search by name or tag without showing uids | Onboarding Interview (state machine), In-game Proof (uid), Link, Rank Approval, use of the Quota Reserve | `guildMemberAdd`, private thread, buttons/modals, storage | in review |
| 006 | Give a member their name and roles | an approved Member get their nickname (`[TAG\|R5] Nick \| #331`) and alliance, rank, kingdom and bracket roles | nickname format, role mapping, Managed Roles | role/nickname changes, role hierarchy checks, log channel | in review |
| 007 | Find an alliance by approximate name | any Member find a Home Kingdom Alliance by part of its name or tag or a near spelling: suggestions while typing `/alliance`, and a pick list when the exact name finds nothing | Known Alliance, approximate matching | autocomplete, storage of seen Alliances, Game API client hook | in progress |
| 008 | Alliance overview | any Member see an Alliance's activity from the Alliance card: totals, top contributors, Least Active members and a paged per-member table | Alliance Overview, Weekly Activity, Daily Honor, Daily Tech, Least Active | roster fields, button, private paged reply | in progress |

## Later (unordered)

- **Keep roles in sync**: re-read alliance rosters within the budget and update roles and nicknames when a
  Player changes alliance, rank or kingdom.
- **Correct a link**: Officers relink, unlink or override a Member; a Member asks for a re-check.
- **Say goodbye**: clean up Links and roles when a Member leaves.

## Project infrastructure (not slices)

- **GitHub repository**: [LilSticky/Neil](https://github.com/LilSticky/Neil). CI (typecheck, lint, test, build,
  deploy) arrived with slice 001; issue templates, triage and Dependabot can follow as needed.
- **Agentic toolkit**: constitution, AGENTS.md, Spec Kit, `.claude/` agents, skills and hooks.
