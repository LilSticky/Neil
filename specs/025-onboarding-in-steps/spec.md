# Feature Specification: Onboarding in steps

**Feature Branch**: `025-onboarding-in-steps`

**Created**: 2026-11-06

**Status**: Draft

**Input**: The user: "make the onboarding a little more verbose with explanations and flair. do it in steps instead of all at
once. Most important after linking is language and interests", and "make sure the interview is complete or timed out before closing
it, even after the link is done". Depends on slice 024 settling how a Member keeps sight of the thread after the Link (#66): no
Preferences code changes before it merges.

## Clarifications

### Session 2026-11-06

- Q: In what order are the Preferences asked? → A: Languages, Interests, Region, Experience, one step at a time. Every step
  explains itself and can be skipped; the last two say they are optional.
- Q: How does a Member reach the steps right after the Link? → A: in the Interview thread, which stays open after the Link until the
  Member finishes or the Interview times out. No private message button is needed. `/channels` starts the same steps later.
- Q: What voice do the texts have? → A: Neil is a Liaison in the alliance hall, not a doctor. Warm and clear, a light theme and
  some emoji; instructions stay plain.
- Q: Do the texts before the Link change too? → A: yes, the whole onboarding, keeping the Interview's steps. Error messages stay
  short.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Member chooses Languages and Interests first (Priority: P1)

A Home Kingdom Member has just been Linked. The Interview thread stays open, and Neil asks one question at a time, Languages first
and Interests second, each saying what the choice does.

**Why this priority**: Languages and Interests decide most of what a Member sees, and four menus at once hide that.

**Independent Test**: automated: the Link posts the Languages step in the thread; moving on shows Interests, Region and Experience
in that order, only one menu is ever shown, and the thread is not closed before Done or the timeout.

**Acceptance Scenarios**:

1. **Given** a Home Kingdom Member at their Link, **When** the Link is made, **Then** the Interview thread stays open and Neil posts
   the Languages step there, with their game Language already chosen when Neil knows it.
2. **Given** an open thread after the Link, **When** the Member finishes the last step, **Then** the thread closes, unless a Rank
   Approval waits.
3. **Given** an open thread after the Link, **When** the Interview timeout passes, **Then** the thread closes, and the answers
   already given stand.
4. **Given** any step, **When** it is shown, **Then** it shows one menu, says what the choice does and which step of four it is.
5. **Given** the Languages step, **When** the Member moves on, **Then** the Interests step follows, explaining each Interest they
   are offered.
6. **Given** a step, **When** the Member changes the menu, **Then** the answer is saved and its Preference Roles change at once,
   and the same step stays on screen.
7. **Given** a Member Linked to an R5, **When** the Interests step is shown, **Then** it does not offer NaP discussions; an R4 is
   offered them, as today.

---

### User Story 2 - A Member skips, goes back and finishes (Priority: P2)

A Member wants to answer only what matters to them. Any step can be skipped, an earlier step can be changed, and the last step ends
with a message saying what happens next.

**Why this priority**: Preferences are optional, and steps must not make them feel required.

**Independent Test**: automated: Skip keeps the stored answer and moves on; Back returns to the step before; Done on the last step
shows the finishing message with no menus left.

**Acceptance Scenarios**:

1. **Given** a step, **When** the Member skips it, **Then** the next step is shown and nothing is changed.
2. **Given** the Region or Experience step, **When** it is shown, **Then** it says it is optional.
3. **Given** any step but the first, **When** the Member goes back, **Then** the step before is shown with their answers.
4. **Given** the Experience step, **When** the Member finishes, **Then** a finishing message says their choices are saved, that
   `/channels` changes them, and gives the guides line for a New or Veteran Member.

---

### User Story 3 - A Member changes their choices with /channels (Priority: P2)

A Linked Home Kingdom Member runs `/channels`. They get the same steps, privately, with their stored answers already chosen.

**Why this priority**: it is the only way to change answers after the thread closes, and the only way in after an Officer Link.

**Independent Test**: automated: `/channels` answers with the Languages step, privately, showing stored answers.

**Acceptance Scenarios**:

1. **Given** a Linked Home Kingdom Member, **When** they run `/channels`, **Then** they privately see the Languages step with their
   stored answers.
2. **Given** a Guest, **When** they run `/channels` or press a step, **Then** they are refused privately, as today.
3. **Given** a Member who is not Linked, **When** they run `/channels` or press an old button, **Then** they are told to finish
   onboarding, as today.

---

### User Story 4 - The Interview explains itself (Priority: P3)

A newcomer meets Neil in the Interview thread. The welcome says who Neil is, why the uid is needed and what happens after it. The
Interview's steps are unchanged.

