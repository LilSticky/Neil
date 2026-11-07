# Feature Specification: Rework the Server Layout

**Feature Branch**: `029-rework-the-server-layout`

**Created**: 2026-11-07

**Status**: Draft

**Input**: The user's feedback on the Server Layout, after the setup script's first real run on the empty test server
(2026-11-07):

1. The Guest area and Alliance Duel need no announcement channel of their own.
2. Every channel starts with a description of what it is for and who has access.
3. `#rules` and `#guest-rules` hold a basic code of conduct.
4. Recruitment has two channels: Players looking for an Alliance, and Alliances looking for Players.
5. KvK announcements get translated copies for Russian, French, Italian and German, besides the default English.
6. NaP announcements get the same translated copies.
7. Events has a voice channel for coaching.
8. Home Kingdom, Hangout and Off-topic become one category, Hangout; off-topic and memes stay opt-in.

Not live yet: no backwards compatibility. The test server can be emptied again before the next run.

## Clarifications

### Session 2026-11-07

- Q: Regional recruitment channels? → A: dropped. Recruitment holds two channels instead: Players looking for an Alliance,
  and Alliances looking for Players.
- Q: Translated announcements, which shape? → A: one channel per Language, only Russian, French, Italian and German; the
  existing announcement channel stays the English one.
- Q: Where does a channel's description go? → A: both: a short channel topic, and a pinned first message posted by Neil.
- Q: The merged category? → A: named **Hangout**, seen by the Home Kingdom; off-topic and memes inside it are still shown
  only with the Off-topic Preference Role.
- Q: The code of conduct? → A: the draft in [code-of-conduct.md](code-of-conduct.md), as written.
- Q: Who sees the translated announcement channels? → A: announcements reach every Home Kingdom Member: the announcement
  channels (Home Kingdom, NaP, Events, KvK) are seen by `#<Home Kingdom>` whatever category they sit in, and each translated
  copy is seen by its Language's Preference Role.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The owner builds the reworked layout (Priority: P1)

The owner runs the setup script on an empty server and gets the reworked Server Layout: no Guest or AD announcements, one
Hangout category in place of three, two Recruitment channels, a coaching voice channel in Events, and the translated KvK and
NaP announcement channels.

**Why this priority**: the layout itself is what the user reviewed; the texts build on it.

**Independent Test**: automated: the shipped layout file loads, and the plan for an empty server lists exactly the
reworked categories and channels. Manual: a real run on the emptied test server.

**Acceptance Scenarios**:

1. **Given** an empty server, **When** the owner runs the script, **Then** there is no `guest-announcements` and no
   `ad-announcements` channel.
2. **Given** an empty server, **When** the owner runs the script, **Then** one category **Hangout** holds
   `home-kingdom-announcements`, `gift-codes`, `general`, `Hangout voice`, `alliance-hall`, `off-topic` and `memes`, and no
   Home Kingdom or Off-topic category exists.
3. **Given** a Home Kingdom Member without the Off-topic Preference Role, **When** they look at Hangout, **Then** they don't
   see `off-topic` or `memes`; with the role, they do.
4. **Given** an empty server, **When** the owner runs the script, **Then** Recruitment holds `looking-for-alliance` and
   `looking-for-players` and no `recruitment` channel.
5. **Given** an empty server, **When** the owner runs the script, **Then** Events holds a voice channel `Coaching voice`.
6. **Given** an empty server, **When** the owner runs the script, **Then** Kingdom vs Kingdom holds
   `kvk-announcements-russian`, `-french`, `-italian` and `-german` next to `kvk-announcements`, and NaP holds the same four
   next to `nap-announcements`.
7. **Given** a translated announcement channel, **When** anyone but King or Interaction Bot tries to post, **Then** they
   can't; Interaction Bot can.
8. **Given** a Home Kingdom Member without PvP or Events, **When** they look at the server, **Then** they see
   `kvk-announcements` and `event-announcements`, and none of the other KvK or Events channels.
9. **Given** a Home Kingdom Member with the German Preference Role only, **When** they look at the server, **Then** they see
   `kvk-announcements-german` and `nap-announcements-german`, and no other translated copy.

---

### User Story 2 - A Member sees what a channel is for (Priority: P1)

A Member opens any channel and reads, at the top, what the channel is for and who can see it.

**Why this priority**: the user's main point; without it, a Member has to guess in more than 60 channels.

**Independent Test**: automated: every layout channel has a purpose text, and the plan topics and messages carry it with an
access line built from the layout. Manual: open channels on the test server.

**Acceptance Scenarios**:

1. **Given** a text, announcement or forum channel of the layout, **When** the script has run, **Then** its topic states
   what it is for.
2. **Given** a text, announcement or voice channel of the layout, **When** the script has run, **Then** it holds one pinned
   message from Neil that states what it is for, who sees it and who can post.
3. **Given** the description in the layout file changes, **When** the script runs again, **Then** it corrects the topic and
   edits the pinned message, without posting a second one.
4. **Given** the description already matches, **When** the script runs again, **Then** it changes nothing.
5. **Given** a dry run, **When** the script would set a topic or post a message, **Then** the report lists it and nothing
   changes.

