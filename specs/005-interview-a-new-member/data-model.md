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
