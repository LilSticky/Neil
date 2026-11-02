# Discovery: Correct a link (slice 011, 2026-11-02)

ROADMAP "Later": *Officers relink, unlink or override a Member; a Member asks for a re-check.* Stacked on 010
"Say goodbye". Everything below is a proposal until the user answers the questions at the end.

## 1. What exists today

| Need | Today | Source |
|------|-------|--------|
| A Member redoes their Link | Not possible. `/interview` refuses a Linked Member ("already Linked, to which Player") | specs/005 FR-002, US4 AS3 |
| Re-check a Member against the game | The Daily Sync re-checks every Linked Member once a day (nickname, Managed Roles, Alliance Rank). There is no on-demand re-check | specs/009 |
| End a Link | Only Unlink when a Member leaves (live, at startup, in the Daily Sync). DICTIONARY defines Unlink as that alone | specs/010, DICTIONARY "Unlink" |
| Officer makes a Link by hand | Forbidden in 005 ("Correct a link" is named as the remedy). A handed-off Interview ends with the Member running `/interview` again | specs/005 FR-008, Clarifications |
| A wrong Member holds someone's uid | The real owner is refused ("already Linked"). Officers see the refusal in the log but have nothing to act with | specs/005 US2 AS1, Clarification 1 |
| Rank wrong or missing | Rank Approval only when the Link is made and the rank is unknown. A wrong approval can't be corrected. After an Alliance move with the rank unknown, the Daily Sync logs "Officers check" but starts no new Rank Approval | specs/005 US3, specs/009 US1 AS7, FR-007 |
| Player no longer found by uid | The Daily Sync logs it and keeps the Link ("cleanup is Correct a link") | specs/009 Edge Cases |
| Officer check | `isOfficer` (Moderator or King role IDs) | src/domain/officer.ts |
| Commands | `/ping`, `/player`, `/alliance`, `/quota`, `/interview`. None for Officers to change a Link | src/discord/commands.ts |

Difference from a leave: when a Member leaves, Discord removes their roles and nickname (010 Assumptions). When an
Officer Unlinks a Member who is still on the server, Discord removes nothing, so Neil would have to remove the
Managed Roles and the nickname itself.

## 2. Candidate capabilities

| # | Capability | Rationale | Must / cut |
|---|-----------|-----------|------------|
| C1 | **An Officer Unlinks a Member** who is still on the server | The remedy 005 points to for a wrong Link or a disputed uid. It frees the uid for its real owner, and it cleans up Links whose Player is no longer found (009) | Must |
| C2 | **An Officer corrects a Member's Alliance Rank** (a Rank Approval from an Officer at any time) | Fixes a wrong approval, and the case 009 flags where a Player moved Alliance and the rank is unknown | Must, if Q3 = a |
| C3 | **A Member re-checks their own Link now** | Saves waiting up to 24h after a promotion. The Daily Sync already covers this, so it's a convenience | Cut (Q4) |
| C4 | **An Officer Links a Member by hand** | Helps handed-off Interviews. It bypasses In-game Proof and changes the meaning of Link | Cut (Q2). C1 plus `/interview` covers relinking |
| C5 | **A Member Unlinks themselves** | Switching main account. Rare, and an Officer can do it through C1 | Cut (Q5) |
| C6 | Officer pins nickname or roles | Means Neil no longer owns its Managed Roles, which conflicts with 009 FR-003 | Cut |

Relink = C1 (on the wrong holder, if needed) followed by the Member's `/interview`. That needs no new concept.

### Invariants to keep (proposed)

- A Member has at most one Link, and a Player at most one (unchanged).
- Only an Officer can Unlink a Member who is still on the server. An Officer-Unlink of a Member without a Link does nothing (idempotent, like 010 FR-006).
- An Officer can't correct the Alliance Rank on their own Link (same as Rank Approval: "never by the Linked Member themselves").
- Every correction is logged with the Officer who made it.
- After an Unlink, nothing from the old Link remains: no Managed Roles, no Neil nickname, no applied state. Pending Rank Approvals on the Link are cancelled, and the ones waiting on the Member go to the Officers (as in 010).
- Unlink makes no Game API request (010 FR-007). A rank correction makes none either.

### Domain events (proposed)

Officer Unlinked a Member → Managed Roles and nickname removed → Member told privately → log line.
Officer corrected an Alliance Rank → rank stored on the Link with Officer and time → name and roles re-applied → log line.
(If C3 stays: Member asked for a re-check → Player read → name and roles applied → log line if changed.)

### Aggregate

**Link** guards both rules: who may end it or change its rank, and that a Member and a Player each have at most one Link.
Rank Approval stays on the Link, as today.

## 3. Proposed dictionary changes (not applied)

- **Unlink** (changed): "Ends a Link: when a Linked Member leaves the server (seen live, at startup or in the Daily Sync), or when an Officer Unlinks them. Logs it for Officers, sends the Member a private message if Discord allows it, and hands Rank Approvals waiting on them to the Officers. A Member who stays on the server also loses their Managed Roles and the nickname Neil gave them."
- **Link** (changed, small): "Ends with an Unlink; the Player can then be Linked again." (drop "the Member's")
- **Rank Approval** (changed, if Q3 = a): add "An Officer may also give one at any time for a Linked Player in an Alliance, which replaces an earlier approved rank." Prefer this over a new term "Rank Override", so the same concept doesn't get two names.
- **Re-check** (new, only if C3 stays): "A one-Member Daily Sync that a Member asks for between Daily Syncs; uses the lookup share, never the Quota Reserve."
- **Officer Link** (new, only if Q2 = b/c): "A Link an Officer makes by hand from a uid, without In-game Proof; logged with the Officer." It would also change Link's "made from In-game Proof".
- Avoid "override" and "relink" as terms. "Override" could mean three different things (Q3). "Relink" is just Unlink followed by a Link.

## 4. Open questions

1. When an Officer Unlinks a Member who is still on the server, what happens to their name and roles?
2. May an Officer Link a Member to a Player by hand ("relink")?
3. What does "override a Member" mean?
4. A Member asks for a re-check: in this slice or not?
5. May a Member end their own Link?

## 5. Answers (user, 2026-11-02)

1. **Unlink by an Officer**: Neil removes the Managed Roles and the nickname it set and tells the Member privately; no
   Interview starts by itself, the Member may run `/interview` again.
2. **Relink**: an Officer may Link a Member by hand **only after a hand-off** (the Member's Onboarding Interview was
   handed to the Officers). New term **Officer Link**; no In-game Proof, logged with the Officer.
3. **Override** = an Officer gives a Rank Approval at any time (C2). The Daily Sync keeps it while the Game API has no
   rank; a rank from the Game API still replaces it. "Override" stays out of the dictionary.
4. **Re-check by a Member**: cut (C3); the Daily Sync covers it.
5. **Self-Unlink**: yes, a Member may Unlink themselves with a command (C5 is in), then run `/interview`.

Slice scope: C1 (Officer Unlinks), C2 (Officer corrects a rank), C4 restricted to handed-off Interviews (Officer Link),
C5 (Member Unlinks themselves). Cut: C3, C6.
