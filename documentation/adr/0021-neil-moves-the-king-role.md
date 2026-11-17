# 21. Neil moves the King role, only on an Officer's Apply

Date: 2026-11-17

## Status

Accepted. Partly supersedes [ADR 8](0008-neil-creates-managed-roles.md) (Neil's role sits below the Officer roles).
The rest of ADR 8 is unchanged.

## Context

After each Royal City siege the Royal City passes to the next Holding Alliance (the Handover, slice 035). In the game
the receiving Alliance's R5 becomes King, and on the Discord server the `King` role should follow. Officers move it by
hand today, and often late. Issue #133 asks Neil to prepare the move and an Officer to apply it.

Until now Neil never gave or took an Officer role or any role with permissions (ADR 8): its role sits below Moderator
and King, and every apply skips the configured Officer role IDs. `King` (`DISCORD_KING_ROLE_ID`, the second entry of
`officerRoleIds`) is an Officer role: it makes its holder an Officer inside Neil (`isOfficer`) and carries Create Events
(the setup script's `ROLE_GRANTS`). Discord lets a bot give or take only roles below its own highest role, so moving
King needs Neil's role above King.

## Decision

- Neil gains exactly one new authority: it gives and takes the `King` role, and only when an Officer presses Apply on a
  King Move, the move Neil prepared in `#neil-log` after a Handover.
- The King Move names the expected new King (the receiving Alliance's R5, read fresh from the Game API, and that
  Player's Linked Member) and the Members holding King when it was prepared. Apply takes King only from those Members
  and gives it to the new King; nothing else on any Member changes.
- Neil never moves King on its own: no automatic apply, no timer. Only the latest King Move can be applied.
- Neil never gives or takes the Moderator role or any other role with permissions, and never changes the permissions
  of a role at runtime. The regular role sync (name and roles, Daily Sync) still skips both Officer roles.
- Every King Move is logged in `#neil-log`: prepared, applied (by whom, who lost and who got King), refused by Discord,
  superseded, or not prepared.
- Role order on the server: Moderator, then Neil's role, then King, then the Managed Roles.
- Neil keeps only the latest King Move in `neil.db` (Alliance tag, the R5's uid, the new King's and the previous holders'
  Discord user ids, the card message, times, state and who applied it), replaced by the next one; the log is the record
  (ADR 7).

## Consequences

- Officers press one button instead of finding the R5 and moving King by hand; they still decide.
- Risk: with its role above King, a leaked bot token can give King to anyone, and with it Create Events and Officer
  rights inside Neil. Moderator stays out of reach. Rotate the token at once if it leaks (HOSTING.md).
- Neil can now rename Members whose highest role is King (nicknames follow the role order); the name sync already
  treats them like any other Member.
- The setup script can now grant King's Create Events itself, because King is below Neil's role.
- A server whose Neil role is still below King gets a Discord refusal (50013) on Apply; Neil names the fix (drag its
  role above King, below Moderator) and the King Move stays applicable.
- Moving any other permission role, or moving King without an Officer, needs a new ADR.
