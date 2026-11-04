# Bot review: slice 011 "Correct a link"

Reviewer: `bot-reviewer` (2026-11-02), diff `010-say-goodbye...011-correct-a-link` in `src/`.

## Must

- [x] M1 Unlink races with apply. In `src/discord/unlink.ts:55-58`, Neil takes the roles and nickname off first and
  only then deletes the Link (`links.unlink`). An apply that has already read the Link can run in that gap and put
  roles back on Discord: `approveRank` from /rank, `name-and-roles.ts:180-189` during `getPlayer`, `syncTo:215`,
  `applyTo:245`, or `onLinked`. Its `applied.record` then fails on the foreign key, so nothing tracks those roles any
  more. Fix: delete the Link first (read applied before), then take off; in `applyTo`/`syncTo`, check
  `links.linkFor(memberId)` again after the last await and before `applyNameAndRoles`.

## Should

- [x] S1 `src/discord/corrections.ts:299-326` confirmLink: the button is not acknowledged until after `isOnServer` (a
  REST fetch on a cache miss), `leaderPing` (another fetch) and the store. Under REST rate limiting this can take
  longer than Discord's 3 seconds. Fix: `deferUpdate()` first, then `editReply`/`followUp` (ephemeral) for a refusal.
- [x] S2 `src/domain/correction.ts:20` `mayCorrect` is unused; the handlers repeat its rules (`callerIsOfficer` plus
  the self check at `corrections.ts:251`, and `officerRank`). Fix: have the handlers call `mayCorrect`, or delete it.
- [x] S3 `corrections.ts:285-288`: the button checks only that the presser is the Officer who ran /link, not that they
  are still an Officer (the role can be lost within the 5 minutes). Fix: also check the presser's roles.

## Could

- [x] C1 `corrections.ts:276` handleLinkButton: a `link:` customId that does not parse is never answered ("interaction
  failed"). Fix: reply with `linkEndedReply()`.
- [x] C2 `corrections.ts:288`: the confirmation is removed before confirmLink; a refusal leaves the card with live
  buttons, which then say "ended". Fix: `update` the card to an ended state when refusing.
- [x] C3 `src/discord/commands.ts:78,86` (/rank, /link): no `setDefaultMemberPermissions`, so every Member sees the
  Officer-only commands. Handler checks are correct; least privilege only.
  Left open: visibility of Officer commands needs per-server permission overrides; handler checks stand.
- [x] C4 `src/storage/database.ts` migration 9: `linked_by TEXT` has no CHECK (snowflake or NULL); zod catches bad
  values on read. Fix: `CHECK (linked_by IS NULL OR linked_by GLOB '[0-9]*')`.

## Checked and clean

- **Slash commands:** /unlink, /rank and /link defer privately before any work; only an Officer may Unlink another
  Member; every refusal is a private reply.
- **Input validation:** rank is a fixed choice and passes `asApprovableRank`; uid is limited to 32 characters and
  passes `parseUid`; the member option is digits only.
- **Officer Link buttons:** customIds must be a strict UUID matching an in-memory confirmation; spoofed or old ids get
  "ended", other Officers get "not yours".
- **Transactions:** `rankByOfficer` runs in one transaction with no await between read and write; the Officer Link
  stores only while the Interview is still handed off (`saveIfStep("handed-off")` inside `confirm`), and a uid or
  Member conflict rolls back.
- **Unlink nickname:** cleared only while it is still the one Neil applied.
- **Game API:** only through `getPlayer(uid, "onboarding-interview")` (Quota Reserve).
- **Mentions and logs:** every new message sets `allowedMentions: { parse: [] }`; no secrets logged; migration 9 is
  additive and old rows read as In-game Proof.