**Why this priority**: it is wording only, and the Interview already works.

**Independent Test**: automated: the welcome, uid help, recommendation, found card and Linked messages carry the new explanations;
the buttons and the pings are unchanged.

**Acceptance Scenarios**:

1. **Given** a Member starting an Interview, **When** the welcome is posted, **Then** it introduces Neil as the alliance hall's
   Liaison, says why the uid is needed, and says what comes after it.
2. **Given** a Recommended Player or a found Player, **When** Neil asks "Is this you?", **Then** it says what confirming does.
3. **Given** a new Link, **When** the Linked message is posted, **Then** it says what Neil is setting up. It says nothing of
   Preferences, because a Guest gets none; the Languages step explains them.
4. **Given** a wrong uid, a refused Link or an outage, **When** Neil answers, **Then** the message stays as short as today.

### Edge Cases

- A Guest at their Link: no steps, and the thread closes at the Link as today.
- An Officer Link: no thread, so the Member is told privately to run `/channels`, with no Language preselected.
- The Member leaves or is Unlinked while the thread is open: the thread closes as today.
- A Rank Approval pending when the Member finishes or times out: the thread stays for it, as today.
- A step pressed after becoming a Guest or being Unlinked: refused as in User Story 3, nothing is changed.
- An old step pressed: it acts on the stored answers and shows that step; no state goes stale.
- Someone else's press in the thread: refused as today.
- A Member Linked to an R5 keeps NaP discussions by rank, whatever they answer in the steps.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Neil MUST ask Preferences one step at a time, in this order: Languages, Interests, Region, Experience.
- **FR-002**: Each step MUST show one menu, explain what the choice does, and show its place among the four steps.
- **FR-003**: The Interests step MUST explain each Interest it offers; who is offered which Interest does not change.
- **FR-004**: Every step MUST be skippable without changing the stored answer; Region and Experience MUST say they are optional.
- **FR-005**: Every step but the first MUST allow going back.
- **FR-006**: A menu change MUST save and apply at once and log as today, and the same step stays shown.
- **FR-007**: The last step MUST end in a finishing message that names `/channels` and gives the guides line, with no menus left.
- **FR-008**: After an Interview's Link of a Home Kingdom Member, the thread MUST stay open and show the Languages step.
- **FR-009**: `/channels` MUST start the same steps, privately, showing stored answers.
- **FR-010**: The thread MUST close only when the Member finishes the steps or the Interview times out, unless the Member is a Guest,
  leaves or is Unlinked, and a pending Rank Approval still keeps it open.
- **FR-011**: Guests and Members who are not Linked MUST be refused as today, on `/channels` and on every press.
- **FR-012**: The Interview's welcome, uid help, Recommended Player, pick list, found card and Linked messages MUST explain what
  happens and why, in Neil's voice, keeping their buttons and pings.
- **FR-013**: Neil's voice MUST be a Liaison in the alliance hall: warm, clear, a light theme, some emoji, plain instructions. Neil
  MUST NOT call itself a doctor.
- **FR-014**: Error messages, refusals and log lines MUST stay as they are.
- **FR-015**: Every text MUST fit Discord's limits, and use dictionary terms.
- **FR-016**: The Recruitment category MUST hold one channel per Region beside the general one, all seen by the `Recruitment` role
  (the user's decision; Discord cannot require a Region as well). On 2026-11-07 the user chose this set over slice 029's
  `looking-for-alliance` and `looking-for-players`, which it replaces.
- **FR-017**: The Server Layout MUST hold `#news` (read only, seen by everyone, fed by a Follow of the game's official server) in
  Basic information and `#suggestions` in Hangout, each with a description (the user's decisions, kept on 2026-11-07).

### Key Entities

- **Preference step**: one of the four questions a Member answers in turn. Holds no stored state: the stored Preferences are the
  only record, so nothing needs a migration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Member sees the Languages step at the Link with no press, and the Interests step with one press.
- **SC-002**: No step shows more than one menu.
- **SC-003**: A Member can leave all four steps without answering in four presses, and nothing is stored or changed by them.
- **SC-004**: Every step, and every Interview text in FR-012, says what happens next or what the choice does, checked by test.
- **SC-005**: Every Member-facing text stays within Discord's limits, checked by test.

## Assumptions

- Slice 024 is corrected and merged first: a Member keeps sight of the Interview thread until it closes.
- A Member leaving steps unfinished times out as the Preferences message does today: every answer is already saved.
- "Liaison" is a voice, not a domain term, so the dictionary does not change. A new term needs the user's approval.
- No migration, no new command, and no change to who gets which role.
