# Research: Look up a player

Phase 0 of the plan. Each entry: decision, rationale, alternatives.

## R1. What the Game API actually did on 2026-10-29 (fixture attempt)

**Findings** (15:48–15:53 UTC, our key):

- `GET /players/145563254785` and `GET /alliances/1/NML` both answered **504 after ~45 s**, three times,
  with a Cloudflare plain-text body `error code: 504` (not JSON, no `X-RateLimit-*` headers).
- `GET /alliances/1/ZZZQX` answered **404 at once** with JSON `{"detail":"alliance_not_found"}` and no
  `X-RateLimit-*` headers.
- `GET /quota` answered 200 in 0.2 s with headers `x-ratelimit-limit: 1000`,
  `x-ratelimit-remaining: 990`, `x-ratelimit-reset: 00:00 UTC`, and `"patron": false`. The failed calls
  above were counted (`used: 10`).

**Consequences**:

- Error bodies are not reliably JSON: map by status code first, read `detail` only when it parses.
- The tracker can hang for 45 s; we must give up much sooner (R3).
- The key is **not yet a patron key** on the tracker's side (limit 1,000). Recorded in `GAME-API.md`;
  slice 003 budgets with whatever `x-ratelimit-limit` says, not a constant.
- **Player and alliance fixtures could not be recorded.** Task T001 records them with
  `scripts/record-fixtures.ts` once the tracker answers; implementation tasks that need them wait for it.
  The schemas are written from the verified field lists in `GAME-API.md` and checked against the
  recordings when they exist.

## R2. Shape of the Game API client

**Decision**: one class `GameApiClient` in `src/game-api/client.ts` with `getPlayer(uid)` and
`getAlliance(kingdom, allianceKey)`. It takes the key, the base URL, a `fetch` function and a timeout in
its constructor, sends `Authorization: Bearer …` and `User-Agent: Neil/<version> (+https://github.com/LilSticky/Neil)`,
validates every 200 body with zod (`src/game-api/schemas.ts`), and returns a typed result
(`LookupResult`, see [data-model.md](data-model.md)); it never throws for an API failure.

**Rationale**: an injected `fetch` lets tests replay recorded fixtures without the network
(constitution II); one class is the single gateway constitution IV requires, so slice 003 adds the cache
and quota counter inside it without touching callers.

**Alternatives**: a generic HTTP wrapper plus per-endpoint functions (rejected: callers could bypass the
future cache); an SDK (none exists).

## R3. Timeout and retries

**Decision**: abort each request after **15 s** (`AbortSignal.timeout`), map it to "try again", no
retries in this slice. *(Was 8 s; raised after the test-server check, R11.)*

**Rationale**: SC-001 asks for an answer within 20 s; R1 showed the tracker can hang for 45 s. Retrying
would multiply quota spend and wait time; ADR 4's capped backoff for 503/504 belongs with the quota
budget in slice 003. With no retries there is no tight loop (constitution IV).

**Alternatives**: wait up to Discord's 15-minute deferred window (rejected: the Member stares at
"thinking…"); retry once (deferred to 003).

## R4. Public card, private errors

**Decision**: validate the options first; invalid input gets an **ephemeral** reply at once (no Game API
call). Valid input: `deferReply()` (public), ask the client, then `editReply({ embeds: [card] })` on
success; on failure `deleteReply()` and `followUp({ content, flags: Ephemeral })`.

**Rationale**: Discord fixes a reply's visibility at the first response, so a public deferral cannot
become private; deleting the "thinking…" placeholder and following up privately is the documented
pattern. Deferring is required because the client may take up to 15 s, beyond the 3-second window.

**Alternatives**: always ephemeral (rejected by the user, spec clarifications); public errors (rejected:
spec FR-007).

## R5. Escaping and mentions

**Decision**: every text from the Game API goes through discord.js `escapeMarkdown` before it is put in
an embed, and every reply sets `allowedMentions: { parse: [] }`.

**Rationale**: player names are user-chosen text (spec edge cases, FR-012). Embeds do not ping, but the
ephemeral follow-ups and future plain-text replies might; setting it everywhere is cheap.

## R6. Alliance Rank

**Decision**: the rank comes from the Player's row in `alliance_members[]` (`rank_label` `R1`–`R5`);
`null`, a missing row or any other label gives `unknown`. `ranks` is ignored. Pure function in
`src/domain/alliance-rank.ts`.

**Rationale**: `GAME-API.md` ("Rank"); spec FR-005.

## R7. Configuration

**Decision**: `LAP_TRACKER_API_KEY` becomes required (non-empty) and is added to the redacted secrets.
`HOME_KINGDOM` stays unread until a slice needs it. The base URL and the timeout are constants in the
client, not settings.

**Rationale**: smallest change; nothing in this slice varies them per environment.

## R8. Input validation

**Decision**: uid = 1–20 digits after trimming (the sample uid has 12); Kingdom = whole number 1–9999
(Discord integer option with `min_value: 1`, re-checked in the domain); alliance key = 1–40 characters
after trimming, URL-encoded with `encodeURIComponent`. The uid is a string option, not an integer, because
uids exceed JavaScript's safe integer range in principle and Discord integers stop at 2^53.

**Alternatives**: integer option for the uid (rejected: precision, and "letters" must get a helpful
message rather than Discord's generic error).

## R10. Later recordings (2026-10-29, 16:50 UTC)

The tracker answered again: player and alliance fixtures recorded (trimmed, see
`src/game-api/__fixtures__/README.md`). `quota` is in every body; `uid`/`kid`/`aid` are JSON numbers;
`GET /players/1` gave **502**, and `GET /alliances/1/No%20Man's%20Land` gave **404**, so `/alliance`
asks for the tag only.

## R11. Unknown uids (test-server check, 2026-10-29)

**Finding**: `/player uid:1` timed out at 8 s. Measured: `GET /players/1` and `/players/999999999999` both
answer **502 `error code: 502` after ~10.2 s**; no 404 for a player has been seen.

**Decision** (user, 2026-10-29): timeout 15 s; the client returns a separate `not-prepared` result for
502 (the documented "profile could not be prepared"); `/player` shows a hedged text (uid may be wrong,
or the tracker busy), `/alliance` keeps "try again".

**Alternatives**: treat 502 as not found (rejected: wrong during a real outage); keep 8 s and hedge the
timeout (rejected: Neil would never see the tracker's answer).

## R9. Is the 409 "more than one match" reachable?

**Finding**: documented only for name lookups; the verified alliance endpoint may return it for a name
shared by two alliances. **Decision**: map it anyway (`ambiguous` with `matches`), validated leniently
(each match: optional `uid`, `server`, `tag`, `name`); covered by a hand-written fixture marked as such.
