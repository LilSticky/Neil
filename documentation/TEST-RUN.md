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

## 6g. Correct a link (slice 011, collected 2026-11-02)

Branch `011-correct-a-link`. Run `npm run commands:register` first (`/unlink`, `/rank`, `/link`). Needs an Officer
account, a Linked alt (not an Officer), and a Member whose Interview was handed off (5 failed uids, section 3.6).

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6g.1 | Officer: `/unlink member:<alt>` | Only the Officer sees "unlinked"; alt's Managed Roles and Neil's nickname gone; `#neil-log` one line naming the Officer, uid and nickname; alt gets a private message mentioning `/interview` (if it shares a server with Neil) | | |
| 6g.2 | Give the uid of 6g.1 to the joiner (section 2) | Linked at once: the uid is free again | | |
| 6g.3 | Officer: `/unlink member:<alt>` again | Only the Officer sees "not Linked"; nothing changes | | |
| 6g.4 | Normal account (not an Officer): `/unlink member:<someone else>` | Only that account sees that only Officers may do that; nothing changes | | |
| 6g.5 | Alt (Linked, has a nickname it changed itself): `/unlink` | Private reply in the command, mentions `/interview`; roles removed; the changed nickname left alone; `#neil-log` says the Member unlinked themselves | | |
| 6g.6 | Alt: `/unlink` again | Only the alt sees "not Linked" | | |
| 6g.7 | Alt: `/interview` | A new Onboarding Interview starts (thread in `#onboarding`) | | |
| 6g.8 | Officer: `/rank member:<Linked alt with unknown rank> rank:R3` | Only the Officer sees the result; rank role R3 and nickname `\|R3` applied; `#neil-log` one line naming the Officer; a pending Rank Approval on that Link is settled and its thread says so | | |
| 6g.9 | Officer: `/rank` on a Linked Member whose Game API rank is R4, give R2 | Officer is told the next Daily Sync uses R4; R2 applied now | | |
| 6g.10 | Officer: `/rank` on a Member not in an Alliance | Only the Officer sees "a rank needs an Alliance"; nothing changes | | |
| 6g.11 | Officer: `/rank member:<self>` | Refused; nothing changes | | |
| 6g.12 | Start Neil, then wait for the Daily Sync (or set `SYNC_HOUR_UTC` to the current hour) with the rank still unknown in the game | The rank given in 6g.8 is kept | | |
| 6g.13 | Officer: `/link member:<handed-off Member> uid:<real uid>` → press Confirm on the Player shown | Member Linked; Interview ends in its thread (locked, archived); name and roles applied; `#neil-log` one line marking an Officer Link with the Officer | | |
| 6g.14 | Officer: `/link` on a Member whose Interview is not handed off | Only the Officer sees "needs a handed-off Interview"; nothing changes | | |
| 6g.15 | Officer: `/link` with a uid already Linked to another Member | Refused "already Linked to …" (Officer only); the Officer may `/unlink` that Member first | | |
| 6g.16 | Officer: `/link` with an unknown uid (e.g. `1`), and press Cancel on a shown Player | Officer sees why / nothing linked; no Interview change | | |
| 6g.17 | Officer: `/link` with a uid and let the confirmation expire (a few minutes) | Buttons stop working; nothing changes | | |
| 6g.18 | Non-Officer: `/rank` and `/link` | Only they see that only Officers may do that | | |

## 6h. See a fuller card (slice 012, collected 2026-11-03)