---

### User Story 3 - The rules are already there (Priority: P2)

A Member opens `#rules`, a Guest opens `#guest-rules`, and each finds a basic code of conduct.

**Why this priority**: the owner would otherwise write it by hand on every server; a missing text doesn't break anything.

**Independent Test**: automated: the plan for `#rules` and `#guest-rules` holds the approved code of conduct. Manual: read
both channels.

**Acceptance Scenarios**:

1. **Given** the script has run, **When** a Home Kingdom Member opens `#rules`, **Then** they read the code of conduct below
   the description.
2. **Given** the script has run, **When** a Guest opens `#guest-rules`, **Then** they read the Guest code of conduct.
3. **Given** an owner has changed the code of conduct in the layout file, **When** the script runs again, **Then** the
   message shows the new text.

### Edge Cases

- A text is longer than Discord allows (topic 1024 characters, message 2000): the layout file is refused at load, naming the
  channel.
- Someone deleted or unpinned Neil's message: the next run posts and pins it again.
- Someone else pinned messages in the channel: they are left alone; only Neil's own description message is edited.
- A channel that exists already but is outside the layout: no text is set, it is only reported, as today.
- Voice channels have no topic: they get the pinned message only.
- Forums hold posts, not messages: they get the topic (shown as post guidelines) only.
- Without Community, forums and announcement channels become text channels: they get topic and message like any text
  channel.
- Alliance areas (`[TAG]`): their channels get a description too, naming the Alliance.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The shipped Server Layout MUST NOT hold `guest-announcements` or `ad-announcements`.
- **FR-002**: The shipped Server Layout MUST hold one category **Hangout**, seen by `#<Home Kingdom>`, with
  `home-kingdom-announcements` (only King posts), `gift-codes` (as today), `general`, `Hangout voice`, `alliance-hall`,
  `off-topic` and `memes`; `off-topic` and `memes` MUST be seen only with the Off-topic Preference Role. The Home Kingdom and
  Off-topic categories MUST be gone.
- **FR-003**: Recruitment MUST hold two text channels, `looking-for-alliance` and `looking-for-players`, seen by the
  Recruitment Preference Role, in place of `recruitment`.
- **FR-004**: Events MUST hold a voice channel `Coaching voice`.
- **FR-005**: Kingdom vs Kingdom and NaP MUST each hold one translated announcement channel per translation Language:
  Russian, French, Italian and German, named `<announcements>-<language>`. Only King and Interaction Bot post there. Each
  copy MUST be seen only with its Language's Preference Role.
- **FR-005a**: `home-kingdom-announcements`, `nap-announcements`, `event-announcements` and `kvk-announcements` MUST be seen
  by `#<Home Kingdom>`, whichever role the rest of their category needs.
- **FR-006**: The Layout MUST let the owner set the translation Languages in one place, separately from the chat Languages.
- **FR-007**: Every layout channel MUST carry a purpose text in the layout file; the file MUST be refused at load when one is
  missing or too long.
- **FR-008**: The script MUST set each text, announcement and forum channel's topic to its purpose text.
- **FR-009**: The script MUST post one message in each text, announcement and voice channel and pin it: the purpose text, then
  who sees the channel and who can post there, built from the layout's permissions so it can't drift from them.
- **FR-010**: On a later run, the script MUST edit its own message when the text differs, post and pin it again when it is
  gone, and leave other messages alone.
- **FR-011**: `#rules` and `#guest-rules` MUST carry a code of conduct in the layout file, shown in their pinned message
  below the description.
- **FR-012**: The dry run MUST list every topic and message it would set or change; the real run reports what it did.
- **FR-013**: The reference documents (SERVER-SETUP.md section 3, the guides, the Dictionary entries that name categories)
  MUST match the new layout.

### Key Entities

- **Channel Description**: a layout channel's purpose text, plus an access line built from the layout. Shown as topic and as
  Neil's pinned message.
- **Code of Conduct**: the rules text for `#rules` (Home Kingdom) and `#guest-rules` (Guests), held in the layout file.
- **Translation Language**: a Language that gets its own copy of the translated announcement channels. A subset of the
  Languages.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the emptied test server, one real run builds the reworked layout, and a second run reports nothing to do.
- **SC-002**: Every text, announcement and voice channel of the layout shows exactly one pinned description from Neil.
- **SC-003**: A Member who opens any channel can say what it is for and who sees it, without asking an Officer.
- **SC-004**: `#rules` and `#guest-rules` show the code of conduct without anyone typing it.

## Assumptions

- Texts are in English, like Neil's other texts; Interaction Bot does the translating in the translated channels.
- A Language's Preference Role is held only by Home Kingdom Members (slice 021), so translated copies stay inside the Home
  Kingdom.
- The setup script runs with Neil's token, so Neil is the author of the pinned messages and recognises them as its own.
- The script remains the owner's tool; Neil at runtime does not set topics or post descriptions.
- Removing channels is outside the script: on the test server, the owner empties the server again before the run.
- Channel names: `looking-for-alliance`, `looking-for-players`, `Coaching voice`, `kvk-announcements-<language>`,
  `nap-announcements-<language>`, with the Language in lower case.
