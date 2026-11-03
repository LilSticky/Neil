# Research: Interview a new member

Decisions for slice 005. Sources: [spec.md](spec.md), [discovery.md](discovery.md),
[GAME-API.md](../../documentation/GAME-API.md), the slice 004 code (`src/game-api/client.ts`,
`src/discord/client.ts`, `src/storage/database.ts`, `src/config.ts`).

## R1: How the Member gives the uid

- **Decision**: a "Give my uid" button in the thread opens a modal with one short text input (≤ 32
  characters). The modal submit is the answer. Neil does not read thread messages.
- **Rationale**: reading messages needs the privileged Message Content intent (constitution V: least
  privilege). A modal also gives one clear answer per question, so "several messages quickly" cannot happen;
  a second submit while a request is in flight gets "one moment".
- **Alternatives**: typed messages (rejected: Message Content intent); a slash command in the thread
  (rejected: harder for new Members).

## R2: Intents and permissions

- **Decision**: intents `Guilds` + `GuildMembers` (privileged; "Server Members Intent" switched on in the
  Developer Portal, a manual step). Bot permissions in the onboarding channel: View Channel, Send Messages
  in Threads, Create Private Threads, Manage Threads (lock and archive); in the log channel: View Channel,
  Send Messages. Officers' roles get Manage Threads in the onboarding channel (spec clarification).
- **Rationale**: `guildMemberAdd` and `guildMemberRemove` need `GuildMembers`; nothing else is needed.
- **Alternatives**: polling the member list (rejected: needs the same intent).

## R3: Threads

- **Decision**: `channel.threads.create({ type: PrivateThread, invitable: false, name: "Interview – {username}",
  autoArchiveDuration: 1 week })`, then add the Member. Neil adds the approver (a Member) when it asks them;
  Officer role mentions reach Officers who can see the thread through Manage Threads. End: Linked (no pending
  Rank Approval) → archived; Rank Approval done or cancelled → archived; HandedOff → left open for the
  Officer; Abandoned → locked and archived.
- **Rationale**: private threads work with closed DMs and keep the channel tidy (discovery 2026-10-29).

## R4: Domain model: a pure state machine

- **Decision**: `src/domain/onboarding-interview.ts` holds the Interview as a discriminated union over its
  step and pure transition functions (`giveUid`, `uidChecked`, `confirm`, `reject`, `timeOut`, `memberLeft`,
  `quotaReset`) that take `now` and return the next Interview plus what happened (an event the adapter turns
  into Discord messages and log lines). Links and Rank Approvals are separate small modules.
- **Rationale**: constitution III; every scenario becomes a plain unit test.

## R5: Time: timeouts and quota resets

- **Decision**: each open Interview stores `dueAt`: the timeout (`lastAskedAt + timeout`) while waiting for the
  Member, or `resumesAt` (next 00:00 UTC) while paused. A sweeper in the Discord adapter runs once at ready and
  every 60 s, loads Interviews with `dueAt ≤ now` and applies `timeOut` or `quotaReset`. Asking again resets
  `lastAskedAt`, so a pause never counts toward the timeout.
- **Rationale**: no timers in the domain; survives restarts (FR-016) because the deadline is data.
- **Alternatives**: one `setTimeout` per Interview (rejected: lost on restart, many handles).

## R6: Storage and uniqueness

- **Decision**: migration 3 adds `onboarding_interview`, `link` and `rank_approval` (data-model.md). `link`
  has `UNIQUE(member_id)` and `UNIQUE(uid)`; confirming inserts the Link and ends the Interview in one
  transaction, so the second of two simultaneous confirmations fails on the constraint and is refused as
  already Linked (spec US2-4). `onboarding_interview` has a partial unique index on `member_id` for open
  steps (one open Interview per Member).
- **Rationale**: one process and synchronous `node:sqlite` serialise writes; the constraint is the final
  guard. ADR 5 already covers SQLite for Links and Interviews.

## R7: Game API use

- **Decision**: `getPlayer(uid, "onboarding-interview")`: one request per uid unless cached (FR-004). Results:
  `found` → show; `not-found`, `not-prepared` → failed attempt; `try-again`, `unavailable` → "try again
  shortly", no attempt; `quota-spent` → pause until `resetsAt`; `reserve-kept` and `ambiguous` cannot happen
  for this purpose and endpoint (treated as `unavailable` and logged). `PlayerAlliance` gains `leaderUid`
  read from the player body's `alliance.leader_id` (GAME-API.md, already in the recording).
- **Rationale**: no new endpoint; the leader comes in the same answer.

## R8: Who approves an unknown rank

- **Decision**: find the Link whose uid is the Alliance's `leaderUid`; if that Member is on the server
  (guild member fetch) and is not the Linked Member, ask them (mention + added to the thread); otherwise ask
  the Officers (mention of both Officer roles). Any Officer except the Linked Member may then approve; when a
  Member was asked, only that Member may.
- **Rationale**: spec FR-012/FR-013; no extra Game API request.

## R9: Command and custom ids

- **Decision**: `/interview` ("Start your Onboarding Interview"), no options, answered privately. Custom ids:
  `interview:uid:{interviewId}`, `interview:modal:{interviewId}`, `interview:confirm:{interviewId}`,
  `interview:reject:{interviewId}`, `rank:{approvalId}:{R1..R5}`. `client.ts` routes the `interview:` and
  `rank:` prefixes as it routes `pick:`.
- **Rationale**: ids carry the stored row's id, so buttons keep working after a restart; the owner check
  reads the row.

## R10: Configuration

- **Decision**: `DISCORD_ONBOARDING_CHANNEL_ID` and `DISCORD_LOG_CHANNEL_ID` (snowflakes, required),
  `INTERVIEW_TIMEOUT_MINUTES` (whole number ≥ 1, default 1440). At ready, Neil fetches both channels and checks
  type and its permissions; on a problem it logs which one and stops with exit code 1 (FR-018).
- **Rationale**: minutes let the test-server check use a short timeout.

## R11: Log channel

- **Decision**: one plain message per event (Link, refused uid, hand-off, abandoned, Rank Approval asked /
  given / cancelled); `allowedMentions` lists only the users or roles meant to be pinged (the Alliance
  leader's Member on a Link). Player Names and usernames are escaped.

## R12: Personal data

- **Decision**: ADR 7 records what is stored (Discord user ids, uid, rank and its source, approver id, thread
  id, times), that Links are kept until "Say goodbye" or "Correct a link" removes them, and that ended
  Interviews and Rank Approvals are deleted 90 days after they end (the sweeper does it).
- **Rationale**: constitution V.

## R13: Restart while checking

- **Decision**: an Interview stored as `checking` when Neil starts goes back to `awaiting-uid` without a
  failed attempt, and the Member is asked again.