Branch `012-see-a-fuller-card`. No new commands, no `commands:register` needed.

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6h.1 | `/player name:DrLOL` | Red accent; "Kingdom #1" with the kingdom badge on top; avatar at the right; "Last online … ago"; grid Might · Kills · Likes / Sanctuary level · VIP Level · Language / Alliance · Alliance Rank · Location | | |
| 6h.2 | Read the card from 6h.1 | Might, Alliance and Last Online found in under 5 seconds (SC-004); nothing looks cramped or misaligned on desktop and phone | | |
| 6h.3 | `/alliance tag:NML kingdom:1` | Alliance badge at the right; "**Join Requirements:** …" line; Might · Kingdom Might Rank · Members / Leader · Alliance Level · Gift Level / Language; roster rows `Name · 27.6M` | | |
| 6h.4 | Turn the roster menu to page 2 (an Alliance with more than 25 members) | Same top part; roster rows with Might; no Discord error | | |
| 6h.5 | `/player` on a Player without an Alliance | "No alliance", no Alliance Rank; other values as in 6h.1 | | |
| 6h.6 | `/quota` before and after 6h.1–6h.5 | Same number of requests as before this slice (one per uncached lookup) | | |
| 6h.7 | `/player` on a Player the Game gives no Last Online for (often one online right now) | "Online now" under the name | | |
| 6h.8 | Press Overview on the card from 6h.3 | Same red accent, "Kingdom #1" with badge, Alliance badge at the right; totals, online counts and Top lists in rows of three (check they read well on desktop and phone); Least Active full width; table rows `Name · 27.6M · …`; members without a Last Online read "online" | | |
| 6h.9 | Turn the Overview's table to page 2 | Same look; no Discord error | | |
| 6h.10 | Look at the Overview's member table | A card of its own: red accent, "Kingdom #1", title "Members · sorted by Might"; one monospace table `#  Name  Might  Weekly  Honor  Tech  Last` with aligned columns, highest Might first; footer "Page 1 of N" | | |
| 6h.11 | Press Weekly Activity, Daily Honor, Daily Tech, Last Online, then Might | Page 1 sorted by that column (Last Online: online first), pressed button highlighted; no Discord error | | |
| 6h.12 | Sort by Daily Honor, then press Next | Page 2, still sorted by Daily Honor | | |
| 6h.13 | Another Member presses a sort button on your Overview | Not possible (the Overview is private); if it were, "Only the Member who ran this command…" | | |
| 6h.14 | Read the table on a phone | Rows may wrap on narrow screens; note whether it is still readable | | |

## 6i. Keep newcomers in onboarding (slice 013, collected 2026-11-04)

Branch `013-keep-newcomers-in-onboarding`. No new commands. Before: set the channel permissions from HOSTING.md
(Onboarding Role for slice 013) once Neil has created the `Onboarding` role.

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6i.1 | Restart Neil | An `Onboarding` role exists without permissions; every Member who is not Linked has it, no Linked Member has it, bots are untouched | | |
| 6i.2 | Join with a test account | It gets `Onboarding`, sees only `#onboarding` and its Interview thread (SC-002) | | |
| 6i.3 | Finish the Interview with a Link (known rank) | `Onboarding` is gone, `#onboarding` is no longer visible, the thread is deleted, the log line is there (SC-003) | | |
| 6i.4 | `/unlink` the test account as an Officer | Managed Roles and nickname gone, `Onboarding` back, `#onboarding` visible again | | |
| 6i.5 | `/interview`, then let it time out (or leave the server) | The thread is deleted; the log line says abandoned | | |
| 6i.6 | An Interview with an unknown rank (Rank Approval) | `Onboarding` gone at Link; the thread stays until the Rank Approval is given, then is deleted | | |
| 6i.7 | Hand-off, then `/link` by an Officer | `Onboarding` stays during the hand-off; gone after the Officer Link; thread deleted | | |

## 6j. Find the closest Exile (slice 014, REAPER, collected 2026-11-04)

