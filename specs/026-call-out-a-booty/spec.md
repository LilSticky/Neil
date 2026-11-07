# Feature Specification: Call out a booty

**Feature Branch**: `026-call-out-a-booty`

**Created**: 2026-11-07

**Status**: Draft

**Input**: Issue [#75](https://github.com/LilSticky/Neil/issues/75). The user: "someone /booty in alliance chat of the server, it posts a nice card and alerts anyone according their previously recorded preferences (according to time and on/offline). triggering the booty call requires an additional confirmation so it doesn't happen on accident".

## Clarifications

### Session 2026-11-07

- Q: Who may make a Booty Call? → A: any Linked Member of the Alliance, in that Alliance's `alliance-chat`.
- Q: Who is alerted? → A: only Members of that Alliance who opted in. Nobody is alerted by default.
- Q: How does the alert arrive? → A: a mention under the card in `alliance-chat`. No private messages.
- Q: What counts as online? → A: either one: online on Discord, or online in the game.
- Q: What does a Member record? → A: Always, Only when online or Only when offline, plus one daily time window.
- Q: Which clock? → A: a city time zone the Member picks, so daylight saving is followed.
- Q: Where is it recorded? → A: a new private command, `/booty-alerts`, not a Preference step, so this slice doesn't wait for slices 024 and 025.
- Q: What stops repeats? → A: a cooldown per Alliance of one minute.
- Q: What are the terms? → A: Booty (an alliance excavation), Booty Call (one confirmed `/booty` with its card), Booty Alerts (a Member's recorded choices).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Member makes a Booty Call (Priority: P1)

A Member sees a Booty in the game and runs `/booty` in their `alliance-chat`. Neil asks them privately to confirm. When they
confirm, Neil posts a card there and mentions the Members who want to hear about it now.

**Why this priority**: it is the capability itself.

**Independent Test**: automated: with one opted-in Member and one who is not, a confirmed Booty Call posts one card that mentions only the first.

**Acceptance Scenarios**:

1. **Given** a Linked Member in their Alliance's `alliance-chat`, **When** they run `/booty`, **Then** only they see a confirmation with Confirm and Cancel, and nothing is posted.
2. **Given** that confirmation, **When** they press Cancel, **Then** nothing is posted and nobody is alerted.
3. **Given** that confirmation, **When** they press Confirm, **Then** the card is posted in that channel, naming the caller and the Alliance, and the matching Members are mentioned.
4. **Given** a confirmation left unanswered for one minute, **When** the Member presses Confirm, **Then** Neil says it has expired and posts nothing.
5. **Given** any other channel, or another Alliance's `alliance-chat`, **When** a Member runs `/booty`, **Then** Neil refuses privately.
6. **Given** a Member who is not Linked, **When** they run `/booty`, **Then** Neil refuses privately.
7. **Given** a Booty Call less than one minute ago in that Alliance, **When** a Member runs `/booty` or presses Confirm, **Then** nothing is posted and Neil privately points them to the existing card.
8. **Given** nobody matches, **When** the Booty Call is confirmed, **Then** the card is still posted, without mentions.

---

### User Story 2 - A Member chooses their Booty Alerts (Priority: P1)

A Member records privately whether and when they want to be alerted: Off, Always, Only when online or Only when offline, with a
daily time window in their own city time zone.

**Why this priority**: with opt-in, nobody is alerted until this exists.

**Independent Test**: automated: recorded Booty Alerts are shown again when the Member reopens the command, and they decide whether the Member matches.

**Acceptance Scenarios**:

1. **Given** a Linked Member with nothing recorded, **When** they run `/booty-alerts`, **Then** only they see their Booty Alerts, set to Off.
2. **Given** a Member who records Only when offline, 08:00 to 23:00, Europe/Lisbon, **When** a Booty Call is made at 12:00 in Lisbon while they are offline, **Then** they are mentioned.
3. **Given** that Member, **When** a Booty Call is made at 12:00 in Lisbon while they are online, or at 23:30 in Lisbon, **Then** they are not mentioned.
4. **Given** a window from 22:00 to 06:00, **When** a Booty Call is made at 01:00, **Then** the Member is inside the window.
5. **Given** an unknown time zone or a time that can't be read, **When** the Member saves, **Then** Neil refuses privately and keeps what was recorded.
6. **Given** a Member with Booty Alerts, **When** the Unlink is done, **Then** their Booty Alerts are forgotten.

### Edge Cases

- The caller is never mentioned: they already know.
- A window whose start and end are the same covers the whole day.
- The Game API can't answer, or the Daily Quota is out: the card is still posted, using the Alliance role for who is in the Alliance and Discord alone for who is online.
- A Member online on Discord but not in the game, or the other way around, counts as online.
- More mentions than one message can hold: they continue in follow-up messages under the card, and the card is posted once.
- A Member who changed Alliance: their Booty Alerts stay, and apply to their current Alliance.
- Two Members confirm at the same moment: only one card is posted.
- Neil restarts during a cooldown: a second card may be posted. That is harmless.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Neil MUST accept `/booty` only from a Linked Member of an Alliance, in that Alliance's `alliance-chat`, and refuse privately otherwise.
- **FR-002**: Neil MUST ask for a private confirmation before anything is posted; it expires after one minute.
- **FR-003**: On Confirm, Neil MUST post one card in that channel, naming the caller and the Alliance.
- **FR-004**: Neil MUST mention exactly the Members of that Alliance, other than the caller, whose Booty Alerts match at that moment.
- **FR-005**: A Member MUST be treated as online when Discord shows them as anything but offline, or when the game does; a Player without a Last Online is online now, as in the dictionary.
- **FR-006**: A Booty Call MUST cost at most one Game API request, through the rate-limited, caching client.
- **FR-007**: If the Game API can't answer, Neil MUST still post the card, as in the Edge Cases.
- **FR-008**: Neil MUST allow one Booty Call per Alliance per minute, and point later callers to the existing card.
- **FR-009**: A Linked Member MUST be able to record, see and change their Booty Alerts privately with `/booty-alerts`: Off, Always, Only when online or Only when offline; a daily time window; a city time zone.
- **FR-010**: Booty Alerts MUST be Off until a Member records otherwise.
- **FR-011**: Booty Alerts MUST be kept across restarts and forgotten at Unlink.
- **FR-012**: Neil MUST log each Booty Call in `#neil-log`: caller, Alliance and how many were mentioned.
- **FR-013**: The dictionary, guides and TEST-RUN.md MUST describe the commands.
- **FR-014**: The Server Layout MUST let Neil post the card in `alliance-chat`, with View Channel, Send Messages and Embed Links there and nothing more.

### Key Entities

- **Booty Call**: one confirmed `/booty`: Alliance, caller, card and time.
- **Booty Alerts**: one Member's mode, time window and time zone.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Member can go from `/booty` to a posted card in two actions.
- **SC-002**: No card is posted without a confirmation.
- **SC-003**: No Member is mentioned against their Booty Alerts, given what Discord and the game report at that moment.
- **SC-004**: At most one card per Alliance per minute.
- **SC-005**: A Member can record their Booty Alerts in under a minute.

## Assumptions

- An Alliance's `alliance-chat` is the channel of that name in the category named after its `[TAG]` role.
- Who is in the Alliance comes from the same roster request, matched to Links.
- What the game reports can be up to 10 minutes old, so a Member who just left the game may still count as online.
- The card holds no coordinates or note from the caller; that can follow.
- Guests are treated like any Member: what counts is the Alliance they are Linked to.
