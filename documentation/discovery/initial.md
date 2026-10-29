# Initial discovery (2026-10-29)

First domain discovery with the user, before slice 001. Source for the roadmap and the proposed
dictionary terms. Decisions here are the user's; open questions are listed at the end.

## What the user decided

- **Scope: a whole kingdom.** The Discord server serves every player of one Home Kingdom; players from
  other kingdoms are Guests.
- **Roles from in-game information**, all four:
  - alliance membership (one role per alliance of the Home Kingdom)
  - alliance rank R1–R5
  - kingdom (a role per kingdom, so Guests carry their kingdom)
  - power and/or sanctuary brackets
- **Identity is confirmed by the player uid**: the in-game player ID is public but obscure enough that
  knowing it counts as In-game Proof. The Member gives their uid, and Neil reads the Player with
  `GET /players/{uid}`. A name alone is not enough; it only helps the Member find their uid. (Decided
  2026-10-29.)
- **The interview runs in a private thread** that Neil opens per joiner in an onboarding channel, so it
  works with closed DMs and Officers can look in. (Decided 2026-10-29.)
- **Nickname format**: `[TAG|R5] Nickname | #331`
  - the alliance tag always (when the player has an alliance)
  - the rank only for R4 and R5
  - the kingdom number only for Guests (players from outside the Home Kingdom)
  - examples: `[NML] Rogue` (R1–R3, Home Kingdom), `[NML|R4] Rogue`, `[ABC] Rogue | #331` (Guest)

## Domain events (first cut)

Member joined → Onboarding Interview started (private thread) → uid given → Player found (or not found) →
Member confirmed "that's me" → Player linked → nickname and roles applied → (later) Player's profile changed → roles re-synced → Member left / Player unlinked.

## Invariants (first cut)

- A Member is linked to at most one Player; a Player to at most one Member.
- Neil only gives or removes roles from its managed allow-list.
- No alliance or rank role without a Link made from the Player's uid.
- Every API call fits the daily quota (1,000 per UTC day); interactive lookups keep a reserve.

## Proposed dictionary terms

Still proposed: the user decided on 2026-10-29 to confirm them later, when slice 002 needs them.

| Term | Proposed meaning |
|------|------------------|
| Kingdom | A game server, identified by its number (the API's `kid` / `{server}`) |
| Home Kingdom | The one Kingdom this Discord server is for |
| Guest | A Member whose Player is not in the Home Kingdom |
| Alliance | A group of Players in one Kingdom, with a tag and a name |
| Alliance Rank | R1–R5, a Player's rank in their Alliance |
| Power Bracket | A configured range of power (or sanctuary level) that maps to a role |
| Link | The confirmed pairing of a Member and a Player |
| In-game Proof | Evidence from inside the game that a Member controls a Player: knowing the Player's uid |
| Officer Review | An Officer approving or rejecting a Link (only if wanted, see open question 1) |
| Managed Role | A Discord role Neil may give and remove |

## Budget sketch

A kingdom may have dozens of alliances. One roster call returns a whole alliance, so a full kingdom sync
costs about one request per alliance. With 1,000 requests per day, e.g. 60 alliances synced every 6 hours
cost 240/day, leaving ~760 for interviews and lookups. The tracker refreshes data only every 10 minutes,
so our cache never needs to be shorter. Exact split: ADR 4.

## Open questions

1. **Officer Review on top of the uid?** Should Officers still approve Links (e.g. only for R4/R5 roles,
   or never)? And what if a uid is already linked to another Member?
2. **Alliance Rank in the API**: is it in the player's `ranks` field, or nowhere? If it is missing, ranks
   come from the Member's answer plus Officer Review. Settled by recording real responses in slice 002.
3. **Brackets**: power, sanctuary level, or both? Which ranges?
4. **Home Kingdom number** and which Discord roles exist today.
5. **Nickname longer than 32 characters** (Discord's limit): shorten the nickname part, keep tag and kingdom?
6. **How does a Member find their uid in the game?** Needed for the interview's help text (slice 004).
7. **Host**: Wispbyte or Pella (or another), which plan, and does its disk survive redeploys? (ADR 6, ADR 5)
8. **Patreon tier** for the API key: free 1,000/day or 2,000/day?