Branch `014-find-the-closest-exile`. New command `/reaper` (run `npm run commands:register` after deploying). You
need a Member Linked to the R5 of a Home Kingdom Alliance and a second Member who is not.

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6j.1 | As the R5: `/reaper add name:<a real Player> reason:test` | Private "… is now an Exile."; one log line naming the Exile, the reason and you | | |
| 6j.2 | Same with a name in several Kingdoms | A private pick list; picking stores the chosen Player | | |
| 6j.3 | Add the same Player again | "already an Exile" with the stored reason; no log line | | |
| 6j.4 | As the other Member (or an Officer who is not a Home R5): `/reaper add …` | "Only R5s of Home Kingdom Alliances may change REAPER."; `/quota` used count unchanged | | |
| 6j.5 | `/reaper closest` | Private: header with your position and the shield note, up to 3 cards in distance order with Coordinates, Distance, Reason, Exiled on; nobody's adder shown | | |
| 6j.6 | Run `/reaper closest` again within 10 minutes | Same answer; `/quota` used count unchanged | | |
| 6j.7 | `/reaper closest x:500 y:500 all:true` (with 4+ Exiles) | Paged by distance from 500,500, 3 per page; Previous/Next work; nobody else can turn your pages | | |
| 6j.8 | `/reaper list` | Every Exile newest first (name, Kingdom, reason, date), 8 per page | | |
| 6j.9 | As the R5: `/reaper remove exile:` | Suggestions while typing; removing confirms privately, logs one line, and the Exile is gone from `list` | | |

## 6k. Choose your channels (slice 016, collected 2026-11-04)

Branch `016-choose-your-channels`. New command: `/channels`. Before: set the Preference Role channel permissions
from SERVER-SETUP.md (section 3) and HOSTING.md, and set `DISCORD_GUIDES_FORUM_ID` if you want the guides forum named.

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6k.1 | Restart Neil | Nothing changes for existing Members: no Preferences message, no Preference Role given | | |
| 6k.2 | Link a test account whose game Language is set (e.g. Italian) | The Preferences message is in the Interview thread, with that Language preselected and its role given | | |
| 6k.3 | Choose two Languages, a Region, PvP and Veteran | Each change gives its role at once and updates the message; the guides invitation appears; one log line per change | | |
| 6k.4 | Press Done | The thread is deleted | | |
| 6k.5 | Link another test account and touch nothing | The thread is deleted after the Interview timeout | | |
| 6k.6 | Check NaP discussions with three test accounts: R4 choosing it, R5 choosing nothing, R3 | R4 sees the NaP discussions channel after choosing; R5 gets it without choosing; R3 does not see it | | |
| 6k.7 | `/channels` as a Linked Member | Current choices shown privately, preselected; a change applies | | |
| 6k.8 | `/channels` as a Member who is not Linked | Told to finish onboarding first; nothing else | | |
| 6k.9 | `/unlink` the test account | All Preference Roles are gone | | |
| 6k.10 | Officer Link of a test account | It gets a private message pointing to `/channels`; no Preferences message in the thread | | |
| 6k.11 | Compare the game's language list with the 17 offered (English … Indonesian, plan R2) | Every language the game offers is in the list; note any missing ones here | | |

## 6l. Give Members the Doctor Role (slice 017, collected 2026-11-04)

Branch `017-give-members-the-doctor-role`. No new commands. Restart Neil before moving any channel to Doctor. Set up the
channels from SERVER-SETUP.md sections 3 and 5 after 6l.1. Since slice 019, Guests see only the Guest area, so expectations that a Guest sees basic information or `#alliance-hall` no longer hold.

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6l.1 | Restart Neil, with at least one Member Linked | A `Doctor` role exists without permissions; every Linked Member has it, nobody else does, bots are untouched; one line with the counts in `#neil-log` | | |
| 6l.2 | Restart Neil again | No changes, no Doctor line | | |
| 6l.3 | Link a test account | `Doctor` given, `Onboarding` gone, `#alliance-hall` visible straight away | | |
| 6l.4 | Link a Guest (a Player of another Kingdom) | `Doctor` given; the Shared area and Shared announcements visible, the Home Kingdom area not | | |
| 6l.5 | Hand-off, then `/link` by an Officer | No `Doctor` during the hand-off; given at the Officer Link | | |
| 6l.6 | `/unlink` the test account | `Doctor` gone, `Onboarding` back | | |
| 6l.7 | Give a role named `Doctor` a permission, then Link | Role not given; `#neil-log` says it has permissions; the Link stands. Remove the permission afterwards | | |
| 6l.8 | Join a voice channel of the Shared area as the Guest and as a Home Kingdom Member | Both can talk; both can write in its text channels | | |
| 6l.9 | Try to post, and to start a thread, in either announcements channel without the King role | Not possible; with the King role, posting works | | |
| 6l.10 | With an account that isn't an Administrator: `/player` outside `#alliance-hall`, then inside | Not offered outside; works inside | | |
| 6l.11 | `/interview` in `#onboarding` as a newcomer | Works | | |

