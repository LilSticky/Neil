# Dictionary

The ubiquitous language of Neil (constitution, principle I). Code, specs, tests, Discord texts and
commits use these terms. Terms change only with the user's approval (`dictionary` skill).

Entries marked *(proposed)* came from the initial roadmap and still need confirmation in domain
discovery.

# Server

## Member
* A person on the Discord server
* Not the same as a game alliance member; see Player

## Officer *(proposed)*
* A Member who manages other Members (approves, corrects roles); exact Discord roles to be discovered

# Game

## Player
* A character in Last Asylum: Plague, as the Game API describes it
* Identified by a player ID from the game

## Game API
* The external source of in-game information about Players

## Kingdom
* A game server, identified by its number
* A Player belongs to exactly one Kingdom

## Alliance
* A group of Players in one Kingdom, with a tag and a name
* Identified within its Kingdom by its tag (or name)

## Alliance Rank
* R1–R5, a Player's rank in their Alliance; R5 is the Alliance's leader
* Unknown when the Game API lists no rank for the Player

# Onboarding

## Onboarding Interview *(proposed)*
* The automated conversation the bot runs with a Member who joined, to learn who they are in the game
* Ends with the Member's nickname and roles set, or with a hand-off to an Officer
