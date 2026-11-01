# Data model: Interview a new member

Terms: [DICTIONARY.md](../../documentation/DICTIONARY.md). Decisions: [research.md](research.md).

## Domain (`src/domain/`)

### Onboarding Interview (`onboarding-interview.ts`)

```text
OnboardingInterview =
  | { step: "awaiting-uid",          id, memberId, threadId, failedAttempts, startedAt, lastAskedAt }
  | { step: "checking",              id, memberId, threadId, failedAttempts, startedAt, lastAskedAt, uid }
  | { step: "awaiting-confirmation", id, memberId, threadId, failedAttempts, startedAt, lastAskedAt, player }
  | { step: "paused-for-quota",      id, memberId, threadId, failedAttempts, startedAt, resumesAt }
  | { step: "linked",                id, memberId, threadId, failedAttempts, startedAt, endedAt, uid }
  | { step: "handed-off",            id, memberId, threadId, failedAttempts, startedAt, endedAt }
  | { step: "abandoned",             id, memberId, threadId, failedAttempts, startedAt, endedAt, reason: "left" | "timed-out" }
```

- `failedAttempts`: 0–4 while open; the 5th failure hands off (`MAX_FAILED_ATTEMPTS = 5`).
- `dueAt(interview, timeout)`: `lastAskedAt + timeout` for `awaiting-uid` and `awaiting-confirmation`,
  `resumesAt` for `paused-for-quota`, none otherwise.

| From | Event | To | Failed attempt |
|------|-------|----|----------------|
| (none) | started | awaiting-uid | – |
| awaiting-uid | uid given (valid) | checking | – |
| awaiting-uid | uid given (malformed) | awaiting-uid | no |
| checking | player found | awaiting-confirmation | – |
| checking | not found / not prepared | awaiting-uid or handed-off | yes |
| checking | already Linked (to someone else) | awaiting-uid or handed-off | yes |
| checking | unavailable / try again | awaiting-uid | no |
| checking | quota spent | paused-for-quota | no |
| awaiting-confirmation | confirmed, Link made | linked | – |
| awaiting-confirmation | confirmed, already Linked | awaiting-uid or handed-off | yes |
| awaiting-confirmation | rejected ("That's not me") | awaiting-uid or handed-off | yes |
| paused-for-quota | quota reset | awaiting-uid (lastAskedAt = now) | – |
| awaiting-uid, awaiting-confirmation | timed out | abandoned (timed-out) | – |
| any open step | member left | abandoned (left) | – |
| checking (at startup) | restarted | awaiting-uid | no |

Ended steps accept no event (a button press gets "this Interview has ended").

### Link (`link.ts`)

```text
Link = { memberId, uid, linkedAt, allianceRank: RankOnLink }
RankOnLink =
  | { source: "game-api", rank: "R1".."R5" }
  | { source: "rank-approval", rank: "R1".."R5", approvedBy: MemberId, approvedAt }
  | { source: "unknown" }      // in an Alliance, Game API lists no rank; Rank Approval pending or cancelled
  | { source: "no-alliance" }  // Player in no Alliance: no Alliance Rank
```

- At most one Link per Member and per uid (store constraints).

### Rank Approval (`rank-approval.ts`)

```text
RankApproval =
  | { state: "pending",   id, linkedMemberId, threadId, approver: Approver, askedAt }
  | { state: "approved",  id, linkedMemberId, threadId, approver, askedAt, rank, approvedBy, approvedAt }
  | { state: "cancelled", id, linkedMemberId, threadId, approver, askedAt, cancelledAt }
Approver = { kind: "member", memberId } | { kind: "officers" }
```

- `chooseApprover(leaderMemberOnServer: MemberId | undefined, linkedMemberId)`: the leader's Member unless
  missing or the Linked Member, else officers.
- `mayApprove(approval, pressedBy, isOfficer)`: pending, `pressedBy ≠ linkedMemberId`, and either
  `approver.memberId = pressedBy` or (`approver.kind = "officers"` and `isOfficer`).

### Player change

- `PlayerAlliance` gains `leaderUid: Uid | undefined` (from `alliance.leader_id`).

## Storage (`src/storage/`, migration 3)

