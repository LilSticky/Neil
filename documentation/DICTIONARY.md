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

## Alliance
* A group of Players in one Kingdom, with a tag and a name
* Identified within its Kingdom by its tag (or name)

## Alliance Roster
* The list of an Alliance's Players, each with uid, Player Name and Alliance Rank, as the Game API reports it

## Alliance Rank
* R1–R5, a Player's rank in their Alliance; R5 is the Alliance's leader
* Unknown when the Game API lists no rank for the Player

## Daily Quota
* The number of Game API requests Neil may make per UTC day; the limit is what the Game API reports
* Every request counts, failed ones too; resets at 00:00 UTC

## Quota Reserve
* The part of the Daily Quota that only Onboarding Interviews may use (from slice 004)

# Onboarding

## Onboarding Interview
* The automated conversation Neil runs with a Member in a private thread, to learn which Player they are
* Ends with a Link, with a hand-off to an Officer, or abandoned (the Member left or stopped answering)
* A Member has at most one open Onboarding Interview

## In-game Proof
* Evidence that a Member controls a Player: the Member gives the Player's uid, read in the game from their own profile
* A Player Name is not In-game Proof; it only helps a Member find their uid
* Weak on its own: `/alliance` shows uids to every Member, so every Link is logged for Officers to check

## Link
* The confirmed pairing of one Member and one Player, made from In-game Proof and the Member's confirmation ("that's me")
* A Member has at most one Link, and a Player at most one

## Rank Approval
* The confirmation of a Linked Player's Alliance Rank by hand, when the Game API lists no rank for them
* Given by the Member Linked to the Alliance's R5; if there is none, by an Officer; never by the Linked Member themselves
