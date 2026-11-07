# Feature Specification: Be reminded of events

**Feature Branch**: `028-be-reminded-of-events`

**Created**: 2026-11-07

**Status**: Draft

**Input**: ROADMAP "Later": "Neil keeps Discord events for in-game events, and opt-in Members are invited, reminded, reminded to sign up, and given the event's guides." Discovery and the user's answers: [discovery/028](../../documentation/discovery/028-be-reminded-of-events.md), section 6.

## Clarifications

### Session 2026-11-07

- Q: Where do Events come from? → A: an Officer, or an Alliance's R4 or R5, creates the Discord scheduled event by hand. Neil picks it up and creates no events itself.
- Q: Whose Events? → A: both Kingdom Events and Alliance Events, in this slice. An Alliance Event carries the Alliance's tag in brackets in its name, e.g. "[NML] Hive move".
- Q: What is a Sign-up? → A: registration in the game before a deadline. Clicking Interested on the Discord event is how a Member asks to be reminded.
- Q: Who is invited? → A: for a Kingdom Event, holders of the `Events` role; for an Alliance Event, every holder of that Alliance's role. A Member can switch invitations off with a command. That stops only invitation mentions, not reminders.
- Q: When do reminders go out? → A: at lead times set per Event Kind. An Alliance's R4 or R5 sets its Alliance's Event Kinds, and Officers (King, Moderator) set the kingdom's. With no matching kind, one reminder goes out 30 minutes before the start.
- Q: How is an Event's kind found? → A: by the kind's name appearing in the Discord event's name, within that Event's own list.
- Q: When does the Sign-up close? → A: at a fixed offset per Event Kind before the start.
- Q: What are the guides? → A: the links the creator writes into the Discord event's description.
- Q: Guests? → A: no Event Reminders for Kingdom Events. Event Invitations Off is forgotten at Unlink.
- Q: Should Neil check who created an Event, since Discord's Create Events right covers the whole server? → A: yes. An Alliance Event needs a creator Linked as that Alliance's R4 or R5, or an Officer; a Kingdom Event needs an Officer. Otherwise Neil posts nothing and logs it.
- Q: What happens to a reminder that was due while Neil was off? → A: it is sent once, late, if the Event hasn't started; dropped if it has.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Members are invited to a new Event (Priority: P1)

An Officer creates a Discord scheduled event "AD round 3". Neil posts an Event Invitation in `#event-announcements`: the name, the start in each reader's own time, the guide links from the description, and a link to the Discord event. It mentions the `Events` role holders one by one. An R5 of NML creates "[NML] Hive move", and Neil posts the Event Invitation in NML's `alliance-chat`, mentioning NML's members.

**Why this priority**: without it, nobody hears of an Event.

**Independent Test**: automated: a new Discord event with no tag gives one card in `#event-announcements` that mentions the `Events` holders; one with `[NML]` gives one card in NML's `alliance-chat` that mentions NML's role holders.

**Acceptance Scenarios**:

1. **Given** a Discord scheduled event without an Alliance tag is created, **When** Neil sees it, **Then** it posts one Event Invitation in `#event-announcements` that mentions each holder of `Events` who does not have Event Invitations Off.
2. **Given** a Discord scheduled event named "[NML] Hive move" is created, **When** Neil sees it, **Then** it posts one Event Invitation in NML's `alliance-chat` that mentions each holder of NML's Alliance role who does not have Event Invitations Off.
3. **Given** a description with links, **When** the Event Invitation is posted, **Then** it shows those links as the Event's guides.
4. **Given** an Event whose tag matches no Alliance on the server, **When** Neil sees it, **Then** it posts no Event Invitation and writes a log line naming the event.
5. **Given** an Event Invitation was already posted for an Event, **When** Neil sees the Event again (an edit, a restart), **Then** it posts no second invitation.
6. **Given** nobody to mention, **When** the Event Invitation is posted, **Then** it is posted without mentions.
7. **Given** "[XYZ] Hive move" created by a Member who is neither R4 or R5 of XYZ nor an Officer, or a Kingdom Event created by someone who is not an Officer, **When** Neil sees it, **Then** it posts no Event Invitation and no reminders, and writes a log line naming the event and its creator.

