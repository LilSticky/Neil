# Review: Call out a booty

`bot-reviewer` pass on 2026-11-07 (T016), against `origin/main`. Read-only; the fixes went through red and green.

## Fixed

1. **3-second window on `/booty`**: reading the role's holders goes over REST and can pass Discord's limit. `/booty` now defers privately after the checks that need no wait, and answers with `editReply`.
2. **An uncaught throw after the claim**: a failing synchronous read locked the Alliance for a minute and left the caller on "calling". The whole call is now caught: the claim is released and the caller is told.
3. **Time zone in an error line**: against ADR 13. Removed.
4. **Embed Links**: the card is an embed, and Discord drops embeds without this permission, with no error. It is now in the layout's permissions and in Neil's overwrite on `alliance-chat`.

## Decided, no change

- **Member id in error lines**: the reviewer asked to remove it. It stays in console errors for a Member who was skipped, because a corrupt row must be found to be fixed "by hand". A skipped Member wasn't mentioned, so this doesn't say who was. ADR 13 records it.
- **A thread inside `alliance-chat`**: refused as the wrong channel. Safe, and the spec names the channel only.
- **The cooldown runs from Confirm, not from the post**: a slow call can outlast it. Harmless: the spec's limit is on Confirms a minute apart.
- **Display name falls back to the username** when the Member isn't cached. Cosmetic.

## Checked, no finding

- Mentions: `allowedMentions` with `parse: []` and exact users on every post, so no name can ping anyone.
- Game API: one uncharged lookup per Booty Call. What the game says can be as old as the cache allows; the spec's assumptions cover this.
- `/help` builds from `commands`, so both commands appear by themselves.
- GuildPresences is already on; presences are cache-only, and a Member with no presence seen reads as offline on Discord.

## Found outside the reviewer's pass, by the orchestrator

- `online: false` must not beat a missing Last Online: that contradicted the user's decision in slice 012. Fixed by reusing `lastSeen`.
- Confirm did not re-check the Alliance role; an empty roster mentioned nobody; Neil had no access to `alliance-chat` once Administrator comes off. All fixed.

## Not verifiable without a real server

- Real timing of the REST member listing.
- `update` followed by `editReply` on the private confirmation.
- Whether `command.channel` and its parent are always available for a guild text channel.

TEST-RUN.md §6u covers these.

## Left as it is

- The branch of `failAfterClaim` for a card already posted can't be reached today: each step after the post catches its own failure. It stays as a safety net and has no test.
