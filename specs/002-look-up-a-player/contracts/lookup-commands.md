# Contract: `/player` and `/alliance`

Both: guild commands for `DISCORD_GUILD_ID` only, guild context only, no default member permissions
(any Member), `allowedMentions: { parse: [] }` on every reply.

## `/player`

| Field | Value |
|-------|-------|
| description | `Look up a player by uid` |
| option `uid` | string, required, description `The player's uid (the number under the profile picture)`, max length 32 |

## `/alliance`

| Field | Value |
|-------|-------|
| description | `Look up an alliance in a kingdom` |
| option `kingdom` | integer, required, min 1, max 9999, description `The kingdom number` |
| option `alliance` | string, required, max length 40, description `The alliance tag, e.g. NML` (full names give 404, see GAME-API.md) |

## Flow

1. Validate the options (data-model). Invalid → ephemeral reply with the help text, no Game API call.
2. `deferReply()` (public).
3. Ask the Game API client.
4. `found` → `editReply({ embeds: [card] })`. Anything else → `deleteReply()`, then ephemeral
   `followUp` with the message below. A failing Discord call is logged, never thrown.

## Player card (embed)

- Title: `{name}` (escaped)
- Fields (inline): `uid` · `Kingdom` `#{kingdom}` · `Power` `{power:,}` · `Sanctuary level` `{lv}` ·
  `Alliance` `[{tag}] {name}` or `No alliance` · `Alliance Rank` `R1`–`R5` or `Unknown` (field left out
  when there is no Alliance)
- Footer: `Data from Last Asylum Tracker`

## Alliance card (embed)

- Title: `[{tag}] {name}` (escaped)
- Fields (inline): `Kingdom` `#{kingdom}` · `Power` `{power:,}` · `Members` `{memberCount}/{capacity}` ·
  `Leader` `{leaderName}` or `Unknown`
- Footer: `Data from Last Asylum Tracker`

## Messages (ephemeral)

| Case | Text |
|------|------|
| invalid uid | `That doesn't look like a uid. A uid is a number: in the game, tap your profile picture (top left), then the feather next to your name; the number under the picture is your uid.` |
| invalid kingdom | `The kingdom must be a number from 1 to 9999.` |
| invalid alliance | `Give the alliance's tag (up to 40 characters).` |
| player not-found | `No player has the uid {uid}.` |
| alliance not-found | `No alliance "{key}" in kingdom #{kingdom}.` |
| ambiguous | `More than one alliance matches "{key}": {list of [tag] name}. Try the exact tag.` |
| quota-spent | `Lookups are used up for today. They work again after 00:00 UTC.` |
| player not-prepared | `Couldn't find a player with the uid {uid}. Check the uid; if it's right, the tracker may be busy, so try again later.` |
| try-again (and alliance not-prepared) | `The game tracker is busy right now. Try again in a moment.` |
| unavailable | `Lookups are not working right now. Please tell an Officer.` (logged with the reason, never the key) |

User input echoed in a message (`{uid}`, `{key}`) is escaped like Game API text.
