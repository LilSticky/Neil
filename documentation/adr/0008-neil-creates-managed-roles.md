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
- Neil adds and removes only Managed Roles; every other role of a Member is never touched. Amended in slice 013: the
  Onboarding Role is the one other role Neil gives and takes, found, created and refused by the same rules.
- Neil's role sits above the Managed Roles and below Officer roles (server setup, HOSTING.md).
- Per Link, Neil stores the nickname and Managed Role names it last applied, when, and whether the apply was
  complete. This is personal data under ADR 7 and is deleted with the Link.

## Consequences

- No configuration per Alliance or Kingdom; new Alliances and Guests just work.
- A role an Officer creates by hand with a convention name becomes a Managed Role; Officers must not give such a
  role permissions (Neil refuses it if they do).
- Role names are the contract: renaming a Managed Role by hand makes Neil create a new one.
- The server's 250-role limit bounds Alliances plus Kingdoms; a failed creation is logged.
