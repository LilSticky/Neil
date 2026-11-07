# Discovery: Be reminded of events (slice 028, 2026-11-07)

Domain discovery for the ROADMAP "Later" idea: "Neil keeps Discord events for in-game events, and opt-in Members are invited, reminded, reminded to sign up, and given the event's guides" (ROADMAP.md:48-49). Documentation only, no code. Sections 1 to 5 are the proposal; the user's answers go in section 6 and win wherever they differ.

Claims about Discord's behaviour that neither the code nor the repository documents are marked *unverified* and listed in section 5.

## 1. What we know

| Fact | Source |
|------|--------|
| The Game API offers players, alliances and the quota, and **no events**. Events must come from people or from configuration | GAME-API.md:42-49 |
| Alliance Duel and Kingdom vs Kingdom are the only events in the dictionary. Each has its own group of channels, seen by `PvP` and `Events` | DICTIONARY.md:46-52, server-layout.json:308-360 |
| The user said: "The other events are only of interest within the same alliance, except for AD and KvK as separate groups with overlapping interest of NaP, Events and PvP" | discovery/019:299 |
| `Events` is an Interest, so a Preference Role: optional, chosen after the Link or with `/channels`, and held only by Home Kingdom Members. Guests never have it | DICTIONARY.md:223-231, src/domain/preferences.ts:80 |
| The Events category has `event-chat`, `event-announcements` (a plain text channel), `event-help` and the `guides` forum. In `guides`, Veterans write and Moderator and King manage threads | server-layout.json:264-306 |
| The `guides` forum is Events-only; newcomers and Guests don't see it. Neil knows it only through an optional ID used in one text line | discovery/019:293, 32; src/discord/preferences-texts.ts:127-130 |
| Booty Alerts set the opt-in pattern: Off by default, recorded with a private command (mode, daily window, city time zone), forgotten at Unlink, delivered as mentions in a channel and never by private message | DICTIONARY.md:190-193, specs/026 Clarifications |
| Neil sends a Member a private message only at Unlink, and only if Discord allows it | DICTIONARY.md:254 |
| Neil logs in with the Guilds, GuildMembers and GuildPresences intents and nothing more. The Server Layout gives Neil no rights in the Events category | discovery/019:18, server-layout.json:264-306 |
| The roles Neil creates are not mentionable, so mentioning `@Events` would need extra rights | discovery/019:23 |
| Least privilege applies (constitution V). Domain code has no timers, so a reminder clock lives in an adapter | AGENTS.md "Code conventions" |
| Neil speaks as a Liaison in the alliance hall | user memory "Neil's voice" |

What we don't know: which in-game events exist besides AD and KvK, when they recur, whether they have a sign-up phase and when it closes, and who in the game or on the server signs up.

## 2. Where words change meaning

| Word | Meanings in play | Risk |
|------|------------------|------|
| event | (1) something that happens in the game, (2) a Discord scheduled event, (3) the `Events` Interest and role, (4) discord.js `Events` and domain events in code | Highest: four meanings. The domain needs one word for (1) and a different one for (2) |
| sign up | (1) registration in the game before a deadline, (2) Discord's "Interested" on a scheduled event, (3) a list Neil keeps | The roadmap says "reminded to sign up", which only makes sense for (1) or (3) |
| invite | (1) a post announcing the event, (2) a personal mention, (3) a Discord invite link | Discord has no personal invitation to a scheduled event (*unverified*) |
| guide | a post in the `guides` forum, in general or for one event | We don't know how a guide belongs to an event |

## 3. Proposed working terms (proposals, not dictionary terms)

- **Event** *(proposal)*: an in-game happening at a known time that Members take part in, such as Alliance Duel or Kingdom vs Kingdom. Neil can't see one; people or a schedule tell it.
- **Event Listing** *(proposal)*: the Discord scheduled event Neil keeps for one Event. The Discord side, kept apart from the Event itself.
- **Event Kind** *(proposal)*: what kind of Event it is (AD, KvK, …). It ties an Event to its guides and, if Q1 = b, to a recurring schedule.
- **Sign-up** *(proposal, depends on Q3)*: what a Member must do before a deadline to take part in an Event, and the deadline itself (**Sign-up Deadline**).
- **Event Reminder** *(proposal)*: one message from Neil about an Event at a set time before its start or its Sign-up Deadline.
- **Event Alerts** *(proposal, only if Q4 = b)*: a Member's recorded choice about Event Reminders, like Booty Alerts. Kept separate from Booty Alerts.
- **Event Guide** *(proposal)*: a `guides` forum post that belongs to an Event Kind.

