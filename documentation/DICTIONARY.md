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
* A Member with the Moderator or King Discord role (both role IDs in configuration)
* Manages other Members: approves, corrects roles, sees the Daily Quota

## Managed Role
* A Discord role Neil may give and remove: the Alliance, Alliance Rank, Kingdom and Troop Bracket roles
* Neil creates a missing Managed Role on first use; it never touches any other role

# Game

## Player
* A character in Last Asylum: Plague, as the Game API describes it
* Identified by its uid, the player ID from the game

## Player Name
* A Player's in-game nickname
* Not unique: several Players, also in different Kingdoms, can share one; matched exactly, ignoring letter case

## Game API
* The external source of in-game information about Players

## Kingdom
* A game server, identified by its number
* A Player belongs to exactly one Kingdom

## Home Kingdom
* The one Kingdom this Discord server is for (330, in configuration)

## Guest
* A Member whose Linked Player is not in the Home Kingdom

## Troop Bracket
* The highest troop tier (T1–T10) a Player's sanctuary level unlocks; one role per tier
* The level table is configuration, so new tiers need no code change

## Alliance
* A group of Players in one Kingdom, with a tag and a name
* Identified within its Kingdom by its tag (or name)

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
* A Player's honor contribution to their Alliance today (Game API `daily_honor`)

## Daily Tech
* A Player's tech contribution to their Alliance today (Game API `daily_tech`)

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

## Daily Sync
* Neil's once-a-day re-check of every Linked Member against the Game API, which updates their nickname and Managed Roles
* Uses only the Sync Share

## Sync Share
* The part of the Daily Quota the Daily Sync may use (500, configuration); lookups and the Quota Reserve are never used by it

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

## Link
* The confirmed pairing of one Member and one Player, made from In-game Proof and the Member's confirmation ("that's me")
* A Member has at most one Link, and a Player at most one

## Rank Approval
* The confirmation of a Linked Player's Alliance Rank by hand, when the Game API lists no rank for them
* Given by the Member Linked to the Alliance's R5; if there is none, by an Officer; never by the Linked Member themselves