## 6m. Look up within a Daily Allowance (slice 015, collected 2026-11-05)

Branch `015-look-up-within-a-daily-allowance`. After deploying, run `npm run commands:register` (`/usage` is new) and restart Neil.

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6m.1 | Run `/usage` as a Member | A private reply with `0 of M`; `/quota` shows no new request | | |
| 6m.2 | Run `/player` for a Player not looked up recently | The card's footer ends with `1 of M` and the reset time | | |
| 6m.3 | Run the same `/player` again | The card shows `1 of M`: the cached answer is free | | |
| 6m.4 | Use up the allowance, with a low limit or a test Member | The next uncached lookup is refused privately with the reset time | | |
| 6m.5 | Run a cached lookup and `/reaper closest` as that Member | Both answer, and the count stays the same; `/reaper` shows no usage line | | |
| 6m.6 | Run `/player` as an Officer past the allowance | It answers and says Officers are not limited | | |
| 6m.7 | Run `/quota` as an Officer | Allowance, Expected Lookup Members, and the Members with the most requests; nobody is pinged | | |
| 6m.8 | Restart Neil | Counts and the allowance are unchanged | | |
| 6m.9 | Link a Member by Interview, then one by Officer Link | Each gets the note privately | | |

## 6n. Start Interviews for unlinked Members (slice 018, collected 2026-11-05)

Branch `018-start-interviews-for-unlinked-members`. First switch on **Presence Intent** in the Developer Portal and Link the Members on Wispbyte, then deploy and Restart. Run only the Wispbyte Neil.

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6n.1 | Restart Neil with an unlinked test account online | An Interview opens for it; `#neil-log` says `started 1, failed 0, left for later 0` | | |
| 6n.2 | Restart Neil with the test account offline | No Interview; no startup line | | |
| 6n.3 | Bring that account online | An Interview opens | | |
| 6n.4 | Go idle, then back to online, with the Interview open | No second Interview | | |
| 6n.5 | Let the Interview be abandoned, go offline, come online | A new Interview opens | | |
| 6n.6 | Come online with a Linked account | No Interview | | |
| 6n.7 | Get handed off, then go offline and come online | No Interview | | |
| 6n.8 | Run `/interview` as an unlinked Member with none open | Works as before | | |

## 6o. Keep Preferences within the Home Kingdom (slice 021, collected 2026-11-06)

Branch `021-keep-preferences-within-the-home-kingdom`. Deploy and Restart first. No commands to register. Run only the Wispbyte Neil.

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6o.1 | Link a test account to a Player outside the Home Kingdom | No Preferences message; the thread is deleted | | |
| 6o.2 | Run `/channels` as that Guest | The private refusal; no Preferences message | | |
| 6o.3 | Give that Guest a Preference Role by hand, then wait for the Daily Sync | The role is gone; `#neil-log` has one line | | |
| 6o.4 | Link a test account to a Player in the Home Kingdom | The Preferences message and the roles, as before | | |

## 6p. Choose Recruitment instead of Trading (slice 022, collected 2026-11-06)

Branch `022-choose-recruitment-instead-of-trading`. Deploy and Restart first. No commands to register. Run only the Wispbyte Neil.

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6p.1 | Run `/channels` as a Home Kingdom Member | Interests offer Recruitment, not Trading | | |
| 6p.2 | Choose Recruitment | The `Recruitment` role, and the Recruitment channel once it is gated | | |
| 6p.3 | Clear Recruitment | The role comes off | | |

