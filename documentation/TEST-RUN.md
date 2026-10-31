# Test run: slice 005 and a regression sweep

A manual run on the **test server**, prepared on 2026-10-31 while slice 005 was built with automated tests only.
Fill in the **Result** and **Feedback** columns as you go (✅ / ❌ / ⚠️ plus a few words); anything ❌ or ⚠️
becomes a GitHub issue. Time needed: about 45 minutes, plus one wait of 3 minutes.

Texts Neil should show: [contracts/interview.md](../specs/005-interview-a-new-member/contracts/interview.md).

## 0. Setup (once)

| # | Step | Done |
|---|------|------|
| 0.1 | Developer Portal → Neil → Bot → switch on **Server Members Intent** (without it Neil cannot log in once slice 005 is deployed) | |
| 0.2 | Test server: create `#onboarding` and `#neil-log` | |
| 0.3 | `#onboarding`: Neil gets View Channel, Send Messages in Threads, Create Private Threads, Manage Threads; Moderator and King get Manage Threads | |
| 0.4 | `#neil-log`: Neil gets View Channel, Send Messages | |
| 0.5 | `.env`: `DISCORD_ONBOARDING_CHANNEL_ID`, `DISCORD_LOG_CHANNEL_ID`, `INTERVIEW_TIMEOUT_MINUTES=3` | |
| 0.6 | Stop Neil on Wispbyte; `npm run commands:register`; `npm run dev` | |
| 0.7 | Have a second Discord account ready ("the joiner"), not yet on the test server; know two real uids (yours and one without a rank, if you find one) | |

## 1. Startup checks

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 1.1 | Start Neil with `DISCORD_LOG_CHANNEL_ID` set to a wrong ID | Neil stops at once and names the log channel problem | | |
| 1.2 | Remove Manage Threads from Neil in `#onboarding`, start | Neil stops and names the missing permission | | |
| 1.3 | Restore both, start | Neil comes online; `/ping` answers | | |

## 2. A new Member gets Linked (US1)

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 2.1 | The joiner joins the server | Private thread `Interview – {name}` in `#onboarding`, greeting, help text, `Give my uid` button | | |
| 2.2 | As an Officer, open `#onboarding` | You can see and read the thread; Members without Manage Threads cannot | | |
| 2.3 | As the main account, press `Give my uid` in the joiner's thread | Private "belongs to someone else" | | |
| 2.4 | Joiner: `Give my uid` → enter `abc` | Asked again with the help text; no try lost | | |
| 2.5 | Joiner: enter `#` + a real uid | Card with Player Name, uid, Kingdom, Alliance, rank; `That's me` / `That's not me` | | |
| 2.6 | Joiner: `That's me` | Buttons vanish; "Done … linked to …"; thread archived; 🔗 line in `#neil-log` | | |
| 2.7 | Is the wording clear for a new player? Anything confusing? | — | | |

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
| 6.1 | `/player uid:…` | Card as before | | |
| 6.2 | `/player name:drlol` | Pick list across Kingdoms | | |
| 6.3 | `/alliance kingdom:1 alliance:NML` | Roster card with the member menu | | |
| 6.4 | `/quota` as an Officer | Quota, reserve and "left for lookups" | | |

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
