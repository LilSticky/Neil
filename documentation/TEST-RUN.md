# Test run: slice 005 and a regression sweep

A manual run on the **test server**, prepared on 2026-10-31 while slice 005 was built with automated tests only.
Fill in the **Result** and **Feedback** columns as you go (✅ / ❌ / ⚠️ plus a few words); anything ❌ or ⚠️
becomes a GitHub issue. Time needed: about 45 minutes, plus one wait of 3 minutes.

Texts Neil should show: [contracts/interview.md](../specs/005-interview-a-new-member/contracts/interview.md).

## 0. Setup (once)

| # | Step | Done |
|---|------|------|
| 0.1 | Developer Portal → Neil → Bot → switch on **Server Members Intent** (without it Neil cannot log in once slice 005 is deployed) | ✅ |
| 0.2 | Test server: create `#onboarding` and `#neil-log` | ✅ |
| 0.3 | `#onboarding`: Neil gets View Channel, Send Messages in Threads, Create Private Threads, Manage Threads; Moderator and King get Manage Threads | ✅ |
| 0.4 | `#neil-log`: Neil gets View Channel, Send Messages | ✅ |
| 0.5 | `.env`: `DISCORD_ONBOARDING_CHANNEL_ID`, `DISCORD_LOG_CHANNEL_ID`, `INTERVIEW_TIMEOUT_MINUTES=3` | ✅ |
| 0.6 | Stop Neil on Wispbyte; `npm run commands:register`; `npm run dev` | ✅ |
| 0.7 | Have a second Discord account ready ("the joiner"), not yet on the test server; know two real uids (yours and one without a rank, if you find one) | ✅ |

## 1. Startup checks

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 1.1 | Start Neil with `DISCORD_LOG_CHANNEL_ID` set to a wrong ID | Neil stops at once and names the log channel problem | ✅ | |
| 1.2 | Remove Manage Threads from Neil in `#onboarding`, start | Neil stops and names the missing permission | ✅ | |
| 1.3 | Restore both, start | Neil comes online; `/ping` answers | ✅ | |

## 2. A new Member gets Linked (US1)

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 2.1 | The joiner (server display name **not** a Player Name, e.g. `zz-nobody-zz`) joins the server | Private thread `Interview – {name}` in `#onboarding`, greeting, help text, `Give my uid` button (no recommendation) | | |
| 2.2 | As an Officer, open `#onboarding` | You can see and read the thread; Members without Manage Threads cannot | | |
| 2.3 | As the main account, press `Give my uid` in the joiner's thread | Private "belongs to someone else" | | |
| 2.4 | Joiner: `Give my uid` → enter `abc` | Asked again with the help text; no try lost | | |
| 2.5 | Joiner: enter `#` + a real uid | Card with Player Name, uid, Kingdom, Alliance, rank; `That's me` / `That's not me` | | |
| 2.6 | Joiner: `That's me` | Buttons vanish; "Done … linked to …"; thread archived; 🔗 line in `#neil-log` | | |
| 2.7 | Is the wording clear for a new player? Anything confusing? | — | | |

## 2b. Recommended Player (US6, added 2026-11-01)

Before each step, set the joiner's server nickname, then have them leave and rejoin (or use `/interview` while not Linked).

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 2b.1 | Nickname `[TAG] <your in-game name> \| #1`, join | Greeting and "Is this you?" card: Player Name, Kingdom, Alliance, rank, **no uid**; `That's me` / `That's not me` | | |
| 2b.2 | `That's me` | Asked for the uid of that Player, with the help and `Give my uid` | | |
| 2b.3 | Give that Player's uid | Linked at once (no second "Is this you?"); 🔗 line in `#neil-log` with the uid | | |
| 2b.4 | Nickname `drlol` (several Players), join | Pick list `drlol · Kingdom #N`, no uids; `None of these` | | |
| 2b.5 | Pick one, give a **different** uid | Usual card for that uid with `That's me` / `That's not me` | | |
| 2b.6 | Recommendation shown → `That's not me` | Asked for the uid; no try lost | | |

