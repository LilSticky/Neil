# Dictionary

The ubiquitous language of Neil (constitution, principle I). Code, specs, tests, Discord texts and
commits use these terms. Terms change only with the user's approval (`dictionary` skill).

Entries marked *(proposed)* came from the initial roadmap and still need confirmation in domain
discovery.

# Server

## Member
* A person on the Discord server
* Not the same as a game alliance member; see Player

## Officer
* A Member with the Moderator or King Discord role (both role IDs in configuration); see King
* Manages other Members: approves, corrects roles, sees the Daily Quota

## Managed Role
* A Discord role Neil may give and remove: the Alliance, Alliance Rank, Kingdom and Troop Bracket roles
* An Alliance role carries the tag in brackets, `[NML]`; the brackets set it apart from every other role
* Neil creates a missing Managed Role on first use; apart from the Onboarding Role, the Doctor Role and the Preference Roles, it never touches any other role

## Home Kingdom information
* Channels only Members of the Home Kingdom see, shown to its Kingdom role (e.g. `#330`)
* King announcements go here by default
* Lives in the Hangout category of the Server Layout; off-topic and memes there only for those who chose Off-topic

## Guest area
* The channels every Doctor sees, Guests included: the only part of the server a Guest sees
* Holds its own read-only rules with the Guest code of conduct, text and voice channels
* Replaces Shared information (slice 019); no command can be used there

## Basic information
* The read-only channels every Member of the Home Kingdom sees, such as `#rules` and `#welcome`

## Moderator channel
* The channel where Officers use the Officer commands

## Server Layout
* The categories, channels and permission overwrites a server should have
* Described in the server guides and held in `server-layout.json`; the owner's setup script builds it, Neil itself does not change channel permissions

# Game

## Alliance Duel (AD)
* An event in which Alliances fight each other
* Has its own group of channels, seen by the PvP and Events roles, with no announcement channel of its own
* Runs Monday to Saturday in Server Time, each day rewarding different actions; Sunday has no Duel day. Neil posts a Duel Plan for each Duel day

## Kingdom vs Kingdom (KvK)
* An event in which the Kingdom fights another Kingdom
* Has its own group of channels, seen by the PvP and Events roles; its announcements, and their translated copies, reach the whole Home Kingdom
* Its fight window each week is the Raid, planned by the War Council in a Battle Plan

## Player
* A character in Last Asylum: Plague, as the Game API describes it
* Identified by its uid, the player ID from the game

## Player Name
* A Player's in-game nickname
* Not unique: several Players, also in different Kingdoms, can share one; matched exactly, ignoring letter case

## Might
* The strength of a Player, or the sum of its members' for an Alliance, as the game shows it (Game API `power`)
* Not "power": the game and the server say Might

## Kills
* The number of enemy troops a Player has defeated (Game API `kills`)

## VIP Level
* A Player's VIP level in the game (Game API `vip`)

## Likes
* How many likes other Players gave a Player's profile (Game API `likes`)

## Last Online
* When a Player was last online in the game (Game API `last_online_at`), shown as a time ago
* A Player without a Last Online is online now

## Language
* The language a Player or an Alliance has set in the game (Game API `language`), shown as a language name

## Location
* A Player's position on the Kingdom map, as X and Y (Game API `x`, `y`)

## Game API
* The external source of in-game information about Players

## Map Refresh
* The Game API re-reading a whole Kingdom's map; a Player's Might, Location, Alliance and other game data change only through it
* Started only by someone using Update Map on the Game API's site, at most once per 30 minutes per Kingdom; Neil cannot start one
* A Player's "as of" time is the last Map Refresh that changed them (Game API `map_updated_at`); an Alliance has none

## Server Time
* The game's clock: UTC-2, not UTC
* The game's daily reset is at 00:00 Server Time, which is 02:00 UTC. Neil shows Server Time moments as Discord timestamps, so each reader sees them in their own clock
* The offset never changes: no daylight saving (confirmed by the user 2026-11-15)

## Kingdom
* A game server, identified by its number
* A Player belongs to exactly one Kingdom

## Home Kingdom
* The one Kingdom this Discord server is for (330, in configuration)

## King
* The leader of the Alliance that holds a Kingdom's Royal City in the game, and the King Discord role that this Player's Member holds
* Changes hands every Friday at the Royal City siege. How depends on the Kingdom: some rotate the Royal City peacefully among their top Alliances (on Kingdom 330 the top 3), others fight over it
* An Officer while holding the role; not a fixed post, so lasting duties belong to a role that does not change weekly

