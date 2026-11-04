# Feature Specification: Look up within a Daily Allowance

**Feature Branch**: `015-look-up-within-a-daily-allowance`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User: "Neil should know how many requests have been caused by which player. Include an appropriate daily
allowance (assuming a maximum of 150 active users per day) to each player. Players need to be informed about these
capabilities and limitations. When they get close to that limit, include a warning in each response."

## Clarifications

### Session 2026-11-04

- Q: How large is the Daily Allowance? → A: computed from the quota: (the Daily Quota's limit − Quota Reserve − Sync
  Share) ÷ Expected Lookup Members. Instead of a fixed 150, Neil starts with 100 and records how many Members actually
  use lookups each day; activity varies by weekday.
- Q: How are Expected Lookup Members estimated? → A: the average Lookup Member count of the last 4 recorded days on the
  same weekday (fewer if fewer are recorded; 100 while none is).
- Q: Who is a Lookup Member? → A: only a Member whose lookups caused at least one Game API request that day (cached
  answers do not make one).
- Q: What counts? → A: only Game API requests caused by a Member's lookups (`/player`, `/alliance`, Alliance Overview).
  Onboarding Interview and Daily Sync requests are not charged. Officers are counted but never refused.
- Q: When is usage shown? → A: always: every lookup reply shows the Member's usage (this replaces "a warning when close
  to the limit"). At the allowance, lookups that need the Game API are refused; cached answers still work.
- Q: How do Members learn about it? → A: a new `/usage` command, a note at Link, and Officers see today's top Members by
  requests in `/quota`.
- Q: Dictionary? → A: "Daily Allowance" (with Expected Lookup Members) and "Lookup Member" approved 2026-11-04.

### Session 2026-11-05

- Q: Does `/reaper` (slice 014, merged after this spec) count against the Daily Allowance? → A: no. Its requests count
  only towards the Daily Quota and still stop at the Quota Reserve. `/reaper` replies show no usage line, and a Member
  who only uses `/reaper` is not a Lookup Member that day.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Member's lookups stop at their Daily Allowance (Priority: P1)

A Member runs `/player`, `/alliance` or opens an Alliance Overview. When the answer needs a Game API request, Neil counts
that request against the Member for today. Once the Member has used their whole Daily Allowance, further lookups that
would need the Game API are refused with the time it resets; answers Neil already holds in its cache are still shown.

**Why this priority**: it is the request itself: no single Member can use up the lookups everyone shares.

**Independent Test**: automated: a Member with an allowance of 3 makes 3 uncached lookups, the 4th uncached lookup is
refused with the reset time, and a cached lookup still answers.

**Acceptance Scenarios**:

1. **Given** a Member has used fewer requests than their Daily Allowance, **When** their lookup needs the Game API,
   **Then** it is sent and counted against them.
2. **Given** a Member's lookup is answered from the cache, **When** it is answered, **Then** nothing is counted.
3. **Given** a Member has used their whole Daily Allowance, **When** their lookup would need the Game API, **Then** it is
   refused, no request is sent, and the reply says when the allowance resets (00:00 UTC).
4. **Given** the same Member, **When** their lookup can be answered from the cache, **Then** it is answered.
5. **Given** an Officer has used more than the Daily Allowance, **When** their lookup needs the Game API, **Then** it is
   sent and counted, never refused for the allowance.
6. **Given** a lookup request fails (error or timeout), **When** it was sent, **Then** it counts, as it does for the
   Daily Quota.
7. **Given** a new UTC day starts, **When** a Member looks up, **Then** their count starts again at 0.
8. **Given** a Member is within their allowance, **When** the shared lookups have reached the Quota Reserve, **Then** the
   lookup is still refused as today (the Quota Reserve rule stays).
9. **Given** an Onboarding Interview or the Daily Sync sends a request, **When** it is sent, **Then** it is not counted
   against any Member.
10. **Given** a Member has used their whole Daily Allowance, **When** they run `/reaper closest`, **Then** it answers as
    usual, and its requests are not counted against them.
11. **Given** Neil reads a Player to apply a nickname and roles, **When** the request is sent, **Then** it is not counted
    against any Member, although it uses the lookup budget.

---

### User Story 2 - The allowance follows how many Members actually look up (Priority: P1)

At the start of each UTC day Neil sets the Daily Allowance from the Daily Quota's limit, minus the Quota Reserve and the
Sync Share, divided by the Expected Lookup Members for that weekday, rounded down and at least 1. Neil records each
day's Lookup Member count so the estimate learns the server's weekly rhythm.

**Why this priority**: a fixed guess is either too stingy on quiet days or too generous on busy ones.

