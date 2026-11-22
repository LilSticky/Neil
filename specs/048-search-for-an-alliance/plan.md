# Plan: Search for an alliance

**Spec**: [spec.md](spec.md) · **Branch**: `048-search-for-an-alliance`

## Approach

No new endpoint: the Game API still has only the exact lookups (GAME-API.md). The search is Neil's own resolution of
one text into the cheapest exact request, filtered to one Kingdom.

1. **Domain** `src/domain/alliance-search.ts` (pure):
   - `parseAllianceSearch(text)`: `{ kind: "tag", tag }` when the trimmed text starts with `[TAG]` (a picked
     suggestion `[REB]` or a pasted `[REB] Rebirth`), else `{ kind: "text", key }`; invalid when empty, over 40
     characters, or an empty tag.
   - `exactKnownAlliance(text, known, kingdom, now)`: the Known Alliance of that Kingdom whose normalised tag or name
     equals the normalised text (tag first); undefined otherwise.
   - `matchesIn(matches, kingdom)`: the pickable ambiguous matches of that Kingdom.
2. **Autocomplete** `alliance-autocomplete.ts`: the focused option is `search`; read `kingdom` from the options typed so
   far (else the Home Kingdom) and filter the Known Alliances to it before matching. Value `[TAG]`, label
   `[TAG] Name`.
3. **Command** `commands.ts`: `/alliance search` (required, max 40, autocomplete) and `kingdom` (optional).
4. **Handler** `lookup.ts` `handleAlliance`, Kingdom K = option or Home Kingdom:
   - tag → `getAlliance(K, tag)`; not found → `allianceNotFound(tag, K)`.
   - text equal to a Known Alliance of K → `getAlliance(K, its tag)`.
   - otherwise `findAlliance(text)`: a found Alliance of K → card; of another Kingdom → nothing in K; ambiguous → the
     matches of K: one → `getAlliance(K, tag)` (second request), several → the existing pick list, none → nothing in K.
     Nothing in K → close Known Alliances of K (pick list) or `allianceSearchNotFound(text, K)`.
   - The old name/tag/kingdom mix messages go; `invalidAlliance` becomes "Give an alliance name or tag (up to 40
     characters)."
5. **Recording** `startup.ts`: the `onAllianceSeen` hook stores every Kingdom. `client.ts` (Game API): a fresh
   ambiguous Alliance name answer tells the hook of each match with Kingdom, tag and name.
6. City Rotation and NaP already filter Known Alliances to the Home Kingdom (`city-rotation.ts`, `nap.ts`,
   `nap-motions.ts`); a test pins it.

## Constitution check

- I/II: TDD per task (test-first → implementer). Domain stays pure.
- IV: only the rate-limited caching client; at most two requests per search; suggestions read storage only.
- Boundary validation: the search text through `parseAllianceSearch`, the Kingdom through `parseKingdom`.
- No schema change: `known_alliance` already keys by `(kingdom, tag)`.

## Docs

DICTIONARY (Known Alliance, done), GAME-API (name lookup matches tags across Kingdoms, 2026-11-22), ROADMAP row 048,
STATUS.
