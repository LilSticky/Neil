# Discovery: Royal City siege and City Rotation (issue #120, 2026-11-15)

Proposal by the `domain-modeler` agent; the user's answers (section 4) win. Related: #117 (`kvk-battle-plan.md`), #119 (NaP member register), #121 (council vote), #123 (Server Time), #124 (Discord timestamps).

## 1. What we know

- King is both the in-game title of the Alliance leader who holds the Royal City and the King Discord role (DICTIONARY.md). It changes hands every Friday at the Royal City siege. Kingdom 330 rotates among its top 3, and other Kingdoms differ.
- **The Game API has no Royal City or King field** (checked 2026-11-15 on the current King of 330, one request): `ranks` holds the Player's Kingdom leaderboard places (Might, Kills, Heroes), not a title, and the skin and frame fields name nothing like King. Neil cannot see who holds the Royal City.
- Neil never gives or takes Officer roles or roles with permissions today (`name-and-roles.ts`, `member-roles.ts`). King is an Officer role with CreateEvents.
- REAPER (slice 014): Members Linked to a Home Kingdom R5 decide, and every change is logged. This is the precedent for Q1.
- Saturday's KvK window is a Raid. Here, "siege" always means the Royal City siege.

## 2. Proposed terms (for approval at `/speckit-specify`)

- **Royal City siege**: the weekly Friday moment when the Royal City, and with it the King, changes hands. A fixed time in Server Time (configuration).
- **City Rotation**: the Home Kingdom's agreed order in which Alliances take the Royal City, one Turn each.
- **Holding Alliance**: the Alliance holding the Royal City this Turn.
- **Turn**: one Alliance's time as Holding Alliance, from one Royal City siege to the next.
- **Handover**: the Royal City passing to the next Alliance at a Royal City siege.
- **Handover Reminder**: Neil's mention of the outgoing and receiving Alliances' leaders before the siege.
- **NaP Council**: the leading Alliances' R5s who agree the NaP and the City Rotation (membership: #119).

Aggregate: **City Rotation** (one per Home Kingdom), holding the ordered Alliances, the Holding Alliance, the Turn, a paused flag and the Handovers.

## 3. Slicing (proposal)

1. **See whose turn it is**: the rotation, the current and next holder, a pinned card, a command and a log.
2. **Be reminded before the handover**: Handover Reminders and the next-holder announcement (028 reminder clock).
3. **Hand the King role over**: Neil works out the expected King (answer 2), and an Officer applies the role move. Needs an ADR, since Neil starts touching an Officer role.
4. **Change the rotation together**: skip, reorder, leave, pause. Depends on #119 and #121.

## 4. The user's answers (2026-11-15)

1. **Who edits the rotation**: any Member Linked to the R5 of an Alliance in the rotation, with every change logged (as REAPER does). A council vote (#121) may replace this later.
2. **How Neil learns of a handover**: the user first wanted it from the Game API, but the API has no King field (section 1). Decided instead: **rotation plus a fresh R5.** After the siege, Neil takes the next Alliance in the rotation, reads its R5 fresh from the Game API (`leader_id`), asks that R5 to confirm, and an Officer applies the role. In Contested mode, an Officer names the new Holding Alliance.
3. **King role**: Neil prepares the move, and **an Officer presses "apply"**. Neil does not move the Officer role by itself.
4. **Siege time and new King**: a fixed Friday time in Server Time (configuration). The new King is always the receiving Alliance's R5.

5. **Skip or leave**: the NaP Council decides each time; Neil waits for its decision (the Turn stays open until someone records it).
6. **Order**: a fixed list the R5s keep.
7. **Contested Kingdoms**: a server setting, Rotation or Contested. In Contested there is no order; an Officer names the new Holding Alliance.
8. **Channels**: the card pinned in `nap-announcements`, news in `home-kingdom-announcements`, Handover Reminders in `nap-leaders`.

## 6. Smallest first cut (proposal): "See whose turn it is"

R5s in the rotation set it up by Alliance tag (Known Alliances). Any Member sees the current and next Holding Alliance and the next siege (Server Time plus `<t:…>`) through a command and a pinned card. After the siege, Neil names the expected new Holding Alliance and its fresh R5, and that R5 confirms (answer 2). Moving the King role (slice 3) needs an ADR before its spec. Everything is logged in `#neil-log`.