**Independent Test**: automated: with no history the divisor is 100; with Lookup Member counts of 40, 60, 80 and 100 on
the last four Saturdays, a Saturday's divisor is 70; with a limit of 2,000, a reserve of 100 and a share of 500, the
allowance is 1,400 ÷ 70 = 20.

**Acceptance Scenarios**:

1. **Given** no Lookup Member counts are recorded, **When** the Daily Allowance is set, **Then** Expected Lookup Members
   is 100 (2,000 − 100 − 500 = 1,400 → 14 per Member).
2. **Given** counts are recorded for only two earlier Saturdays (30 and 50), **When** a Saturday's allowance is set,
   **Then** Expected Lookup Members is 40.
3. **Given** more than four Saturdays are recorded, **When** a Saturday's allowance is set, **Then** only the latest four
   are averaged.
4. **Given** the average is not a whole number, **When** the allowance is computed, **Then** the result is rounded down
   (never above the share it divides) and is at least 1.
5. **Given** a day ends, **When** it is recorded, **Then** its Lookup Member count is the number of distinct Members
   (Officers included) whose lookups caused at least one Game API request that day; a day with 0 is recorded as 0.
6. **Given** the Game API reports a different limit during the day, **When** the allowance is next read, **Then** it is
   recomputed with the new limit.
7. **Given** Neil restarts during the day, **When** it comes back, **Then** each Member's count and today's allowance are
   unchanged.

---

### User Story 3 - Every lookup reply shows the Member's usage (Priority: P1)

Every reply to a lookup (`/player`, `/alliance`, Alliance Overview, also pick lists and "not found" replies) ends with
the Member's usage: "N of M Game API requests used today · cached answers are free · resets 00:00 UTC". A refused lookup
says the allowance is spent.

**Why this priority**: the user asked that Members be warned; showing it every time means no Member is surprised.

**Independent Test**: automated: the usage line appears on a card, a pick list, a "not found" reply and a refusal, with
the Member's numbers after the request.

**Acceptance Scenarios**:

1. **Given** a Member has used 4 of 14, **When** their uncached `/player` answers, **Then** the reply shows "5 of 14".
2. **Given** the same Member, **When** a cached `/player` answers, **Then** the reply shows "4 of 14".
3. **Given** an Officer, **When** their lookup answers, **Then** the reply shows their count and that Officers are not
   limited.
4. **Given** a Member's allowance is spent, **When** a lookup is refused, **Then** the reply says so, shows "14 of 14"
   and the reset time.

---

### User Story 4 - A Member learns about lookups and their allowance (Priority: P2)

A Member runs `/usage` and sees, privately: their Game API requests today, their Daily Allowance, what costs a request
(a lookup Neil has not answered in the last 10 minutes; cached answers are free), that Onboarding is never charged, and
when it resets. When a Member is Linked, Neil tells them about `/player`, `/alliance`, `/usage` and the Daily Allowance.

**Why this priority**: the user asked that Members be informed; it is useful, but the limit works without it.

**Independent Test**: automated: `/usage` replies privately with the Member's numbers; the Link note is sent at an
Interview Link and at an Officer Link.

**Acceptance Scenarios**:

1. **Given** a Member has used 3 of 14, **When** they run `/usage`, **Then** they see 3 of 14, what costs a request and
   the reset time, visible only to them.
2. **Given** `/usage` itself, **When** it runs, **Then** it costs no Game API request.
3. **Given** a Member is Linked (by the Interview or an Officer Link), **When** the Link is made, **Then** they get the
   note on lookups and the Daily Allowance, privately.

---

### User Story 5 - Officers see who causes the requests (Priority: P2)

An Officer runs `/quota` and sees, besides the Daily Quota, today's Daily Allowance and Expected Lookup Members, and the
Members with the most Game API requests today (up to 10, most first).

**Why this priority**: "Neil should know how many requests have been caused by which player"; Officers need to see it.

**Independent Test**: automated: `/quota` lists the top Members by today's count, at most 10, and says "no lookups yet"
when there are none.

**Acceptance Scenarios**:

1. **Given** 12 Members made lookups today, **When** an Officer runs `/quota`, **Then** the 10 with the most requests are
   listed with their counts, most first.
2. **Given** no Member caused a request today, **When** an Officer runs `/quota`, **Then** it says so.
3. **Given** today's allowance, **When** `/quota` shows it, **Then** it shows the allowance and the Expected Lookup
   Members it came from.

### Edge Cases

- A lookup that needs two requests (e.g. a name that matches several Players, then the pick): each request counts when it
  is sent; a Member with one request left gets the first and is refused the second.
