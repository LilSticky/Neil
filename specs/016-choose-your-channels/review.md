# Review: slice 016, Choose your channels (T013)

`bot-reviewer` on `git diff origin/main...HEAD -- src scripts`, 2026-11-04. Paths are under `src/`.

## Must

- **M1** `discord/preferences.ts:41-60`: `apply` reads the Member's roles, then gives and takes off over several awaits. A
  concurrent `forget` (Unlink), a Daily Sync demotion or a second press can finish in between, so a role that should be
  gone (NaP discussions included) is given after it was taken off. Fix: run `apply`/`forget` one after another per
  Member (a promise chain), and take the rank from the stored Link at run time.
- **M2** `discord/rank-approval.ts:80-82`: an approval deletes the thread while the Preferences message is still open
  there (FR-009). Fix: keep the thread while a prompt is open; Done or the sweeper deletes it.

## Should

- **S1** `discord/preferences-choices.ts:74-96`: an unknown custom ID, or a failure before the interaction is answered,
  is only logged, so Discord shows "interaction failed". Fix: answer privately with an error when nothing was answered.
- **S2** `discord/unlink.ts:77` with `storage/preference-store.ts:147`: `forget` deletes the prompt row but not its thread;
  an Unlink before Done (no Rank Approval pending) leaves the thread for good. Fix: delete the prompt's thread at Unlink.
- **S3** `discord/preferences-choices.ts:131-133`, `discord/interview-sweeper.ts:165-167`: the prompt is closed before
  the thread is deleted, so a failed delete is never retried. Fix: delete first, then close.
- **S4** `discord/member-roles.ts:140,148`: `giveNamedRole`/`takeOffNamedRole` pass no Officer role IDs, so an Officer
  role named like a Preference Role (e.g. `Veteran`) could be given or taken. Fix: pass the configured Officer role IDs.
- **S5** `discord/preferences.ts:49-50`: role changes from the Daily Sync or a Rank Approval (NaP discussions taken off)
  get no log line. Fix: log one line with what was given and taken off, when not empty.

## Could

- **C1** `storage/database.ts`: the new tables have no CHECK on `member_id`/`kind`, unlike migration 10. Not taken: the
  store already drops unknown values on read and its tests insert them on purpose; a snowflake CHECK on `member_id`
  is added.
- **C2** `domain/preferences.ts:136`: a stored `nap` survives a demotion and counts again after a promotion. Intended:
  it is the Member's own choice, and it is what lets an R5 who becomes R4 keep NaP discussions (spec US3, acceptance
  4; audit gap A1): an R5's apply stores `nap`.

## Audit gaps taken with the fixes (audit.md)

- A1 an R5 who becomes R4 keeps NaP discussions; A2 a Player without Alliance is not offered NaP discussions; A3 skipping
  every question gives no Preference Role.

## Clean

allowedMentions, private replies, the Member check on custom IDs, zod on stored rows and select values, roles created
without permissions and refused with them, no new Game API request, no secrets, no new intents, strict types.
