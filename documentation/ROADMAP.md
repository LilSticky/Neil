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
| 005 | Interview a new member | a Member who joins be walked through giving their player uid in a private thread, confirm the Player Neil found, and get Linked (an already linked uid is refused; an unknown rank goes to the Alliance's R5); it starts by recommending the Player whose name matches the Member's Discord name, and lookups search by name or tag without showing uids | Onboarding Interview (state machine), In-game Proof (uid), Link, Rank Approval, use of the Quota Reserve | `guildMemberAdd`, private thread, buttons/modals, storage | merged (manual check open) |
| 006 | Give a member their name and roles | an approved Member get their nickname (`[TAG\|R5] Nick \| #331`) and alliance, rank, kingdom and bracket roles | nickname format, role mapping, Managed Roles | role/nickname changes, role hierarchy checks, log channel | merged (manual check open) |
| 007 | Find an alliance by approximate name | any Member find a Home Kingdom Alliance by part of its name or tag or a near spelling: suggestions while typing `/alliance`, and a pick list when the exact name finds nothing | Known Alliance, approximate matching | autocomplete, storage of seen Alliances, Game API client hook | merged (manual check open) |
| 008 | Alliance overview | any Member see an Alliance's activity from the Alliance card: totals, top contributors, Least Active members and a paged per-member table | Alliance Overview, Weekly Activity, Daily Honor, Daily Tech, Least Active | roster fields, button, private paged reply | merged (manual check open) |
| 009 | Keep roles in sync | Linked Members' nicknames and Managed Roles follow the game: a Daily Sync re-reads rosters within its Sync Share | Daily Sync, Sync Share | scheduler, roster re-reads, sync purpose in the quota | merged (manual check open) |
| 010 | Say goodbye | a Linked Member who leaves be Unlinked at once (log line, private message, their pending Rank Approvals go to the Officers), also when Neil missed the leave | Unlink | `guildMemberRemove`, startup and Daily Sync sweep, private message | merged (manual check open) |
| 011 | Correct a link | Officers Unlink any Linked Member, give a Rank Approval at any time and Link a handed-off Member by hand (Officer Link); a Member Unlinks themselves (`/unlink`, `/rank`, `/link`). Scope cut: the Member re-check (the Daily Sync covers it) | Officer Link, Rank Approval by an Officer, Unlink by an Officer or the Member | slash commands, Link confirmation buttons, storage migration for who made a Link | merged (manual check open) |
| 012 | See a fuller card | any Member see more on `/player` and `/alliance` cards: Kills, VIP Level, Likes, Last Online, Language, Location; Alliance Level, Gift Level, Kingdom Might Rank, Join Requirements; Might per roster row; avatar and badges; an accent color and a clear grid. No extra Game API request | Kills, VIP Level, Likes, Last Online, Language, Location, Alliance Level, Gift Level, Kingdom Might Rank, Join Requirements | lenient schema fields, tracker picture URLs, embed layout | merged (manual check open) |

## Later (unordered)

- **REAPER: Roster of Exiled Antagonists, Pervs, Evildoers & Reprobates.** Lets the R5s keep a list of
  Players the server's community has exiled for being malicious (add and remove), and any Member find the
  closest unshielded exile, with their coordinates. Domain: exile list, closest unshielded exile (terms
  to agree in the dictionary). Adapters: slash commands, storage, Game API coordinates (`x`/`y`).
  Open questions in [#35](https://github.com/LilSticky/Neil/issues/35); notably the Game API's `shielding` has always read 0 (GAME-API.md), so
  shield state may not be knowable.

## Project infrastructure (not slices)

- **GitHub repository**: [LilSticky/Neil](https://github.com/LilSticky/Neil). CI (typecheck, lint, test, build,
  deploy) arrived with slice 001; issue templates, triage and Dependabot can follow as needed.
- **Agentic toolkit**: constitution, AGENTS.md, Spec Kit, `.claude/` agents, skills and hooks.