Candidate invariants *(proposals)*:
- An Event has exactly one Event Listing, and an Event Listing belongs to at most one Event.
- If an Event has a Sign-up Deadline, it falls before the Event's start.
- Each Event Reminder goes out at most once per Event. A repeat after a restart is harmless, as with Booty Calls.
- Only Members who opted in are mentioned (as SC-003 of slice 026).
- A Guest gets no Event Reminders for Home Kingdom Events, because those channels are tactical (discovery/019:283).

Candidate events *(proposals)*: Event announced, Event Listing created, Member showed interest, Sign-up Reminder sent, Event Reminder sent, Event started, Event cancelled, Event moved.

## 4. Questions for the user

1. **Where do Events come from?**
   a. An Officer creates the Discord scheduled event by hand in Discord, and Neil picks it up. b. A recurring schedule in configuration (e.g. "AD every …"), from which Neil creates the Event Listings ahead of time. c. An Officer command, `/event`, with name, start, Sign-up Deadline and Event Kind; Neil creates the Event Listing. d. b and c together.
   **Recommended: a for the first cut**, then c or d. Option a needs no Manage Events permission (constitution V) and no knowledge of the game's schedule, which we must not assume. For b, please describe each Event Kind's rhythm (days, times, time zone).

2. **Whose Events are they?** You said events other than AD and KvK matter only within one Alliance (019:299).
   a. Only kingdom-wide Events (AD, KvK and any others you name), for the `Events` role. b. Also Alliance Events, created by an Alliance's R4 or R5 and announced in its `alliance-chat`. c. Both, but Alliance Events in a later slice.
   **Recommended: c.** Kingdom-wide Events first. Alliance Events reuse the `alliance-chat` path from slice 026 but need a rule for who may create them.

3. **What does "sign up" mean?**
   a. Registration in the game before a deadline, which Members tend to forget; Neil reminds them before it closes. b. Clicking "Interested" on the Discord event, so Neil knows who is coming. c. A sign-up list Neil keeps, with a button, that Officers can read. d. a, with b as the way Members say "remind me".
   **Recommended: d**, if a matches the game. Please confirm: which Events have an in-game sign-up, who signs up (every Player, or the R4 or R5 for the Alliance), and when it closes.

4. **How do Members opt in, and how does that relate to the `Events` role and Booty Alerts?**
   a. Holding the `Events` Interest is the opt-in: every holder is invited and reminded. b. A private command, `/event-alerts`, Off by default, with its own mode, window and time zone like Booty Alerts. c. The `Events` role sees the invitation, and "Interested" on each Discord event opts the Member in to that Event's reminders. d. Fold Event Alerts into `/booty-alerts` as one command.
   **Recommended: c.** It reuses the existing Interest and Discord's own button, needs no new storage per Member, and is opt-in per Event. Booty Alerts stay separate, because a Booty concerns one Alliance and lasts minutes. Guests are left out because they never hold `Events`.

5. **When and where do reminders go out?**
   When: a. Fixed lead times for all Events: a Sign-up Reminder 24 h before the Sign-up Deadline, and an Event Reminder 30 min before the start. b. Lead times set per Event Kind in configuration. c. Each Member picks their own.
   Where: x. Mentions of the opted-in Members in `#event-announcements`. y. Private messages. z. Private messages, falling back to a mention when Discord refuses.
   **Recommended: a + x.** Slice 026 chose mentions over private messages, and Neil otherwise sends one only at Unlink. Mentioning Members one by one avoids making `Events` mentionable. Note that Discord itself may notify Interested Members when the event starts (*unverified*), so Neil's reminder is the earlier one.

