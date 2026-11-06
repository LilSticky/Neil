# Feature Specification: Set up the server

**Feature Branch**: `020-set-up-the-server`

**Created**: 2026-11-06

**Status**: Draft

**Input**: Issue [#62](https://github.com/LilSticky/Neil/issues/62): "A server owner runs one script that does as much of the
server setup as Discord allows: roles, categories, channels and permission overwrites from one layout file, with a dry run,
safe to run twice, reporting what it can't do." Slice 019's [discovery](../../documentation/discovery/019-know-what-a-server-needs.md)
decides what to set up.

## Clarifications

### Session 2026-11-06

- Q: Which rights does the script run with (discovery Q6)? → A: Neil's token, while the server owner gives Neil's role
  Administrator for the run and takes it off afterwards. The user chose this knowing it departs from constitution V; ADR 12
  records it. The script is the owner's tool: Neil itself keeps no channel rights.
- Q: Are channels outside the Server Layout hidden? → A: no. They are only reported, and the owner hides them by hand. This
  replaces discovery Q1's answer for the script.
- Q: A layout channel or category already exists with other permissions? → A: the script adds or corrects the layout's
  overwrites, leaves other overwrites alone and reports them.
- Q: Which languages does the shipped layout file hold? → A: all 17.
- Q: How are Alliance roles recognised? → A: by their brackets, `[TAG]`. Neil today names them plain `NML`, so Neil changes to
  `[NML]` in this slice and existing plain roles become bracketed, with their holders kept.
- Q: Existing layout channels get their @everyone deny on the first real run, so unlinked Members lose them at once. → A: the
  dry run warns about each one, and the owner makes the real run on the announced date. No separate mode.
- Q: AD and KvK (discovery T008)? → A: Alliance Duel and Kingdom vs Kingdom. Each group has text chat, voice, announcements
  (only King posts), a tactics forum and an intel channel; KvK also has five voice channels with tactical names. Both are seen
  by the `PvP` and `Events` roles, not the whole Kingdom. This replaces "Kingdom" in SERVER-SETUP section 3.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The owner sees what would change (Priority: P1)

The owner runs the script without asking it to change anything. It lists what it would create and correct, what already
fits, what it can't do, and which existing channels would be hidden from @everyone. Nothing changes on the server.

**Why this priority**: the owner must be able to trust the script on a live server before it touches anything.

**Independent Test**: automated: given a server state and a layout, the plan lists the expected changes; a run without the
apply option makes no write.

**Acceptance Scenarios**:

1. **Given** an empty server, **When** the owner runs the script without the apply option, **Then** it lists every role,
   category and channel it would create, and the server stays unchanged.
2. **Given** an existing layout channel that @everyone can see, **When** the dry run ends, **Then** the report warns that the
   real run hides it from @everyone.
3. **Given** a layout file with a mistake, **When** the script starts, **Then** it names the mistake and stops before reading
   the server.

---

### User Story 2 - The owner builds a new server (Priority: P1)

The owner gives Neil's role Administrator, runs the script for real, and finds the roles, categories, channels and
permissions of the Server Layout in place. The script prints the IDs Neil's settings need, and what is left to do by hand.

**Why this priority**: this is the slice: it takes most of STARTUP-GUIDE.md off the owner's hands.

**Independent Test**: automated against a fake server: applying the plan to an empty server yields the layout. Manual: on the
test server.

**Acceptance Scenarios**:

1. **Given** an empty server and Neil holding Administrator, **When** the script applies, **Then** every role the layout
   names exists with no permissions, and every category and channel exists with the layout's overwrites.
2. **Given** Neil without Administrator, **When** the script is asked to apply, **Then** it changes nothing and says what to
   give Neil.
3. **Given** a finished run, **When** the report ends, **Then** it prints the IDs for Neil's settings, the steps left by hand
   and a reminder to take Administrator off Neil.
4. **Given** a server without Community, **When** the layout asks for a forum or an announcement channel, **Then** a plain text
   channel with the same permissions is created, and the report says so.
5. **Given** one write fails, **When** the script goes on, **Then** the other writes still happen and the report names the
   failure.

---

### User Story 3 - The owner runs it again (Priority: P2)

The owner runs the script on a server that already has much of the layout: after an earlier run, after a new Alliance, or on
an existing server. It changes only what is missing, and nothing a person added by hand disappears.

**Why this priority**: the live server is such a server, and new Alliances arrive over time.

**Independent Test**: automated: applying twice leaves nothing to do the second time; extra overwrites and unknown channels
are reported and untouched.

**Acceptance Scenarios**:

1. **Given** a server the script has set up, **When** it runs again, **Then** it reports nothing to do and writes nothing.
2. **Given** a layout channel with an extra overwrite, **When** the script applies, **Then** the extra overwrite stays and is
   reported.
3. **Given** a layout overwrite with a wrong permission, **When** the script applies, **Then** only the permissions the layout
   names change within it.
4. **Given** a channel outside the layout, **When** the script runs, **Then** it is reported and not touched.
5. **Given** a new `[ABC]` role, **When** the script runs, **Then** Alliance ABC gets an area with text and voice, seen by
   `[ABC]` only.
6. **Given** a role with a layout name that holds permissions, **When** the script runs, **Then** the role is not changed and
   the report names it, unless it is Moderator, King or a bot's role.

---

### User Story 4 - Alliance roles carry brackets (Priority: P1)

Neil names an Alliance role `[NML]` instead of `NML`. A Member keeps their Alliance role through the change.

**Why this priority**: without it the script can't find Alliances (User Story 3, scenario 5).

**Independent Test**: automated: the role names for a Home Kingdom Alliance Member hold `[NML]`; a server with a plain `NML`
role ends with that same role named `[NML]`.

**Acceptance Scenarios**:

1. **Given** a Home Kingdom Alliance Member, **When** Neil works out their roles, **Then** the Alliance role is `[NML]`.
2. **Given** a permission-free role `NML` held by Members, **When** Neil next applies roles to one of them, **Then** it is the
   same role, now named `[NML]`, and its holders keep it.
3. **Given** a Member who leaves the Alliance, **When** the Daily Sync runs, **Then** `[NML]` comes off them, as `NML` did.

### Edge Cases

- A layout channel exists with the wrong type (for example voice instead of text): it is not changed and is reported.
- A layout channel exists in another category: it is not moved; its overwrites are put right and the report says where it is.
- Two roles or two channels carry a layout name: nothing is guessed; that name is skipped and reported.
- Interaction Bot isn't on the server: its overwrites are skipped and reported, because a bot's role can't be created.
- Moderator or King is created by the script: it lands below Neil, and the report says to drag it above.
- Roles the script creates land below Neil; a role above Neil is reported, because Neil can't give it.
- The server nears Discord's limits on roles or channels: Discord's refusal is reported as a failed write.
- Neil runs on Wispbyte during the script: no conflict, because the script doesn't log in as a running bot.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The script MUST read the Server Layout from one file the owner can edit, and refuse a file with a mistake,
  naming it, before reading the server.
- **FR-002**: The script MUST change nothing unless the owner asks for the real run (dry run by default).
- **FR-003**: The real run MUST require Neil to hold Administrator, and change nothing otherwise. The dry run MUST work
  without it.
- **FR-004**: The script MUST create every role the layout names that is missing, with no permissions, not displayed
  separately and not mentionable. It MUST never change an existing role.
- **FR-005**: The script MUST create every missing category and channel with the layout's overwrites. A channel's overwrites
  MUST be written in one step, so no gap arises between an allow and a deny.
- **FR-006**: For a category or channel that exists, the script MUST set the permissions the layout names and leave all others
  in that overwrite, and all other overwrites, as they are.
- **FR-007**: The script MUST report overwrites outside the layout on layout channels, and all channels and categories outside
  the layout. It MUST NOT change those channels.
- **FR-008**: The report MUST warn about each existing channel that would lose @everyone's View Channel.
- **FR-009**: The script MUST build an Alliance area, from a template in the layout, for every role named `[TAG]`, seen by
  that role.
- **FR-010**: Without Community, a forum or announcement channel MUST be created as a plain text channel, with the same
  permissions, and reported.
- **FR-011**: A failed write MUST NOT stop the other writes, and MUST be reported. A second run MUST then finish the work.
- **FR-012**: The report MUST end with the IDs of the server, Moderator, King, `#onboarding`, `#neil-log` and the guides forum
  under their setting names; the steps left by hand (Neil's role position, Moderator and King above Neil, Integrations per
  SERVER-SETUP section 5, Community, intents); and the reminder to take Administrator off Neil.
- **FR-013**: Neil MUST name Alliance roles `[TAG]`, and a permission-free plain `TAG` role MUST become `[TAG]` with its holders.
- **FR-014**: The script MUST need only the bot token, the server's ID and the Home Kingdom, because the other IDs don't exist
  yet on a new server. It MUST NOT log the token.
- **FR-015**: The shipped layout MUST hold the Server Layout of SERVER-SETUP section 3, all 17 languages, and the AD and KvK
  groups.
- **FR-016**: Running Neil MUST gain no channel rights: nothing outside the script changes channels or overwrites.

### Key Entities

- **Server Layout** (DICTIONARY): here the file: roles, categories, channels and overwrites, with `#<Home Kingdom>` standing for
  the Kingdom role.
- **Setup plan**: what the script would do: creations, corrections, and findings it only reports.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On an empty test server, one real run plus the hand steps in its report gives a server Neil starts on.
- **SC-002**: A second run reports nothing to do, every time.
- **SC-003**: A dry run makes no change to the server, in every test.
- **SC-004**: No overwrite or channel outside the layout is changed by any run.
- **SC-005**: STARTUP-GUIDE.md's steps for roles, channels and the Server Layout shrink to running the script.

## Assumptions

- The owner edits the layout's names to match an existing server; the script matches by exact name, not by ID.
- Moderator and King are created permission-free when missing; the owner gives them what they need.
- Channel names not fixed by SERVER-SETUP are chosen in the shipped layout, and the owner may rename them there.
- KvK's five tactical voice channels come on top of its general voice channel.
- New channels follow the layout's order; existing ones aren't reordered.
- The Daily Sync has run after slices 020, 021 and 022 are deployed, before the real run on the live server: Preference channels
  are closed to Guests only then, and only then do Alliance roles carry brackets.
