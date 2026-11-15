# Discovery: KvK battle plan (issue #117, 2026-11-15)

Domain discovery for issue #117, "KvK battle plan with R5 RSVP and siege reminders". Related issues: #118 (shield
reminder), #119 and #120 (NaP, City Rotation), #123 (Server Time UTC-2) and #124 (Discord timestamps). Documentation
only, no code. Proposal by the `domain-modeler` agent; the user's answers (section 6) are folded in and win.

The problem on Kingdom 330: **battle plans are not ready on time and do not reach the Alliances clearly.** Nobody knows
which Alliances have read the plan or how many fighters each brings.

## 1. What we know

| Fact | Source |
|------|--------|
| Kingdom vs Kingdom is an event in which the Kingdom fights another Kingdom. It has its own group of channels, seen by `PvP` and `Events`; its announcements and their translated copies reach the whole Home Kingdom | DICTIONARY.md, Kingdom vs Kingdom |
| The KvK group has `kvk-chat`, `KvK voice`, `kvk-announcements` (only King posts; Interaction Bot translates it) and the `kvk-tactics` forum with a `Plan` tag | server-layout.json, specs/029 |
| `nap-leaders` is a closed room for `R5` and King. There is no KvK equivalent yet | server-layout.json |
| Every Alliance has its own `alliance-chat`, where Neil may post (Booty Calls land there) | server-layout.json, `allianceArea` |
| Officer means a Member with the Moderator or King Discord role | DICTIONARY.md, Officer |
| Slice 028 gives Events, Event Kinds with lead times, Event Reminders and a one-minute reminder clock | DICTIONARY.md, specs/028 |
| Troop Bracket: the highest troop tier a Player's sanctuary level unlocks; Might is known from the Game API | DICTIONARY.md |
| Neil sends private messages only at Unlink; reminders are mentions in a channel (slices 026, 028) | DICTIONARY.md, specs/028 |
| Neil can't read message content (no MessageContent intent) | DISCORD-PLATFORM.md |

## 2. Where words change meaning

| Word | Meanings in play | Settled |
|------|------------------|---------|
| King | (1) the Discord role that makes an Officer, (2) the in-game title | **(1) in Neil.** The in-game title gets its own term if ever needed (Q8) |
| RSVP | (1) an Alliance's answer to a Battle Plan, (2) Discord's "Interested", (3) the in-game Sign-up | Split into **Plan Confirmation** and **Availability** (section 4); neither is Sign-up or Interested |
| class / bracket | (1) Troop Bracket (troop tier, a role), (2) the fighting class Whale / Dolphin / Seal / Small Fry | Different concepts: the **Fighter Class** is suggested *from* Troop Bracket and Might, but chosen by the Member |
| plan | (1) the War Council's Battle Plan in Neil, (2) a `kvk-tactics` post tagged `Plan` | (1). The forum stays for discussion |
| time | Server Time (UTC-2), the reader's local time, UTC (Neil's Daily Quota) | Siege times are entered and shown in Server Time, plus a Discord timestamp |

## 3. Event storming