```sql
CREATE TABLE onboarding_interview (
  id INTEGER PRIMARY KEY,
  member_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  step TEXT NOT NULL,            -- one of the seven steps
  failed_attempts INTEGER NOT NULL CHECK (failed_attempts BETWEEN 0 AND 5),
  uid TEXT,                      -- checking, linked; and the shown Player's uid in awaiting-confirmation
  player_json TEXT,              -- awaiting-confirmation: the Player shown
  started_at TEXT NOT NULL,
  last_asked_at TEXT,
  resumes_at TEXT,
  ended_at TEXT,
  end_reason TEXT,
  due_at TEXT                    -- indexed; the sweeper's query
);
CREATE UNIQUE INDEX one_open_interview ON onboarding_interview (member_id)
  WHERE step IN ('awaiting-uid', 'checking', 'awaiting-confirmation', 'paused-for-quota');

CREATE TABLE link (
  member_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  linked_at TEXT NOT NULL,
  rank_source TEXT NOT NULL,     -- game-api | rank-approval | unknown | no-alliance
  alliance_rank TEXT,            -- R1–R5 or NULL
  approved_by TEXT,
  approved_at TEXT
);

CREATE TABLE rank_approval (
  id INTEGER PRIMARY KEY,
  linked_member_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  approver_kind TEXT NOT NULL,   -- member | officers
  approver_member_id TEXT,
  state TEXT NOT NULL,           -- pending | approved | cancelled
  rank TEXT,
  approved_by TEXT,
  asked_at TEXT NOT NULL,
  ended_at TEXT
);
```

- Every row read is validated (zod) into the domain types; a corrupt row is logged and skipped by the
  sweeper, and answered with "something went wrong, ask an Officer" on a button.
- Confirming (insert `link`, update `onboarding_interview`, maybe insert `rank_approval`) is one transaction.
- Ended Interviews and Rank Approvals are deleted 90 days after `ended_at` (ADR 7).

## Addendum 2026-11-01: Recommended Player (US6) and lookups without uids (US7)

### Cleaning the display name (`src/domain/recommended-player.ts`)

`cleanDisplayName(displayName: string): PlayerName | undefined`, in this order:

1. Remove bracketed parts with their brackets: `[...]`, `(...)`, `{...}`, `<...>`, `【...】`.
2. Cut at the first `|` and keep the part before it; if that part is empty, keep the part after the first
   `|` up to the next one (e.g. `| drlol | #331` gives `drlol`).
3. Remove every character that is not a letter (`\p{L}`), a digit (`\p{N}`), a space, `_`, `-` or `.`.
4. Collapse runs of spaces, trim; strip leading and trailing `-`, `.`, `_`.
5. Empty or longer than 32 characters → `undefined` (no lookup); else the Player Name.

Examples: `[NML|R5] drlol | #331` → `drlol`; `(R4) Dr Lol` → `Dr Lol`; `🔥drlol🔥` → `drlol`; `|||` → undefined.

### New Interview steps

```text
  | { step: "recommending",            ..., lastAskedAt }                       // name lookup in flight
  | { step: "awaiting-recommendation", ..., lastAskedAt, recommended: Player }  // one match, shown without uid
  | { step: "awaiting-pick",           ..., lastAskedAt, matches: PlayerMatch[] } // 2+ matches: uid, name, kingdom
  | { step: "awaiting-uid",            ..., lastAskedAt, chosen?: Chosen }      // chosen: after "That's me" or a pick
Chosen = { uid: Uid, player: Player | undefined }  // player known for a single match, undefined for a pick
```

| From | Event | To | Failed attempt |
|------|-------|----|----------------|
| (none) | started | recommending | – |
| recommending | none (no match, empty name, only match Linked, unavailable, quota spent) | awaiting-uid | no |
| recommending | one Player | awaiting-recommendation | – |
| recommending | several matches | awaiting-pick | – |
| awaiting-recommendation | accepted ("That's me") | awaiting-uid with chosen {uid, player} | – |
| awaiting-pick | picked match i | awaiting-uid with chosen {uid, undefined} | – |
| awaiting-recommendation, awaiting-pick | declined ("That's not me", "None of these") | awaiting-uid | no |
| awaiting-uid with chosen.player, uid = chosen.uid | uid given | awaiting-confirmation with chosen.player, `confirmedByChoice: true`; the adapter confirms at once (no Game API request) | – |
| awaiting-uid with chosen, uid = chosen.uid, no player | uid given → checking → found | awaiting-confirmation with `confirmedByChoice: true`; the adapter confirms at once | – |
| awaiting-uid with chosen, other uid | uid given | as without chosen (chosen dropped) | – |
| recommending (at startup) | restarted | awaiting-uid | no |
| awaiting-recommendation, awaiting-pick | timed out / member left | abandoned | – |

- `dueAt`: `lastAskedAt + timeout` also for `awaiting-recommendation` and `awaiting-pick`; none for `recommending`.
- A pick list holds at most 25 matches (one select menu); more are cut.

### Storage (migration 4)

- `onboarding_interview` gains `chosen_uid TEXT`, `chosen_player_json TEXT`, `matches_json TEXT`;
  `player_json` also holds the Recommended Player in `awaiting-recommendation`.
- `one_open_interview` is recreated to include `recommending`, `awaiting-recommendation`, `awaiting-pick`.
