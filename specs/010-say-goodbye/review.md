# Bot review: slice 010 "Say goodbye"

Reviewer: `bot-reviewer` (2026-11-02), diff `009-keep-roles-in-sync...010-say-goodbye` in `src/`.

## Must

- [x] M1 `src/discord/interview.ts` leaveServer: when abandoning the Interview or cancelling the own Rank Approval
  throws (thread gone), the Unlink never runs; the Link survives until the next startup or Daily Sync. Fix: Unlink
  regardless (each earlier step guarded on its own, or Unlink in `finally`).

## Should

- [x] S1 `src/discord/unlink.ts` hand-on / `src/storage/link-store.ts` saveIfPending: two concurrent Unlinks of one
  Member (leave event during a sweep) can both hand on and ping the Officers twice. Fix: an atomic
  `handToOfficers` UPDATE `WHERE state='pending' AND approver_kind='member' AND approver_member_id=?`; post only when
  a row changed.
- [x] S2 `src/discord/name-and-roles.ts` startup sweep: one REST member fetch per Link, sequentially, and N errors on
  an outage. Fix: stop the sweep at the first fetch failure that is not Unknown Member (bulk fetch considered; kept
  per-Link for now, see fix notes).
- [x] S3 `src/discord/client.ts`: no `partials` (GuildMember, User), so `GuildMemberRemove` is not emitted for
  uncached Members. Fix: enable the partials.

## Could

- [x] C1 `src/discord/unlink.ts`: the private-message `catch` swallows every error. Fix: swallow only Discord code
  50007 (Cannot send messages to this user); log the rest.
- [x] C2 An apply racing an Unlink fails on the foreign key (applied → link) and is logged; harmless. Comment only.

## Checked and clean

Fetch failures other than Unknown Member never Unlink; `LinkStore.unlink` is transactional and idempotent; mentions are
safe; dictionary terms are used.
