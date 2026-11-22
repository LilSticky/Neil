# Feature Specification: Forward feedback

**Feature Branch**: `047-forward-feedback`

**Created**: 2026-11-22

**Status**: Draft

**Input**: User description: "Slice 047, Forward feedback. On the production #330 server, Members post in #suggestions and #feedback. Neil forwards each new Feedback Post to #neil-log: channel, the Member's server nickname, the text, attachments as links, and a jump link, mentions off. Once forwarded, Neil reacts 📝. A failure to forward leaves no reaction. The setup script adds #feedback beside #suggestions, seen by everyone. Edits and deletes are not forwarded. User decisions (2026-11-21, ADR 29): #neil-log only, Member named in #neil-log, reaction 📝; new term Feedback Post." Later (2026-11-22): "any feedback is filtered by me before it reaches you. Discard anything that doesn't follow the template you lay out."

Context: [ADR 29](../../documentation/adr/0029-feedback-from-the-real-server-replaces-manual-checks.md) and
[FEEDBACK.md](../../documentation/FEEDBACK.md) (the Feedback Template). Feedback from real use on the #330 server replaces
manual checks; the user filters it, and sessions act only on what follows the template.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Member's feedback reaches the log (Priority: P1)

A Member posts a bug report or an idea in `#feedback` or `#suggestions`. Neil copies it into `#neil-log` with who wrote
it, where, and a link back, so all feedback is in one place for the user to filter.

**Why this priority**: Without it, feedback has to be collected by hand; it is the whole point of the slice.

**Independent Test**: Post a message in `#feedback` as a Member; a `#neil-log` entry appears with the channel, the
Member's server nickname, the text and a link to the post.

**Acceptance Scenarios**:

1. **Given** a Member, **When** they post in `#feedback`, **Then** `#neil-log` gets one entry naming `#feedback`, the
   Member's server nickname, the text and a jump link to the post.
2. **Given** a Member, **When** they post in `#suggestions`, **Then** the same happens, naming `#suggestions`.
3. **Given** a post with two attached screenshots, **When** it is forwarded, **Then** the entry lists both as links.
4. **Given** a post that mentions a Member, a role or @everyone, **When** it is forwarded, **Then** the entry pings nobody.
5. **Given** a post longer than one Discord message allows, **When** it is forwarded, **Then** the full text reaches
   `#neil-log`, split over several messages that read as one entry.
6. **Given** a post that does not follow the Feedback Template, **When** it is posted, **Then** it is forwarded all the
   same; the filtering is the user's.

---

### User Story 2 - Members know how to give feedback (Priority: P2)

Neil keeps the Feedback Template pinned in `#feedback` and `#suggestions`, so Members write feedback that can be used.

**Why this priority**: Feedback outside the template is discarded, so Members need to see it.

**Independent Test**: After startup, both channels have Neil's pinned template; after it is unpinned or deleted, the next
startup pins it again.

**Acceptance Scenarios**:

1. **Given** Neil starts, **When** a feedback channel has no pinned template from Neil, **Then** Neil posts and pins it.
2. **Given** the template is pinned, **When** Neil starts again, **Then** nothing changes.
3. **Given** Neil's template post is not forwarded and gets no reaction.

---

### User Story 3 - The Member sees it was picked up (Priority: P2)

Once Neil has forwarded a post, it reacts with 📝, so the Member knows it was received without chatter in the channel.

**Independent Test**: After a post is forwarded, it carries Neil's 📝 reaction.

**Acceptance Scenarios**:

1. **Given** a post was forwarded, **Then** Neil has reacted 📝 to it.
2. **Given** forwarding failed (for example `#neil-log` is missing or Neil may not post there), **Then** Neil does not
   react and posts nothing in the channel.

---

### User Story 4 - The server has a feedback channel (Priority: P3)

The setup script creates `#feedback` beside `#suggestions` in the Hangout category, seen by everyone.

**Independent Test**: Run the setup script on a server without `#feedback`; it creates it next to `#suggestions`, and a
second run changes nothing.

**Acceptance Scenarios**:

