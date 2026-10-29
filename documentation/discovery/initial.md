# Initial discovery (2026-10-29)

First domain discovery with the user, before slice 001. Source for the roadmap and the proposed
dictionary terms. Decisions here are the user's; open questions are listed at the end.

## What the user decided

- **Scope: a whole kingdom.** The Discord server serves every player of one Home Kingdom; players from
  other kingdoms are Guests. The Home Kingdom is **330**, set in configuration (`HOME_KINGDOM`), never
  hard-coded. (Decided 2026-10-29.)
- **Roles from in-game information**, all four:
  - alliance membership (one role per alliance of the Home Kingdom)
  - alliance rank R1–R5
  - kingdom (a role per kingdom, so Guests carry their kingdom)
  - troop brackets: by sanctuary level, grouped by the highest troop tier that level can train
    (see [Troop brackets](#troop-brackets))
- **Identity is confirmed by the player uid**: the in-game player ID is public but obscure enough that
  knowing it counts as In-game Proof. The Member gives their uid, and Neil reads the Player with
  `GET /players/{uid}`. A name alone is not enough; it only helps the Member find their uid. (Decided
  2026-10-29.)
- **The interview runs in a private thread** that Neil opens per joiner in an onboarding channel, so it
  works with closed DMs and Officers can look in. (Decided 2026-10-29.)
- **A uid that is already linked** to another Member is refused with an error to the Member.
  (Decided 2026-10-29.)
- **The rank comes from the API** (`rank_label` in the alliance roster, see [GAME-API.md](../GAME-API.md)).
  **If the API has no rank** for the Player, the R5 of that Player's Alliance approves the rank by hand.
  If that Alliance has no R5 on Discord yet, anyone with the **Moderator** or **King** Discord role
  approves instead (both role IDs in configuration). No other Officer Review is needed. (Decided
  2026-10-29.)
- **Finding the uid in the game** (help text for the interview): open your profile by tapping the
  profile picture in the top left, then tap the feather next to your name (as if to edit it). The number
  below the profile picture is your uid; copy it with the button next to it.
- **Nickname format**: `[TAG|R5] Nickname | #331`
  - the alliance tag always (when the player has an alliance)
  - the rank only for R4 and R5
  - the kingdom number only for Guests (players from outside the Home Kingdom)
  - examples: `[NML] Rogue` (R1–R3, Home Kingdom), `[NML|R4] Rogue`, `[ABC] Rogue | #331` (Guest)
  - longer than Discord's 32 characters: the in-game name is cut; tag, rank and kingdom stay whole.
    (Decided 2026-10-29.)

## Troop brackets

One role per troop tier: a Player's bracket is the highest tier their sanctuary level (`lv`) unlocks.
Unlock levels from the game (given by the user, 2026-10-29); the table is configuration, so new tiers need
no code change.

| Bracket | Sanctuary level |
|---------|-----------------|
| T1 | 1–2 |
| T2 | 3–5 |
| T3 | 6–9 |
| T4 | 10–13 |
| T5 | 14–16 |
| T6 | 17–19 |
| T7 | 20–23 |
| T8 | 24–26 |
| T9 | 27–29 |
| T10 | 30 and up |

Note: the user first wrote "27–30 → T9"; the unlock table puts T10 at 30, so 30 is T10 here.

## Domain events (first cut)

Member joined → Onboarding Interview started (private thread) → uid given → Player found (or not found,
or already linked → refused) → Member confirmed "that's me" → Player linked → (rank unknown → R5 asked →
rank approved) → nickname and roles applied → (later) Player's profile changed → roles re-synced → Member left / Player unlinked.

## Invariants (first cut)

- A Member is linked to at most one Player; a Player to at most one Member.
- Neil only gives or removes roles from its managed allow-list.
- No alliance or rank role without a Link made from the Player's uid.
- No rank role without a rank from the API or a Rank Approval (R5, else Moderator or King).
- Every API call fits the daily quota (2,000 per UTC day, patron key); interactive lookups keep a reserve.

## Proposed dictionary terms

Kingdom, Alliance and Alliance Rank were confirmed on 2026-10-29 for slice 002 (see DICTIONARY.md); the rest are still proposed.

| Term | Proposed meaning |
|------|------------------|
| Kingdom | A game server, identified by its number (the API's `kid` / `{server}`) |
| Home Kingdom | The one Kingdom this Discord server is for |
| Guest | A Member whose Player is not in the Home Kingdom |
| Alliance | A group of Players in one Kingdom, with a tag and a name |
| Alliance Rank | R1–R5, a Player's rank in their Alliance |
| Troop Bracket | The highest troop tier (T1–T10) a Player's sanctuary level unlocks; one role per tier |
| Link | The confirmed pairing of a Member and a Player |
| In-game Proof | Evidence from inside the game that a Member controls a Player: knowing the Player's uid |
| Rank Approval | The R5 of an Alliance (else a Moderator or King) confirming a Player's Alliance Rank when the API has none |
| Managed Role | A Discord role Neil may give and remove |

## Budget sketch

A kingdom may have dozens of alliances. One roster call returns a whole alliance, so a full kingdom sync
costs about one request per alliance. With 2,000 requests per day, e.g. 60 alliances synced every 6 hours
cost 240/day, leaving ~1,760 for interviews and lookups. The tracker refreshes data only every 10 minutes,
so our cache never needs to be shorter. Exact split: ADR 4.

## Open questions

1. **Which Discord roles exist today** on the server (alliance, rank, kingdom, Moderator, King), and
   which of them Neil may manage. Needed by slice 005.
2. **Wispbyte plan**: does its disk survive redeploys and restarts (ADR 5)? Checked in slice 001.
