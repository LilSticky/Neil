# Research: Keep Preferences within the Home Kingdom

## How Neil knows a Member's Kingdom

- **Decision**: read `#<homeKingdom>` from the Applied State's roles. At a Link, where no Applied State exists yet, read the
  Player's Kingdom directly.
- **Rationale**: `rolesFor` always includes `#<kingdom>`, and both applies record the Applied State before they apply the
  Preference Roles, so the state is current at that moment. It costs no migration and no Game API call (SC-004).
- **Alternatives**: a Game API lookup per press (spends the quota, and a Member's press would wait on it); a `kingdom` column
  on the Link (a migration, and a second copy of what the Applied State already holds); the Member's Discord roles (a
  Member can't change them, but they need a server fetch and an Officer can change them by hand).

## Three cases, not two

- **Decision**: a Member is known Home Kingdom (state holds the role), known Guest (state exists without it), or unknown (no
  state). Only known Home Kingdom gets Preference Roles. Only a known Guest is refused.
- **Rationale**: the Preferences message is posted before the name and roles are applied, because the preselected Language
  must be stored first. A Home Kingdom Member pressing in that gap has no state yet. Refusing them would be wrong, and giving
  roles would fail open. Saving the choice and giving no role is right: the apply that follows gives the roles.
- **Alternatives**: post the message after the name and roles (breaks the preselected Language's order, and slows the message
  behind Discord calls).

## Done for a Guest

- **Decision**: Done still closes the message.
- **Rationale**: it changes no Preference and no role, and closing the thread is what a Member who moved Kingdom needs.