## 6q. Set up the server (slice 020, collected 2026-11-06)

On the test server, with its token and ID in `.env`. Neil needs a role there first ([STARTUP-GUIDE.md](STARTUP-GUIDE.md) step 2).

| # | Step | Expected | Result |
|---|------|----------|--------|
| 6q.1 | `npm run server:setup` | Lists everything to create; the server is unchanged | |
| 6q.2 | `npm run server:setup -- --apply` without Administrator | Refused; nothing changes | |
| 6q.3 | Give Neil's role Administrator, run again with `--apply` | The layout appears; forums and announcements are text channels if Community is off | |
| 6q.4 | Run it again | `Nothing to do.` | |
| 6q.5 | Add a role `[TST]`, an unknown channel and an extra overwrite on `#general`, run again | `[TST]` gets an area; the other two are reported and unchanged | |
| 6q.6 | Take Administrator off, drag Moderator and King above Neil, set the printed IDs, start Neil | Neil starts | |
| 6q.7 | **View Server As Role** | **Onboarding** sees `#onboarding` only; **Doctor** alone sees the Guest area only | |
| 6q.8 | A Linked Member with a plain `NML` role, after the Daily Sync | The same role, named `[NML]`, still held | |
| 6q.9 | With Community on, if you can | Forums and announcement channels are created as such | |
| 6q.10 | Look at `#gift-codes` with an R3, an R4 and a Guest | The R3 reads only; the R4 can post; the Guest doesn't see it | |
| 6q.11 | **Follow** the official server's announcement channel into `#gift-codes` | Its next post arrives in `#gift-codes` | |

## 6r. No Rank Approval for Guests (slice 023, collected 2026-11-06)

Branch `023-no-rank-approval-for-guests`. No new commands.

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6r.1 | Link a test account to a Player outside the Home Kingdom whose rank the game doesn't list | No Rank Approval, nobody asked; the thread is deleted | | |
| 6r.2 | `/rank` that Member as an Officer, with R4 | The nickname shows `\|R4`; no `R4` role | | |
| 6r.3 | Link a test account in the Home Kingdom whose rank the game doesn't list | The Rank Approval is asked, as before | | |

## 6s. Keep the thread until it closes (slice 024, collected 2026-11-06)

Branch `024-keep-the-thread-until-it-closes`. No new commands. Hide `#onboarding` from @everyone first. Where 6i and 6l.3 expect `Onboarding` to go at the Link, it now goes when the thread closes.

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6s.1 | Link a test account in the Home Kingdom | `Doctor` and the roles given, `Onboarding` kept; the thread and the Preferences message stay visible | | |
| 6s.2 | Press **Done** | The thread is deleted and `Onboarding` goes | | |
| 6s.3 | Link another test account and touch nothing | At the Interview timeout, the thread is deleted and `Onboarding` goes | | |
| 6s.4 | Link a Guest | The thread is deleted and `Onboarding` goes, at once | | |
| 6s.5 | Link a test account whose rank the game doesn't list, press **Done**, then approve the rank | After **Done** the thread and `Onboarding` stay; at the approval both go | | |
| 6s.6 | Restart Neil during 6s.1, before **Done** | `Onboarding` stays | | |

## 6t. See what Neil can do (slice 027, collected 2026-11-07)

Branch `027-see-what-neil-can-do`. New command: `/help`. Before: run `npm run commands:register`.

| # | Do | Expect | Result | Feedback |
|---|----|--------|--------|----------|
| 6t.1 | `/help` as a Member | A private list of commands with usage and purpose; no `/quota`, `/rank` or `/link` | | |
| 6t.2 | `/help` as an Officer | The same list, then the Officer commands | | |
| 6t.3 | Read `/player`, `/rank` and `/reaper closest` in the list | Required options as `<name>`, optional ones as `[name]`; each `/reaper` subcommand on its own line | | |


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