## 3. Wrong, taken and unknown uids (US2)

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 3.1 | Joiner leaves and rejoins | No new Interview (already Linked) | | |
| 3.2 | Main account (not Linked): `/interview` | Private "waiting in {thread}"; thread opens | | |
| 3.3 | Give the joiner's uid | "already linked to another member", tries left; ⛔ line in the log; joiner not told | | |
| 3.4 | Give an unknown uid (e.g. `1`) | "couldn't find a player", tries left | | |
| 3.5 | Give your real uid → `That's not me` | "Okay, let's try again", tries left | | |
| 3.6 | Fail twice more (5 in total) | Moderator and King mentioned; "An Officer will help you"; buttons gone; 🙋 line | | |
| 3.7 | `/interview` again | A new Interview opens | | |

## 4. Rank Approval (US3)

Needs a Player whose roster row has no rank. If you can't find one, mark "n/a" (automated tests cover it).

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 4.1 | Link a Player with no rank whose R5 is not Linked | Officers mentioned with R1–R5 buttons | | |
| 4.2 | The Linked Member presses `R5` | Private "You can't approve this rank" | | |
| 4.3 | An Officer presses `R3` | "{Officer} set … rank to R3"; buttons gone; 🎖️ line | | |

## 5. Ending without a Link (US4)

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 5.1 | Start an Interview, wait 3 minutes without answering | "No answer for 3 minutes…"; thread locked and archived; 💤 line | | |
| 5.2 | Start an Interview, leave the server | "{name} left the server…"; locked, archived; 💤 line | | |
| 5.3 | Start an Interview, stop Neil, start it again, press `Give my uid` | Still works | | |

## 6. Regression: slices 002–004

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6.1 | `/player uid:…` | Card as before, but **no uid** on it; `name` is the first option | | |
| 6.2 | `/player name:drlol` | Pick list across Kingdoms, no uids | | |
| 6.3 | `/alliance tag:NML kingdom:1` (option renamed from `alliance`; run `npm run commands:register` first) | Roster card and member menu without uids | | |
| 6.4 | `/quota` as an Officer | Quota, reserve and "left for lookups" | | |

## 6b. Name and roles (slice 006, collected 2026-11-02)

Setup: `HOME_KINGDOM=330` in `.env`; Neil's role gets Manage Roles and Manage Nicknames and is dragged above where
the new roles will appear, below Moderator and King. Branch `006-give-a-member-their-name-and-roles`.

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6b.1 | Start Neil with the joiner already Linked (from section 2) | Within a minute the joiner's nickname becomes `[TAG] Name` (or `[TAG\|R4] Name`, `… \| #331` for a Guest); roles for Alliance (Home Kingdom only), rank, `#kingdom`, `T…` appear; one line in `#neil-log` incl. "created role …" | | |
| 6b.2 | Check the new roles in Server Settings → Roles | No permissions, not shown separately, not mentionable, below Neil's role | | |
| 6b.3 | Restart Neil | No changes, no new log lines (already applied) | | |
| 6b.4 | Unlinked main account: `/interview`, get Linked | Name and roles right after "Done … linked"; log line | | |
| 6b.5 | Give the joiner a role named `T1` by hand, then (unlink in the db or use a fresh account) Link again | `T1` removed if it isn't their bracket; any non-Managed Role (e.g. Moderator) untouched | | |
| 6b.6 | Link the server owner's account (if you can) | Roles given; log says the nickname was skipped (owner) | | |
| 6b.7 | Remove Manage Roles from Neil, restart | Neil starts; `#neil-log` names the missing permission; Interviews still work | | |
| 6b.8 | Rank Approval (section 4) for an R4 | Rank role `R4` given, nickname gains `\|R4` | | |
| 6b.9 | Give an existing role named like a Managed Role (e.g. `R5`) a permission, then Link an R5 | Role not given; log says it has permissions | | |

## 6c. Find an alliance by approximate name (slice 007, collected 2026-11-02)

