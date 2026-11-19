# 8. Neil creates and manages its own roles

Date: 2026-11-01

## Status

Accepted

## Context

Slice 006 gives Linked Members roles for their Alliance, Alliance Rank, Kingdom and Troop Bracket. A Kingdom has
dozens of Alliances and Guests come from any Kingdom, so keeping role IDs in configuration would need an Officer for
every new Alliance or Kingdom. Giving a bot Manage Roles is risky: it can give any role below its own.

## Decision

- Neil finds Managed Roles by name: the Alliance tag (Home Kingdom Alliances only), `R1`–`R5`, `#<kingdom>`,
  `T1`–`T10`. A missing one is created on first use with no permissions, not hoisted, not mentionable.
- Neil uses an existing role with such a name only if it grants no permissions; otherwise it logs and skips it.
  Amended 2026-11-14: a permission the setup script itself grants a role (`ROLE_GRANTS`: Create Events on `R4` and
  `R5`, slice 028) does not count; any other permission still makes Neil refuse the role.
- Neil adds and removes only Managed Roles; every other role of a Member is never touched. Amended in slice 013: the
  Onboarding Role is the one other role Neil gives and takes, found, created and refused by the same rules.
- Amended 2026-11-18 (slice 045, issue #118): the Alliance Leaders Role `[TAG] Leaders` is a Managed Role too. Neil
  gives it, with the Alliance role, to a Member Linked to the R4 or R5 of a Home Kingdom Alliance, and takes it off on a
  rank or Alliance change and at Unlink, through the same paths as the other Managed Roles. Every `[TAG] Leaders` role
  counts as managed, so one of an old tag is taken off as well. It is not an Alliance role: it gets no Alliance area and
  is never renamed. The setup script also creates it, and gives it the only view of the Alliance's `alliance-leaders`
  channel; Neil never changes channel permissions itself.
- Neil's role sits above the Managed Roles and below Officer roles (server setup, HOSTING.md).
- Per Link, Neil stores the nickname and Managed Role names it last applied, when, and whether the apply was
  complete. This is personal data under ADR 7 and is deleted with the Link.

## Consequences

- No configuration per Alliance or Kingdom; new Alliances and Guests just work.
- A role an Officer creates by hand with a convention name becomes a Managed Role; Officers must not give such a
  role permissions (Neil refuses it if they do), other than the setup script's own grants.
- Role names are the contract: renaming a Managed Role by hand makes Neil create a new one.
- The server's 250-role limit bounds Alliances plus Kingdoms; a failed creation is logged.