1. **Given** a server without `#feedback`, **When** the setup script runs, **Then** `#feedback` exists in the Hangout
   category beside `#suggestions`, every Member can read and post there, and Neil can read, post, pin and react.
2. **Given** `#feedback` already exists, **When** the script runs again, **Then** nothing changes.

### Edge Cases

- A post by a bot, a webhook or Neil itself, or a system message (pin, thread created): not forwarded, no reaction.
- A post in a thread under `#feedback` or `#suggestions`: forwarded the same way, naming the thread and its channel.
- A post that is only attachments, a sticker or an embed with no text: forwarded, the entry says there is no text and
  lists what it has.
- A post edited or deleted later: the entry is not changed; edits and deletes are not forwarded.
- Neil restarts: posts made while it was offline are not forwarded (no catching up).
- The Member has no server nickname: their Discord display name is used.
- Several posts at once: each gets its own entry, in the order they were posted.
- Neil may not add reactions: the entry is still forwarded, and the missing reaction writes one `#neil-log` line.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Neil MUST forward every new **Feedback Post**, a message a Member (not a bot, webhook or system) posts in
  `#suggestions` or `#feedback` or a thread under them, to `#neil-log`, whether or not it follows the Feedback Template.
- **FR-002**: Each entry MUST name the channel (and thread, if any), the Member by server nickname (else display name),
  the full text, every attachment as a link, and a jump link to the post.
- **FR-003**: Entries MUST ping nobody: user, role, @everyone and @here mentions are shown but do not notify.
- **FR-004**: Text beyond one message's limit MUST be split over several consecutive messages, at line breaks where
  possible; nothing is cut off.
- **FR-005**: After the entry is posted, Neil MUST react 📝 to the post; if the entry could not be posted, Neil MUST NOT
  react and MUST NOT post anything in the feedback channel.
- **FR-006**: Edits and deletes of a Feedback Post MUST NOT be forwarded; posts made while Neil was offline MUST NOT be
  forwarded later.
- **FR-007**: At startup Neil MUST make sure each feedback channel has its pinned Feedback Template (the text in
  FEEDBACK.md), posting and pinning it if missing, and changing nothing if present.
- **FR-008**: The setup script MUST create `#feedback` in the Hangout category beside `#suggestions`, readable and
  writable by everyone, with Neil allowed to read, post, pin and add reactions; running it again changes nothing.
- **FR-009**: Neil MUST make no Game API requests and store nothing new about a Feedback Post.
- **FR-010**: The Member's name MUST appear only in `#neil-log` (ADR 29); no place outside Discord receives it.

### Key Entities

- **Feedback Post**: a message a Member posts in `#suggestions` or `#feedback`; forwarded once to `#neil-log` and marked
  with 📝. Not stored by Neil.
- **Feedback Template**: the fixed form a Feedback Post must follow to be acted on (`Type`, `Where`, `What happened` and
  `Expected` for a Bug, `What` for an Idea, optional `Steps`). Pinned by Neil; defined in FEEDBACK.md.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every Feedback Post appears in `#neil-log` within 10 seconds of being posted while Neil is online.
- **SC-002**: 100% of forwarded posts carry the 📝 reaction; no post without an entry carries it.
- **SC-003**: No forwarded entry ever sends a notification to anyone.
- **SC-004**: Both feedback channels show the pinned Feedback Template at all times after Neil's startup.

## Assumptions

- Reading what Members write needs Discord's message-content access for Neil, a privileged setting the user turns on in
  the Developer Portal for production Neil and Neil Test; the plan confirms the exact intents.
- `#neil-log` exists on every server Neil runs on; `#suggestions` exists from slice 029's layout change.
- Channels are found by name, like the other Server Layout channels.
- Neil does not check the template; the user filters and sessions discard what does not follow it (FEEDBACK.md).
- Filing GitHub Issues stays with the sessions (ADR 29); Neil does not talk to GitHub.
- The terms **Feedback Post** (approved 2026-11-21) and **Feedback Template** (from the user's instruction of 2026-11-22)
  are added to DICTIONARY.md in this slice.