Branch `007-find-an-alliance-by-approximate-name`; run `npm run commands:register` first (autocomplete). Known
Alliances fill up from lookups: do a few `/player` and `/alliance tag:` lookups of Kingdom 330 first.

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6c.1 | Type `/alliance name:` and wait | Up to 25 recently seen Kingdom 330 Alliances as `[TAG] Name`; no quota used (`/quota` unchanged) | | |
| 6c.2 | Type a part of a known name (3+ letters) | That Alliance among the first suggestions | | |
| 6c.3 | Type it with one letter wrong or swapped | Still suggested | | |
| 6c.4 | Pick a suggestion and send | The Alliance card | | |
| 6c.5 | Send `/alliance name:` with a misspelt name without picking | Private "Did you mean…" pick list; picking shows the card | | |
| 6c.6 | `/alliance tag:NML` without kingdom | Kingdom 330's NML (or not found) | | |
| 6c.7 | An Alliance of another Kingdom looked up | Never suggested | | |

## 6d. Alliance overview (slice 008, collected 2026-11-02)

Branch `008-alliance-overview`.

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6d.1 | `/alliance tag:NML kingdom:330`, press `Overview` | Only you see: totals (Weekly Activity, Daily Honor, Daily Tech; online now / 24 h), top 5 each, 5 Least Active, "no data" count; no uids; `/quota` unchanged | | |
| 6d.2 | Second account presses `Overview` on the same card | They get their own private overview | | |
| 6d.3 | Page the member table (alliance with > 25 members) | 25 rows per page, sorted by Weekly Activity, "no data" last; last online shown in your time zone | | |
| 6d.4 | Second account presses your page buttons (if visible) | "not yours" note | | |
| 6d.5 | Wait > 10 minutes, press `Overview` on the old card | Overview still comes (one lookup) or a clear "try again" | | |
| 6d.6 | Do the numbers match the tracker's website? | — | | |

## 6e. Keep roles in sync (slice 009, collected 2026-11-02)

Branch `009-keep-roles-in-sync`. Set `SYNC_HOUR_UTC` to the current UTC hour to see a run right after start.

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6e.1 | Start Neil after the sync hour (no run yet today) | Within ~10 min one summary line in `#neil-log` (checked, changed, skipped, requests); `/quota` shows about one request per Alliance with Linked Members | | |
| 6e.2 | Change your own nickname, wait for the next day's run (or delete today's `daily_sync` row and restart) | Nickname restored; one log line | | |
| 6e.3 | Restart Neil the same day | No second run | | |
| 6e.4 | A Linked Player changed rank/alliance in game | New rank/alliance roles and nickname after the run; log line names the change | | |
| 6e.5 | `SYNC_SHARE=1` with Members in 2 Alliances | Summary says "1 left"; next run does the rest first | | |

## 6f. Say goodbye (slice 010, collected 2026-11-02)

Branch `010-say-goodbye`. Needs a second Discord account that is Linked (an alt).

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6f.1 | The Linked alt leaves the server | One `🔓` line in `#neil-log` with the alt, uid and nickname; the alt gets a private message if it shares another server with Neil | | |
| 6f.2 | The alt rejoins | A new Onboarding Interview starts; the same uid can be Linked again | | |
| 6f.3 | Alt is the Linked R5 and approver of a pending Rank Approval, then leaves | The Rank Approval's thread says the Officers approve now (Officer roles pinged); an Officer's button press approves | | |
| 6f.4 | Stop Neil, let the Linked alt leave, start Neil | The alt is Unlinked at startup (`🔓 … is not on the server`) | | |

## 7. Afterwards

| # | Step | Done |
|---|------|------|
| 7.1 | Remove `INTERVIEW_TIMEOUT_MINUTES` (default 24 hours) | |
| 7.2 | Set the two channel IDs in the Wispbyte panel, then start Neil there | |
| 7.3 | Tell Claude "test run done": it turns ❌/⚠️ rows into issues and ticks T024 | |

## General feedback

- What felt slow or awkward?
- Should the onboarding texts be shorter, friendlier, or in another language?
- Anything Officers need that the log lines don't give them?