6. **What are "the event's guides"?**
   a. Posts in the `guides` forum that carry a forum tag named after the Event Kind; Neil links them in the invitation. b. Links the Event's creator writes into the Discord event's description. c. A table in configuration from Event Kind to guide posts. d. None in the first cut.
   **Recommended: d for the first cut, then a.** Veterans already write in `guides`, Officers already manage its threads, and tags need no new storage. For a, the first `guides` post per Event Kind is the obvious choice.

After these answers, the terms in section 3 that survive go to you for approval before DICTIONARY.md changes. Most important are Event vs Event Listing, and Sign-up.

## 5. Smallest first cut (proposal)

**"Be reminded of an event"**: an Officer creates a Discord scheduled event by hand (Q1 = a). Neil:
1. sees it and posts one invitation card in `#event-announcements`: name, start shown in each reader's own time (*unverified*: Discord timestamp markup), and a link to the event;
2. 30 minutes before the start, mentions the Members who marked the event Interested and still hold `Events`, in `#event-announcements`, continuing in follow-up messages as in slice 026;
3. logs both in `#neil-log`;
4. after a restart, works out pending reminders from Discord's list of events instead of keeping its own.

Out of the first cut: recurring schedules, Sign-up Reminders, guides, Alliance Events, private messages and Officer commands. Each follows as its own slice once Q1, Q3 and Q6 are answered.

Domain: Event, its start and the reminder rule (which Members, when). Adapters: a Discord scheduled-event reader, the card and mentions, a reminder clock, and a log line. No Game API. Depends on the Server Layout giving Neil View Channel, Send Messages and Embed Links in `#event-announcements`, and View Channel wherever the event's channel is.

**To check on Discord before the spec** (*unverified*)
- Which intent Neil needs to read scheduled events and their Interested users (GuildScheduledEvents?), and whether that list needs paging.
- Whether reading scheduled events needs any permission beyond View Channel, and whether creating them (Q1 b, c) needs Manage Events or Create Events.
- Whether Discord itself notifies Interested users at the start, or a set time before.
- Whether Discord can invite one person to a scheduled event, or only share a link.
- Whether Discord timestamp markup (`<t:…>`) shows each reader's local time in embeds.
- Whether a forum tag can be read and linked by a bot, and the per-forum tag limit.

## 6. The user's answers

Given on 2026-11-07. They win over sections 1 to 5.

1. **Source**: a (an Officer, or an Alliance's R4 or R5, creates the Discord scheduled event by hand, and Neil picks it up).
2. **Scope**: both kingdom-wide Events and Alliance Events, now. An Alliance's R4 or R5 creates an Alliance Event with the Alliance's tag in the name (e.g. "[NML] Hive move"). Neil announces it in that Alliance's `alliance-chat`, and R4 and R5 need Discord's Create Events right.
3. **Sign-up**: d. It means registering in the game before a deadline. Clicking Interested on the Discord event is how a Member says "remind me".
4. **Opt-in**: c, plus an opt-out command. `Events` role holders see the invitation, and Interested opts a Member in to that Event's reminders. The opt-out command stops only the invitation mentions for that Member, not the reminders for Events they marked Interested.
5. **Reminders**: lead times are set per Event Kind, and delivered as mentions. An Alliance's R4 or R5 sets them for that Alliance, and King or Moderator sets them for the kingdom.
6. **Guides**: b. Whoever creates the Discord event writes the guide links into its description.
7. **Event Kind**: R4 or R5 (for an Alliance) and King or Moderator (for the kingdom) keep a list of Event Kinds with a command, each with its lead times. Neil finds an Event's kind by matching the kind's name in the Discord event's name. With no match, default lead times apply.
8. **Sign-up Deadline**: each Event Kind has a fixed offset before the start.
9. **Dictionary**: the terms Event, Kingdom Event, Alliance Event, Event Kind, Sign-up, Sign-up Deadline, Event Invitation, Event Invitations Off and Event Reminder were approved as proposed. Event Listing and Event Guide are dropped.
10. **Alliance Event Invitation**: mentions every holder of the Alliance's role.
11. **Defaults**: an Event with no matching Event Kind gets one Event Reminder 30 minutes before the start, and no Sign-up Deadline.
12. **Guests**: a Guest gets no Event Reminders for Kingdom Events. Event Invitations Off is forgotten at Unlink.
