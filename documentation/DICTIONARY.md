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
* Neil creates a missing Managed Role on first use; apart from the Onboarding Role, it never touches any other role

# Game

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

## Exile
* A Player the server's community has exiled for being malicious, on REAPER
* Added and removed only by a Member Linked to the R5 of a Home Kingdom Alliance, with a reason
* Who added an Exile is not shown to Members

## REAPER
* Roster of Exiled Antagonists, Pervs, Evildoers & Reprobates: the list of all Exiles
* Any Member may see it and find the closest Exiles to a position in the same Kingdom, or all of them by distance

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
* The Discord role a Member holds while they are not Linked; it lets them see and write in `#onboarding`
* Neil gives it when a Member joins and when a Member still on the server is Unlinked, removes it at Link, and puts every Member right at startup
* Not a Managed Role; Neil creates it without permissions on first use

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
* The confirmation of a Linked Player's Alliance Rank by hand, when the Game API lists no rank for them
* Given by the Member Linked to the Alliance's R5; if there is none, by an Officer; never by the Linked Member themselves
* An Officer may also give one at any time for a Linked Player in an Alliance; it replaces an earlier approved rank, and a rank from the Game API still replaces it
* Goes to the Officers when the chosen Member leaves