## Royal City siege
* The weekly Friday moment when the Royal City, and with it the King, changes hands
* At a fixed time: 12:00 Server Time (14:00 UTC), the owner's decision
* Not a Raid: "siege" always means the Royal City siege

## City Rotation
* The Home Kingdom's fixed, ordered list of Alliances that take the Royal City in turn, one Turn each
* Kept by the R5s of the Alliances in it; Neil stores it by Alliance tag
* A server setting chooses Rotation or Contested (`CITY_ROTATION_MODE`). In Contested there is no order, and an
  Officer names each new Holding Alliance

## Holding Alliance
* The Alliance that holds the Royal City this Turn; its R5 is the King

## Turn
* One Alliance's time as Holding Alliance, from one Royal City siege to the next
* Stays open until the Handover is confirmed

## Handover
* The Royal City passing to the next Alliance at a Royal City siege
* Confirmed by the receiving Alliance's R5 (read fresh from the Game API) or by an Officer

## Handover Reminder
* Neil's mention of the outgoing and the receiving Alliance's R5s in `#nap-leaders` before the Royal City siege, so the
  Handover stays peaceful: 24 hours and 1 hour before. With the first, Neil announces the next Holding Alliance in
  `#home-kingdom-announcements`
* Only in Rotation mode

## King Move
* Neil's prepared move of the King role to the receiving Alliance's R5 after a Handover; an Officer applies it
* Posted in `#neil-log` with the new King and the Members who lose King; only the latest one can be applied

## NaP
* The non-aggression pact of the Home Kingdom's top Alliances, agreed outside the game
* An Alliance is in it or not; there are no levels
* An Alliance joins when its R5 asks and the NaP Council approves it in a NaP Vote; it leaves by its R5's choice alone
* Neil keeps the history of joins, declines and leaves: who asked, how it was decided or who left, and when
* While the NaP has no members, an Officer approves or declines a join request alone instead

## NaP Council
* The Members Linked to the R5 of an Alliance in the NaP
* They decide for the NaP and vote on join requests and NaP Motions, one vote per Alliance
* Any of them may open a NaP Motion
* They keep REAPER: they add and remove Exiles

## Exile
* A Player the server's community has exiled for being malicious, on REAPER
* Added and removed only by the NaP Council, with a reason; while the NaP has no members, by an Officer instead
* Who added an Exile is not shown to Members

## REAPER
* Roster of Exiled Antagonists, Pervs, Evildoers & Reprobates: the list of all Exiles
* Any Member may see it and find the closest Exiles to a position in the same Kingdom, or all of them by distance

## NaP Vote
* The NaP Council's decision on one join request, with Approve and Decline in `#nap-leaders`
* Runs 48 hours from when it opens; each Alliance in the NaP has one vote and may change it until then
* More Approve than Decline votes of the Alliances still in the NaP approve the request; a tie or no votes decline it

## NaP Motion
* A matter the NaP Council decides by vote, opened by one of its members with a text and a deadline (`/nap motion`)
* Each Alliance in the NaP has one vote, Approve or Decline in `#nap-leaders`, changeable until the deadline; votes stay hidden while it runs
* More Approve than Decline votes of the Alliances still in the NaP approve it; a tie or no votes reject it; there is no quorum
* Once closed, its result and each Alliance's vote are posted in the decision log in `#nap-announcements`, naming no Member

## NaP Cooldown
* The 30 days after a declined join request during which its Alliance may not ask to join the NaP again

## Home Kingdom Member
* A Member whose Linked Player is in the Home Kingdom

## Guest
* A Member whose Linked Player is not in the Home Kingdom

## Troop Bracket
* The highest troop tier (T1–T10) a Player's sanctuary level unlocks; one role per tier
* The level table is configuration, so new tiers need no code change

## Alliance
* A group of Players in one Kingdom, with a tag and a name
* Identified within its Kingdom by its tag (or name)

## Alliance Level
* An Alliance's level and its experience points (XP) toward the next one (Game API `level`, `exp`)

## Gift Level
* The level of an Alliance's gifts (Game API `gift_level`)

## Kingdom Might Rank
* An Alliance's place among its Kingdom's Alliances by Might (Game API `rank.rank`)

## Join Requirements
* What a Player needs to join an Alliance: open to all or by application, and a minimum Might and sanctuary level
  (Game API `join`; a minimum of 0 means none)

## Known Alliance
* An Alliance of the Home Kingdom that Neil has seen in a Game API answer in the last 30 days
* `/alliance` suggests and matches Known Alliances by part of the name or tag and by near spelling

