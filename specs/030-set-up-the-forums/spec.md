# Feature Specification: Set up the forums

**Feature Branch**: `030-set-up-the-forums`

**Created**: 2026-11-07

**Status**: Draft

**Input**: After the setup script's runs on the test server (2026-11-07), the five forums (`guides`, `nap-forum`,
`pvp-tactics`, `ad-tactics`, `kvk-tactics`) exist and have their guidelines (the topic, slice 029). Discord's
getting-started checklist is still open for each: no recommended permissions, no tags, no default reaction, no first post.
The user's decisions:

1. **Tags** per forum, kept in the layout file and editable there:
   - `guides`: Beginner, Events, PvP, Heroes, Economy, Alliance Duel, KvK
   - `nap-forum`: Question, Proposal, Agreement, Violation
   - `pvp-tactics`: Rally, Defense, Scouting, Troops, Lessons learned
   - `ad-tactics`: Plan, Schedule, Points, Lessons learned
   - `kvk-tactics`: Plan, Squads, Targets, Defense, Lessons learned
2. **Default reaction** per forum: 📚 `guides`, 🤝 `nap-forum`, ⚔️ the three tactics forums.
3. **First post**: Neil opens one pinned post per forum, "How to post in #<forum>": what belongs there, which tags to pick,
   and a short template to copy. The setup keeps it up to date like the channel descriptions.
4. **Recommended permissions** for every forum, as Discord's checklist step sets them.

Not live yet: no backwards compatibility.

## Clarifications

### Session 2026-11-07

- Q: Which tags? → A: the draft per forum above.
- Q: Which default reaction? → A: per forum: 📚 guides, 🤝 nap-forum, ⚔️ the tactics forums.
- Q: What is the first post? → A: "How to post here", pinned, by Neil: what belongs there, the tags, a template.
- Q: Which permissions are missing? → A: whatever Discord's "Set recommended permissions" step sets, for all five forums.
  Measured on the test server's `pvp-tactics`: the step adds **Send Messages (Create Posts) ❌ for @everyone** and nothing
  else.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The owner gets finished forums from the setup (Priority: P1)

The owner runs the setup script, and every forum comes out ready: recommended permissions, its tags, its default reaction,
and Neil's pinned how-to post. Discord's getting-started checklist shows nothing left to do.

**Why this priority**: the forums are the only channels the setup leaves half done. Without this, the owner finishes five
forums by hand on every server.

**Independent Test**: automated against an in-memory server: the plan for an empty server lists the tags, reaction,
permission and post for each forum, and a second run plans nothing. Manual: a real run on the test server, then the
checklist of each forum.

**Acceptance Scenarios**:

1. **Given** a forum without tags, **When** the owner runs the script, **Then** the forum offers exactly the layout's tags,
   in the layout's order.
2. **Given** a forum without a default reaction, **When** the owner runs the script, **Then** each new post shows the
   forum's reaction.
3. **Given** a forum, **When** the owner runs the script, **Then** @everyone may not create posts there, and the roles the
   layout lets post still can.
4. **Given** a forum without Neil's how-to post, **When** the owner runs the script, **Then** Neil opens "How to post in
   #<forum>" with what belongs there, the tags and a template, and pins it to the top.
5. **Given** all of the above in place, **When** the owner runs the script again, **Then** it reports nothing to do for
   the forums.
6. **Given** the five forums after a real run, **When** the owner opens each one, **Then** Discord's getting-started
   checklist has no open step.

---

### User Story 2 - The owner changes a forum in the layout file (Priority: P2)

The owner adds, renames or removes a tag, changes a reaction, or rewords the how-to text in the layout file, and runs the
script again.

**Why this priority**: the forums will change as the Kingdom uses them. Editing a file beats clicking through five forums.

**Independent Test**: automated: change one forum's entry, plan against a server built from the old entry, and check the
planned change and that nothing else changes.

**Acceptance Scenarios**:

1. **Given** a forum whose tags differ from the layout, **When** the owner runs the script, **Then** the missing tags are
   added, and tags the layout no longer names are reported and left in place. Tags already on posts keep working.