- Two lookups by one Member at the same moment with one request left: only one is sent.
- A Member who leaves the server keeps their count for the day; it matters only for the Lookup Member count.
- The allowance computes to less than 1 (e.g. a tiny limit): it is 1.
- The Daily Quota's limit is unknown at startup: the default limit Neil uses today applies until the Game API reports
  one.
- A Member's interaction comes in after midnight UTC for a lookup started before: it counts on the day the request is
  sent.
- The Link note cannot be sent privately (the Member blocks private messages): the Link still succeeds; the note is also
  part of the Link message in the Interview thread.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Neil MUST count, per Member and UTC day, every Game API request sent for that Member's lookups (`/player`,
  `/alliance`, Alliance Overview, and their pick lists and buttons), including failed ones.
- **FR-002**: Answers from the cache, Onboarding Interview requests, Daily Sync requests, `/reaper` requests and the
  requests Neil makes to apply nicknames and roles MUST NOT be counted against a Member.
- **FR-003**: Neil MUST refuse a Member's lookup that needs a Game API request once the Member's count has reached their
  Daily Allowance, without sending the request, and say when it resets.
- **FR-004**: Officers MUST be counted but never refused because of the Daily Allowance.
- **FR-005**: The Daily Allowance MUST be (the Daily Quota's limit − Quota Reserve − Sync Share) ÷ Expected Lookup
  Members, rounded down, at least 1.
- **FR-006**: Expected Lookup Members MUST be the average of the Lookup Member counts of the last 4 recorded days on the
  same weekday as today (fewer if fewer are recorded), and 100 while none is recorded.
- **FR-007**: Neil MUST record each UTC day's Lookup Member count: the number of distinct Members whose lookups caused at
  least one Game API request that day.
- **FR-008**: Counts, today's allowance basis and the recorded Lookup Member counts MUST survive a restart.
- **FR-009**: Every lookup reply MUST show the Member's usage today against their allowance, that cached answers are
  free, and the reset time; for an Officer it says they are not limited.
- **FR-010**: Neil MUST offer `/usage`, which any Member can run and which replies only to them with their usage,
  allowance, what costs a request, that Onboarding is not charged, and the reset time, without a Game API request.
- **FR-011**: At every Link (Interview Link and Officer Link), the Member MUST be told about `/player`, `/alliance`,
  `/usage` and the Daily Allowance.
- **FR-012**: `/quota` MUST show today's Daily Allowance, the Expected Lookup Members it came from, and the up to 10
  Members with the most requests today, most first.
- **FR-013**: The existing rule that lookups stop at the Quota Reserve MUST stay.
- **FR-014**: Counts older than the last 4 weeks of Lookup Member history MAY be discarded; the per-Member counts of
  past days are not needed.

### Key Entities

- **Daily Allowance**: the number of Game API requests one Member's lookups may cause in a UTC day; derived from the
  Daily Quota's limit, the Quota Reserve, the Sync Share and Expected Lookup Members.
- **Expected Lookup Members**: the estimate of how many Lookup Members a day will have, from the same weekday's recent
  history.
- **Lookup Member**: a Member whose lookups caused at least one Game API request on a UTC day.
- **Member usage**: a Member's count of Game API requests on one UTC day.
- **Lookup Member record**: one UTC day and its Lookup Member count.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No Member (other than an Officer) causes more counted Game API requests (FR-001) in a day than that day's
  Daily Allowance; `/reaper` is outside this count.
- **SC-002**: 100% of lookup replies show the Member's current usage.
- **SC-003**: With 150 Lookup Members on a day whose estimate was right, lookups never reach the Quota Reserve because of
  allowances alone (allowances sum to at most the lookup share).
- **SC-004**: An Officer can see in one command which Members caused the most requests today.
- **SC-005**: A Member can find out their remaining requests in one command, at no quota cost.

## Assumptions

- The divisor 100 is the starting estimate the user chose; the user's "150 active users" is the maximum the server
  expects, which the recorded history replaces.
- On a day busier than its estimate, Members may each stay within their allowance and the shared lookups still stop at
  the Quota Reserve; that existing rule protects Onboarding Interviews.
- "Player" in the request means the Member who ran the lookup (the dictionary's Member), not the Player looked up.
- The Link note is sent as a private message and is also added to the Link message in the Interview thread (slice 013
  may delete finished threads, so the private message is the one that lasts).
- The history needs four weeks to settle; until then fewer same-weekday days are averaged.
- The usage line wording is final in the plan; the meaning above is binding.
- `/reaper` draws on the same lookup budget without an allowance, so heavy `/reaper` use can reach the Quota Reserve
  sooner. The 10-minute cache limits it: repeated calls by any Member reuse the same reads.