## Alliance Roster
* The list of an Alliance's Players, each with uid, Player Name and Alliance Rank, as the Game API reports it

## Alliance Overview
* An Alliance's activity at a glance: totals, top contributors, Least Active members and a per-member table
* Opened from the Alliance card, shown only to the Member who asked

## Weekly Activity
* A Player's activity points in their Alliance this week (Game API `active`)

## Daily Honor
* A Player's honor contribution to their Alliance on the current game day (since the last daily reset, 00:00 Server Time) (Game API `daily_honor`)

## Daily Tech
* A Player's tech contribution to their Alliance on the current game day (since the last daily reset, 00:00 Server Time) (Game API `daily_tech`)

## Least Active
* The members of an Alliance with the lowest Weekly Activity
* Members the Game API gives no activity for are listed as "no data", not as Least Active

## Alliance Rank
* R1–R5, a Player's rank in their Alliance; R5 is the Alliance's leader
* Unknown when the Game API lists no rank for the Player

## Daily Quota
* The number of Game API requests Neil may make per UTC day; the limit is what the Game API reports
* Every request counts, failed ones too; resets at 00:00 UTC

## Quota Reserve
* The part of the Daily Quota that only Onboarding Interviews may use (from slice 004)

## Daily Allowance
* The number of Game API requests one Member's lookups may cause per UTC day: (the Daily Quota's limit − Quota Reserve − Sync Share) ÷ Expected Lookup Members, rounded down, at least 1
* Expected Lookup Members: the average Lookup Member count of the last 4 recorded days on the same weekday, and at least 100 (also while none is recorded)
* Answers from the cache, Onboarding Interviews, the Daily Sync, /reaper and the reads for nicknames and roles are not charged; Officers are counted but never refused

## Lookup Member
* A Member whose lookups caused at least one Game API request on a UTC day; Neil records their count per day

## Daily Sync
* Neil's once-a-day re-check of every Linked Member against the Game API, which updates their nickname and Managed Roles
* Uses only the Sync Share

## Sync Share
* The part of the Daily Quota the Daily Sync may use (500, configuration); lookups and the Quota Reserve are never used by it

## Booty
* An alliance excavation in the game that Members want to reach while it lasts
* Neil can't see one; a Member calls it out with a Booty Call

## Booty Call
* One confirmed `/booty` in an Alliance's `alliance-chat`: a card that mentions the Members of that Alliance whose Booty Alerts match
* Any Linked Member of the Alliance may make one; at most one per Alliance per minute
* Not kept: only the log line remains

## Booty Alerts
* What a Member recorded with `/booty-alerts` about when to be mentioned: Off, Always, Only when online or Only when offline, with a daily time window in their own time zone
* Off until the Member records otherwise; forgotten at Unlink
* Online means online on Discord or in the game

## Event
* Something in the game, at a set start time, that Members take part in, such as Alliance Duel or a Hive move
* Neil can't see one in the game. It knows an Event only from the Discord scheduled event that an Officer, or an Alliance's R4 or R5, created for it by hand
* Either a Kingdom Event or an Alliance Event
* Its guides are the links its creator writes into the Discord event's description

## Kingdom Event
* An Event for the whole Home Kingdom: its Discord event's name carries no Alliance tag in brackets
* Its Event Invitation goes to `#event-announcements`, for holders of the `Events` role
* A Guest gets no Event Reminders for it

## Alliance Event
* An Event for one Alliance: its Discord event's name carries that Alliance's tag in brackets, e.g. "[NML] Hive move"
* Created by a Member Linked to the Alliance's R4 or R5, who needs Discord's Create Events right for this
* Its Event Invitation goes to that Alliance's `alliance-chat`, for every holder of the Alliance's role

## Event Kind
* A named kind of Event, with its Reminder lead times and, if it has a Sign-up, its Sign-up Deadline offset
* Each Alliance keeps its own list, managed by the Members Linked to its R4 or R5. The kingdom's list is managed by the Officers
* Neil gives an Event the kind whose name appears in the Discord event's name, looking only in that Event's own list (the Alliance's or the kingdom's). With no match, one Event Reminder goes out 30 minutes before the start, and there is no Sign-up Deadline

## Sign-up
* A Player's registration in the game for an Event, which must happen before the Sign-up Deadline
* Not Discord's "Interested": that only asks Neil for Event Reminders