**Actors**: War Council (Discord role set by the owners, independent of who is King), R5 / R4 (Members Linked to an
Alliance's leaders), Home Kingdom Members (answer Availability), King (supervises the content, outside Neil), the clock.

| Command | By | Domain event |
|---------|----|--------------|
| Draft / edit the Battle Plan for this week's Siege | War Council | Battle Plan drafted / amended |
| Publish the Battle Plan | War Council | Battle Plan published (Availability Polls opened) |
| Confirm the plan for the Alliance | R5, or R4 when no R5 answers | Plan confirmed |
| Answer the Availability Poll (available? Fighter Class) | Linked Member | Availability given / changed |
| Cancel the Siege | War Council | Siege cancelled |
| (clock) | Neil | Plan Deadline missed, Confirmation chased, Availability summed up, Siege Reminder sent, Phase started |

**Policies**
- When the Plan Deadline passes and no Battle Plan is published, mention the War Council in `kvk-leaders`.
- When a Battle Plan is published: post the plan card in `kvk-announcements`; post the confirmation card in
  `kvk-leaders`; post an Availability Poll in every Home Kingdom Alliance's `alliance-chat`.
- Alliances **on the plan** (with an assignment) are chased at fixed lead times until they confirm. Alliances **not on
  the plan** are asked once, never chased.
- Each Availability Poll pre-selects a suggested Fighter Class per Member from Troop Bracket and Might; the Member
  confirms or picks another.
- Availability totals per Alliance and Fighter Class are kept up to date for the War Council and the Alliance's
  leaders. Small Fry are counted apart and left out of the strategy totals.
- On Siege day: a Siege Reminder before the start, then one at each Phase, mentioning the Alliances assigned to it.

**Read models**
- **Plan card** (public): objectives, phases with times (Server Time + Discord timestamp), assignments per Alliance,
  notes.
- **Confirmation board** (`kvk-leaders`): per Alliance on the plan: confirmed by whom and when, or missing; then the
  Alliances asked but not on the plan.
- **Availability summary**: per Alliance, the number of available Whales, Dolphins and Seals (Small Fry apart); a
  Kingdom total.

**Aggregate**: **Siege** (one per KvK week), holding its Battle Plan, deadlines, Plan Confirmations, Availability and
the record of reminders sent.

Candidate invariants
- Only War Council holders draft, publish, amend or cancel a Battle Plan.
- One Siege per KvK week, in a fixed weekly window (time in configuration, Server Time).
- Confirmations and Availability open only once the plan is published.
- One Plan Confirmation per Alliance per Siege, by its R5 or, failing that, an R4.
- One Availability answer per Member per Siege; it can change until the Siege starts.
- Each reminder or chase goes out at most once (as in 028). Neil stores instants; Server Time is only how they show.

## 4. Proposed terms (for the user's approval before DICTIONARY.md changes)

- **War Council**: the Discord role (ID in configuration, given by the owners) whose holders write and publish Battle
  Plans. Independent of the King role; not an Officer role.
- **Siege**: the Home Kingdom's one fight window of a KvK week, at a fixed time in Server Time.
- **Battle Plan**: the War Council's structured plan for one Siege: Objectives, Phases, Assignments and notes.
- **Objective**: a target in a Battle Plan. Always offered: the enemy Kingdom's Royal City, its four Cannon Towers
  (north, east, south, west) and enemy sanctuaries; the War Council may add others.
- **Phase**: a timed step of a Siege in a Battle Plan; each Phase gets a Siege Reminder.
- **Assignment**: which Alliance takes which Objective or role in which Phase. An Alliance with an Assignment is *on
  the plan*.
- **Plan Confirmation**: an Alliance's acknowledgement that it has read the Battle Plan, by its R5 or else an R4.
- **Availability Poll**: Neil's poll in an Alliance's `alliance-chat` asking which Members will fight, and as what.
- **Fighter Class**: how much a Player can carry in a Siege: Whale (heavy spender, very strong, T9/T10, leads charges
  and holds key Objectives), Dolphin (light spender or very active free player, T9, supports Whales, holds side
  Objectives), Seal (casual or free player, T8 and below, supports Dolphins and fills rallies), Small Fry (not part of
  the strategy). Chosen by the Member; Neil suggests one from Troop Bracket and Might.
- **Plan Deadline**, **Confirmation Deadline**: fixed offsets before the Siege (configuration).
- **Confirmation Chase**: Neil's mention of on-plan Alliances' leaders who haven't confirmed yet.
- **Siege Reminder**: a message before the Siege's start or at a Phase, mentioning the assigned Alliances.
- **Server Time**: the game's clock, UTC-2 all year (#123).

Dictionary entries this touches: Kingdom vs Kingdom (gains Siege), Officer (King = the Discord role).

## 5. Slicing (proposal)

1. **Plan the Siege** (first cut, section 7): Battle Plan, Plan Deadline, plan card, Plan Confirmation and chase,
   Siege Reminders per Phase.
2. **Know who fights**: Availability Poll in every `alliance-chat`, Fighter Class suggestion, Availability summary.
   Could come first if the War Council needs the numbers to write the plan (see section 7, open point).
3. **Read the battle plan in my language**: translated copies, if Interaction Bot doesn't translate Neil's posts.
4. **Be reminded to shield** (#118): its own slice and discovery.
5. NaP and City Rotation (#119, #120) stay their own capabilities.

## 6. The user's answers (2026-11-15)

1. **Plan form**: a structured plan in Neil (not a forum link, not free text alone).
2. **Siege**: one fixed window per KvK week.
3. **RSVP**: what matters is not yes/no but **who fights in which capacity**. R5s poll their Alliance; a rough count
   per Fighter Class (Whale, Dolphin, Seal; Small Fry don't matter) is enough. These counts are an elementary input to
   the strategy.
4. **Who answers**: Alliances on the plan are chased and must at least confirm they read it, ideally by the R5, by an
   R4 if no R5 is available. Alliances not on the plan are asked, but not chased.
5. Follow-up, **Fighter Class**: Members answer in their `alliance-chat`, with Neil suggesting a class.
6. Follow-up, **plan contents**: Objectives, Assignments per Alliance, Phases with times, free-text notes. Objectives
   are always the enemy Kingdom's Royal City, its 4 Cannon Towers (N, E, S, W) and the enemy's sanctuaries; others may
   be added.
7. **Channels**: plan card in `kvk-announcements`; confirmations, totals and chases in a new closed `kvk-leaders`.
8. **Timing**: fixed offsets from configuration for the Plan Deadline and Confirmation Deadline, chases at set lead
   times; on Siege day a reminder before the start and one per Phase, mentioning the assigned Alliances.
9. **Time and King**: Server Time is fixed UTC-2 all year and Siege times are entered in it, plus Discord timestamps;
   "King" in Neil means the Discord role.
10. **Suggestion**: Troop Bracket plus Might (thresholds in configuration); the Member confirms or picks another class.
11. **Small Fry**: asked too, counted apart, left out of the strategy totals.
12. **Order**: "Know who fights" (Availability Poll, Fighter Class) comes **first**, then "Plan the Siege".
13. **Terms**: approved at `/speckit-specify`, not before.

## 7. Smallest first cut (proposal)

**"Plan the Siege"**:
1. The weekly Siege window is configuration (Server Time). A War Council holder drafts this week's Battle Plan with
   `/siege-plan …` (Objectives from the fixed list plus custom ones, Phases with times, Assignments, notes) and
   publishes it.
2. If nothing is published by the Plan Deadline, Neil mentions the War Council in `kvk-leaders`.
3. On publishing: the plan card goes to `kvk-announcements` (times in Server Time plus `<t:…>`), the confirmation card
   to `kvk-leaders`. Every Home Kingdom Alliance's R5 (or R4) can press "Read and confirmed".
4. On-plan Alliances that haven't confirmed are mentioned at fixed lead times before the Confirmation Deadline; at the
   deadline the War Council gets the missing list. Off-plan Alliances are asked once.
5. Siege Reminders before the start and at each Phase, mentioning the assigned Alliances' leaders.
6. Everything is logged in `#neil-log` and survives a restart.

**Order (answer 12)**: "Know who fights" (slice 2 above) is built first; this cut follows it.

Needs a Server Layout change (`kvk-leaders`, Neil's post right in `kvk-announcements`, War Council role).

**To check before the spec** (*unverified*)
- Whether Interaction Bot translates posts by other bots in `kvk-announcements`.
- Discord's limits for a structured plan entry (modal fields, select menus) and for timestamps inside embeds.