2. **Given** a forum whose reaction differs, **When** the owner runs the script, **Then** the reaction is changed.
3. **Given** Neil's how-to post with different text, **When** the owner runs the script, **Then** Neil edits that post, and
   no second post appears.
4. **Given** Neil's how-to post was deleted, **When** the owner runs the script, **Then** Neil opens and pins it again.

---

### User Story 3 - A Member posts the way the forum expects (Priority: P2)

A Member opens a forum, reads the pinned how-to post first, and creates a post with a fitting title, one or two tags, and
the template filled in.

**Why this priority**: this is why the how-to post exists, and it needs the parts above in place.

**Independent Test**: manual on the test server: a Member with the forum's role creates a post using the template and a
tag.

**Acceptance Scenarios**:

1. **Given** a Member who sees a forum, **When** they open it, **Then** Neil's how-to post is at the top.
2. **Given** a Member who may post in the forum, **When** they create a post, **Then** they can pick the forum's tags.
3. **Given** a Member who sees `guides` but is no Veteran, **When** they try to create a post, **Then** they can't.

### Edge Cases

- A forum already has a pinned post that isn't Neil's: Discord pins one post per forum. The script reports it and leaves
  that post alone; Neil's post is created but not pinned.
- A tag name longer than Discord allows, more tags than Discord allows, a tag named twice, or a reaction that isn't a single
  emoji: the layout file is refused at load, before anything changes.
- A dry run without Administrator: Neil can't see most forums' posts. The script says it can't check them, as with the
  descriptions in slice 029; the real run checks them.
- Neil's how-to post is archived after a week without activity: the script still finds it and doesn't open a second one.
- A forum built as a text channel: it gets no tags, reaction or post, and is reported as the wrong type, as today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each forum in the layout file MUST carry its tags (ordered), its default reaction, and its how-to text (what
  belongs there, an example title, a template). The shipped file MUST hold the tags and reactions decided above and the
  how-to texts of [how-to-posts.md](how-to-posts.md).
- **FR-002**: The layout file MUST be refused at load when a forum lacks these, breaks Discord's limits (tag count, tag name
  length, post title and message length), names a tag twice, or has a reaction that isn't one emoji.
- **FR-003**: The script MUST deny @everyone Send Messages on every forum, besides View Channel. The roles that see or post
  in the forum keep what the layout grants them.
- **FR-004**: The script MUST give each forum the layout's tags: add missing ones, keep the ones present, and report (not
  remove) tags the layout doesn't name.
- **FR-005**: The script MUST set each forum's default reaction to the layout's emoji when it differs.
- **FR-006**: The script MUST open one post by Neil per forum, titled "How to post in #<forum>", built from the forum's
  how-to text and tags, and pin it to the top of the forum.
- **FR-007**: On a later run, the script MUST find Neil's post (also when archived), edit it when its text differs, and open
  and pin it again only when it is gone. It MUST leave other posts alone.
- **FR-008**: The dry run MUST list each tag, reaction, permission and post it would set or change; the real run reports
  what it did. A second real run MUST report nothing to do.
- **FR-009**: SERVER-SETUP.md and the guides MUST describe the forums' tags, reactions and how-to posts, and say that they
  are changed in the layout file.

### Key Entities

- **Forum Setup**: the part of a forum's layout entry beyond its description: tags, default reaction, how-to text.
- **How-to Post**: Neil's pinned first post in a forum. Built from the Forum Setup and kept in step by the script.
- **Forum Tag**: a label a Member picks for a post, defined per forum in the layout.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After one real run, all five forums show a completed getting-started checklist, with no step done by hand.
- **SC-002**: A second real run reports nothing to do.
- **SC-003**: Each forum shows exactly one pinned how-to post from Neil, at the top.
- **SC-004**: A Member can create a correctly titled, tagged post by following the how-to post alone.

## Assumptions

- Texts are in English, like Neil's other texts.
- The tags are not moderated (any poster can apply them), and posts don't require a tag; the user asked for neither.
- The how-to post carries no tag.
- The setup script runs with Neil's token, so Neil authors the how-to posts and recognises them as its own, as with the
  descriptions.
- Removing tags is left to the owner, because a tag may be on existing posts.
- The forum's layout view and sort order stay at Discord's defaults.