## Sign-up Deadline
* When Sign-up for an Event closes: its Event Kind's fixed offset before the Event's start
* Only Events whose Event Kind has a Sign-up have one

## Event Invitation
* Neil's single card for a new Event, posted once in the Event's channel. It shows the name, the start and the guide links, and links to the Discord event
* Mentions each Member who may take part, one by one, except those with Event Invitations Off

## Event Invitations Off
* A Member's recorded choice to stop being mentioned in Event Invitations; until they record it, they are mentioned
* Does not affect the Event Reminders for Events the Member marked Interested
* Forgotten at Unlink

## Event Reminder
* One message from Neil, at one of the Event Kind's lead times before the Event's start or Sign-up Deadline. It mentions the Members who marked the Discord event Interested
* Marking Interested is how a Member asks for reminders about that one Event. There is nothing else to opt in to
* Each Reminder goes out at most once per Event

## Duel Plan
* Neil's card in `#event-announcements` at each daily reset, Monday to Saturday in Server Time: what scores in the Alliance Duel today, and what to save for a later day
* Mentions nobody. Posted at most once per Duel day; if Neil was off at the reset, later that day, never on a later day
* Its texts live in the repository, one per Duel day, and change through a pull request. The kingdom's Event Kinds list shows it as a built-in Alliance Duel line

# Raid

## War Council
* The Discord role whose holders write, publish, amend and cancel the Battle Plan with `/raid-plan`. Its ID is in Neil's configuration
* Independent of the King role, and not an Officer role. Without it configured, Raid planning is off

## Raid
* The Home Kingdom's one fight window of a KvK week: Saturday, starting at 12:00 Server Time (14:00 UTC), the owner's decision
* From Sunday 00:00 to Saturday 23:59 Server Time, the current Raid is that week's Saturday's. A cancelled Raid stays cancelled for that week

## Battle Plan
* The War Council's structured plan for one Raid: Objectives, Phases, Assignments and notes
* A draft until published; publishing posts it in `#kvk-announcements` and asks for Plan Confirmations in `#kvk-leaders`. Publishing again updates both posted cards and keeps the confirmations

## Objective
* A target in a Battle Plan. Always offered, and never removed: the enemy Kingdom's Royal City, its four Cannon Towers (North, East, South, West) and the enemy sanctuaries
* The War Council may add up to six of its own

## Phase
* A timed step of a Raid in a Battle Plan, with a name and a time typed in Server Time on Raid day, at or after the Raid start
* Each Phase with Assignments gets a Raid Reminder

## Assignment
* Which Alliance takes which Objective, for one Phase or the whole Raid, with an optional short task
* An Alliance with an Assignment is *on the plan*

## Plan Confirmation
* An Alliance's acknowledgement that it has read the published Battle Plan: its R5, or an R4, presses "Read and confirmed" in `#kvk-leaders`
* One per Alliance per Raid; the first press counts. Alliances not on the plan are asked once too, and may confirm

## Plan Deadline
* A fixed number of hours before the Raid start (configuration). If no Battle Plan is published by then, Neil mentions the War Council in `#kvk-leaders`

## Confirmation Deadline
* A fixed number of hours before the Raid start (configuration), after the Plan Deadline. Then Neil gives the War Council the on-plan Alliances still without a Plan Confirmation

## Confirmation Chase
* Neil's mention, in `#kvk-leaders`, of the R5s and R4s of on-plan Alliances that haven't confirmed yet: 12 hours and 2 hours before the Confirmation Deadline
* Alliances not on the plan are never chased

## Raid Reminder
* Neil's message in an assigned Alliance's `alliance-chat`, mentioning its Members: 30 minutes before the Raid start, and at each Phase it is assigned to
* Each goes out at most once per Raid

## Availability Poll
* Neil's poll in an Alliance's `alliance-chat` asking which Members will fight in the Raid, and as what. Posted 72 hours before the Raid start in every Home Kingdom Alliance's `alliance-chat`; mentions nobody
* Only Linked Members holding that Alliance's role answer: Available, with a Fighter Class, or Not available. One answer per Member per Raid; the last one counts, and it can change until the Raid starts
* The card shows only counts. It closes at the Raid start, or when the Raid is cancelled; then the answers are deleted

## Availability Summary
* Neil's card in `#kvk-leaders`: per Alliance, the number of available Whales, Dolphins and Seals and their sum, Small Fry apart, and Not available; and a Kingdom total
* Updated after every answer. Counts only, never names