---

### User Story 2 - Interested Members are reminded (Priority: P1)

A Member clicks Interested on the Discord event. At the Event Kind's lead times before the start, and before the Sign-up Deadline if the kind has one, Neil mentions the Interested Members in the Event's channel.

**Why this priority**: the reminder is the point of the slice: Members forget the start and the in-game Sign-up.

**Independent Test**: automated: with a fake clock, an Event with no matching kind gives one reminder 30 minutes before the start that mentions only the Interested Members.

**Acceptance Scenarios**:

1. **Given** an Event with no matching Event Kind, **When** it is 30 minutes before the start, **Then** Neil posts one Event Reminder in the Event's channel that mentions every Interested Member who may take part.
2. **Given** an Event whose kind has lead times of 24 hours and 1 hour, **When** each lead time is reached, **Then** one Event Reminder goes out for each, and no other.
3. **Given** a kind with a Sign-up Deadline 2 hours before the start and a sign-up lead time of 1 hour, **When** it is 3 hours before the start, **Then** Neil posts a reminder that the Sign-up closes, with the deadline.
4. **Given** a Member with Event Invitations Off who marked an Event Interested, **When** its reminder goes out, **Then** they are mentioned.
5. **Given** a Guest who marked a Kingdom Event Interested, **When** its reminder goes out, **Then** they are not mentioned.
6. **Given** nobody Interested, **When** a lead time is reached, **Then** no reminder is posted.
7. **Given** the start is moved, **When** Neil sees the change, **Then** the reminders follow the new start; one already sent for the same lead time is not sent again.
8. **Given** the Event is cancelled or deleted, **When** a lead time would come, **Then** nothing is posted.

---

### User Story 3 - Leaders set their Event Kinds (Priority: P2)

An R5 of NML records an Event Kind "Hive move" with reminders 1 hour and 10 minutes before the start. An Officer records "AD" for the kingdom with a Sign-up Deadline 2 hours before the start and reminders before it.

**Why this priority**: the default of 30 minutes works without it; kinds make the reminders fit each Event.

**Independent Test**: automated: a recorded kind is listed again, and an Event whose name contains it gets its lead times.

**Acceptance Scenarios**:

1. **Given** a Member Linked as R4 or R5 of an Alliance, **When** they add, change, remove or list Event Kinds, **Then** it applies to their Alliance's list only, and only they see the answer.
2. **Given** an Officer, **When** they manage Event Kinds for the kingdom, **Then** it applies to the kingdom's list.
3. **Given** any other Member, **When** they try to change Event Kinds, **Then** Neil refuses privately.
4. **Given** the kingdom's kind "AD", **When** an Event "AD round 3" is created, **Then** it gets AD's lead times. **Given** "[NML] AD prep", **Then** only NML's kinds are searched.
5. **Given** two kinds whose names both appear, **When** Neil picks one, **Then** it takes the longest name.
6. **Given** a lead time or offset that can't be read, or more than the limits, **When** saving, **Then** Neil refuses privately and keeps what was recorded.

---

### User Story 4 - A Member switches invitations off (Priority: P3)

A Member who doesn't want to be mentioned in every Event Invitation switches them off with a private command. They still get reminders for Events they mark Interested.

**Why this priority**: invitations go to many by default; this is the way out.

**Independent Test**: automated: after switching off, the Member is left out of the next invitation's mentions, and still in the reminders of an Event they marked Interested.

**Acceptance Scenarios**:

1. **Given** a Linked Member, **When** they run the command, **Then** only they see whether invitations are on or off and can switch.
2. **Given** a Member with Event Invitations Off, **When** an Event Invitation is posted, **Then** they are not mentioned.
3. **Given** a Member with Event Invitations Off, **When** the Unlink is done, **Then** their choice is forgotten.

### Edge Cases

