# Research: Set up the server

## R1 REST only

- **Decision**: the script uses discord.js `REST` and `Routes`, as `register-commands.ts` does. No `Client`, no gateway.
- **Rationale**: a second gateway login with Neil's token beside Wispbyte is what HOSTING.md forbids; REST calls don't take part in it.
- **Alternatives**: a discord.js `Client` gives caches, but opens the gateway.

## R2 Settings

- **Decision**: read `DISCORD_TOKEN`, `DISCORD_GUILD_ID` and `HOME_KINGDOM` directly, not `loadConfig`. The bot's id comes from `GET /users/@me`.
- **Rationale**: `loadConfig` requires role and channel IDs that don't exist yet on a new server (FR-014).

## R3 Matching

- **Decision**: exact name. Roles across the server. Categories across the server. A channel in its category first, otherwise
  anywhere on the server by name; Alliance channels only within their category, with the same names in each (`alliance-chat`,
  `alliance-voice`). The category carries the role's name, `[NML]`.
- **Rationale**: fixed channel names avoid guessing how Discord rewrites a tag with symbols in a text channel's name, which would
  break "safe to run twice". Layout text channel names must already be in Discord's form: lowercase, no spaces.

## R4 Overwrites

- **Decision**: the domain works with permission names, `ViewChannel` etc., never bits. A channel's wanted overwrites are its
  category's, then its own on top, own winning per permission. They are always spelled out on the channel, not left to inherit.
  A correction is needed when a named allow isn't in the allow or a named deny isn't in the deny. The adapter merges with
  `allow = (allow | wanted) & ~wantedDeny` and the mirror for deny, keeps unrelated bits, and writes the whole overwrite list in
  one PATCH of the channel, so a channel never sits between allow and deny (FR-005, FR-006).
- **Neil** is a member overwrite on the bot's user id. **Interaction Bot** is an external role: found by name, never created.
  `@everyone`'s id is the server's id.

## R5 Alliance role rename

- **Decision**: Neil does the rename, not the script. Before working out what a Member holds, `applyRoles` renames a
  permission-free plain `NML` to `[NML]` for each wanted `[NML]` when no `[NML]` exists. `isManagedRoleName` also takes `[NML]`
  when the tag list holds `NML`, because Applied State, and so `/unlink`, still holds the old name until the next apply.
- **Rationale**: the script can't tell a plain `NML` from any other plain role, which is the reason for brackets. Neil knows the
  tag from the Player. The role is the same one, so holders keep it. It happens at the first Link or Daily Sync after the deploy.
- **Note**: this differs in one point from the option put to the user ("the script renames"). The result is the same.
- **Alternatives**: an argument listing tags to rename: manual, and easy to forget.

## R6 Community

- **Decision**: `COMMUNITY` in the guild's `features` decides. Without it, a forum or announcement channel is planned as text and
  an existing text channel counts as a match. With it, type mismatches are reported.
- **Open on the test server**: whether a forum truly needs Community (discovery section 5). The fallback is safe either way.

## R7 Administrator check

- **Decision**: any role the bot's member holds, or @everyone, has the `Administrator` bit. Checked before the first write of a
  real run. The dry run shows it as a note.
- **Rationale**: `GET /guilds/:id/channels` returns every channel to a bot regardless of View Channel, so a dry run sees all of them.