## Fighter Class
* How much a Player can carry in a Raid: **Whale** (heavy spender, very strong, T9/T10, leads charges and holds key Objectives), **Dolphin** (light spender or very active free player, T9, supports Whales, holds side Objectives), **Seal** (casual or free player, T8 and below, supports Dolphins and fills rallies), **Small Fry** (not part of the strategy)
* Chosen by the Member in the Availability Poll. Neil suggests the higher of the class their Troop Bracket reaches and the class their Might reaches; either is enough. The thresholds are in Neil's configuration (by default T10 or 150,000,000 Might for a Whale, T9 or 60,000,000 for a Dolphin, T7 or 20,000,000 for a Seal); an unknown Troop Bracket or Might counts as below every threshold
* Small Fry are asked too, but counted apart and left out of every strategy sum

# Onboarding

## Onboarding Interview
* The automated conversation Neil runs with a Member in a private thread, to learn which Player they are
* Ends with a Link, with a hand-off to an Officer, or abandoned (the Member left or stopped answering)
* A Member has at most one open Onboarding Interview

## In-game Proof
* Evidence that a Member controls a Player: the Member gives the Player's uid, read in the game from their own profile
* A Player Name is not In-game Proof; it only helps a Member find their uid
* Lookups (`/player`, `/alliance`) never show uids; only the Onboarding thread and the log channel do, so a uid is known mainly to its owner. Every Link is still logged for Officers to check

## Recommended Player
* The Player whose Player Name equals the Member's server display name with tags, prefixes and unsupported characters removed; offered at the start of an Onboarding Interview, without its uid
* When several Players share that name, the Member picks one of them from a list
* Not In-game Proof: a Member who says "that's me" still gives the uid, which must be that Player's

## Onboarding Role
* The Discord role a Member holds while they are not Linked, and after the Link until their Interview thread closes; it lets them see and write in `#onboarding`
* Neil gives it when a Member joins and when a Member still on the server is Unlinked, removes it when a Linked Member's Interview thread closes, and puts every Member right at startup
* Not a Managed Role; Neil creates it without permissions on first use

## Doctor Role
* The Discord role a Member holds while they are Linked, Guests included; it shows the Guest area
* A Member holding it is a Doctor
* Neil gives it at Link, removes it at Unlink, and puts every Member right at startup
* Not a Managed Role; Neil creates it without permissions on first use

## Preference
* An optional answer a Home Kingdom Member gives about themselves after the Link, or later with `/channels`: their Languages, Region, Interests and Experience
* Decides which channels they see; skipped questions give no Preference
* Kept when the Member becomes a Guest; forgotten at Unlink

## Preference Role
* The Discord role for one Preference (e.g. `Italian`, `Europe/Africa`, `PvP`, `Veteran`); it shows the matching channels
* Held only by Home Kingdom Members; Neil takes them off a Guest and gives them back on return
* Not a Managed Role; Neil creates it without permissions on first use and removes it at Unlink

## NaP discussions
* The Interest for talking about non-aggression pacts between Alliances, such as the NaP
* Offered only to a Member Linked to an R4; a Member Linked to an R5 gets it without asking; anyone else loses it
* Other Members see only the NaP publications

## Recruitment
* The Interest for talking about recruiting Players to the Kingdom's Alliances
* Shows the Recruitment channels: a general one and one per Region
* Offered to every Home Kingdom Member

## Link
* The confirmed pairing of one Member and one Player, made from In-game Proof and the Member's confirmation ("that's me"), or as an Officer Link
* A Member has at most one Link, and a Player at most one
* Ends with an Unlink; the Player can then be Linked again

## Officer Link
* A Link an Officer makes by hand from a uid, for a Member whose Onboarding Interview was handed off to the Officers
* Made without In-game Proof; logged with the Officer who made it

## Unlink
* Ends a Link: when the Linked Member leaves the server (seen live, at startup or in the Daily Sync), when an Officer Unlinks them, or when the Member Unlinks themselves
* Logs it for Officers, sends the Member a private message if Discord allows it, and hands Rank Approvals waiting on them to the Officers
* A Member still on the server also loses their Managed Roles and the nickname Neil gave them

## Rank Approval
* The confirmation of a Home Kingdom Member's Alliance Rank by hand, when the Game API lists no rank for them; a Guest is not asked about
* Given by the Member Linked to the Alliance's R5; if there is none, by an Officer; never by the Linked Member themselves
* An Officer may also give one at any time for a Linked Player in an Alliance; it replaces an earlier approved rank, and a rank from the Game API still replaces it
* Goes to the Officers when the chosen Member leaves