- An Event whose start is already past, or less than a lead time away, when Neil first sees it: invitation posted, and only reminders still ahead go out.
- Neil was off at a lead time: at startup, a missed reminder for an Event that hasn't started is sent once, late; one for an Event that has started is dropped.
- More mentions than one message can hold: they continue in follow-up messages, and the card is posted once (as in slice 026).
- A Member who left or was Unlinked but is still Interested on Discord: not mentioned.
- The creator writes no links: the invitation shows no guides.
- Neil can't post in the Event's channel: a log line, and nothing else breaks.
- A restart between sending a reminder and recording it: the reminder may go out twice. That is harmless.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Neil MUST notice Discord scheduled events created, changed, cancelled or deleted on the server, and at startup read those still ahead.
- **FR-002**: Neil MUST treat an event whose name starts with an Alliance tag in brackets as that Alliance's Alliance Event, and any other as a Kingdom Event.
- **FR-002a**: Neil MUST act on an Alliance Event only if its creator is Linked as that Alliance's R4 or R5 or is an Officer, and on a Kingdom Event only if its creator is an Officer; otherwise it posts nothing for it and writes a log line.
- **FR-003**: Neil MUST post exactly one Event Invitation per Event: Kingdom Events in `#event-announcements`, Alliance Events in that Alliance's `alliance-chat`.
- **FR-004**: The Event Invitation MUST show the name, the start in each reader's own time, the links from the description as guides, and a link to the Discord event.
- **FR-005**: The Event Invitation MUST mention, one by one, each Member who may take part (holders of `Events` for a Kingdom Event, holders of the Alliance role for an Alliance Event) unless they have Event Invitations Off.
- **FR-006**: Neil MUST post an Event Reminder at each of the Event Kind's lead times before the start, and before the Sign-up Deadline if the kind has one, at most once per lead time per Event.
- **FR-007**: An Event Reminder MUST mention only Linked Members who marked the Discord event Interested and may take part; for a Kingdom Event, Guests are left out.
- **FR-008**: With no matching Event Kind, Neil MUST send one Event Reminder 30 minutes before the start, and no Sign-up reminder.
- **FR-009**: Neil MUST let a Member Linked as R4 or R5 manage their Alliance's Event Kinds, and Officers manage the kingdom's, privately: add or change (name, lead times before start, optional Sign-up Deadline offset with lead times before it), remove and list.
- **FR-010**: Neil MUST give an Event the kind from its own list whose name appears in the Discord event's name, ignoring case, preferring the longest name.
- **FR-011**: Neil MUST let any Linked Member switch Event Invitations Off and on privately, and forget the choice at Unlink.
- **FR-012**: Neil MUST follow a moved start and send nothing for a cancelled or deleted Event.
- **FR-013**: Neil MUST write a log line in `#neil-log` for each invitation and reminder posted, and for each Event it can't place.
- **FR-014**: The Server Layout MUST let Neil read the events and post in `#event-announcements`, and give the Create Events right to the roles that may create Events.

### Key Entities

- **Event**: a Discord scheduled event Neil has seen: name, start, Kingdom or Alliance (which), description links, cancelled or not. Neil records which invitation and reminders it has sent.
- **Event Kind**: name, owner (kingdom or one Alliance), lead times before start, optional Sign-up Deadline offset with its lead times.
- **Event Invitations Off**: one Member's recorded choice.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every Discord scheduled event created while Neil runs gets its Event Invitation within 1 minute, and exactly one.
- **SC-002**: Every Event Reminder goes out within 1 minute of its lead time.
- **SC-003**: No Member is mentioned in a reminder for an Event they didn't mark Interested, and no Guest in a reminder for a Kingdom Event.
- **SC-004**: An Officer or R5 can record an Event Kind in under a minute without help.

## Assumptions

- Discord's Create Events right decides who can create a Discord event at all; Neil then checks the creator (FR-002a).
- Limits: at most 3 lead times before the start and 3 before the Sign-up Deadline per kind, each between 1 minute and 7 days, and at most 25 kinds per list.
- The commands are `/event-kinds` (Officers and R4/R5) and `/event-invitations` (any Linked Member). Names are confirmed in the plan.
- Neil keeps a small record per Event (which invitation and reminders are sent) and the Event Kinds and choices: one migration.
- Neil uses Discord's markup so the start shows in each reader's own time.
- Out of scope: Neil creating events, recurring schedules, private messages, and guides from the `guides` forum.
