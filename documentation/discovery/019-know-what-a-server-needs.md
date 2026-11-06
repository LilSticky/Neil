# Discovery: Know what a server needs (slice 019, 2026-11-06)

Discovery before any setup script, asked for by the user on 2026-11-06. Documentation only, no code. Issue #61. Sections 1 to 5 are the proposal; the user's answers are in section 6 and win wherever they differ. The result is in `SERVER-SETUP.md`, `STARTUP-GUIDE.md` and `MIGRATION-GUIDE.md`.

**Deliverables**
- Lists of requirements, recommendations and suggestions for channels, roles and permissions.
- A startup guide for new servers.
- A migration guide for existing servers.

`SS:n` means line n of `documentation/SERVER-SETUP.md`. Claims about Discord's own behaviour that neither the code nor the repository documents are marked *unverified* and listed in section 5.

## 1. What exists today

Checked against the code, not taken from SERVER-SETUP.md.

| Need | Today | Source |
|------|-------|--------|
| Log in | Intents Guilds, GuildMembers and GuildPresences. The last two are privileged; without them Neil cannot log in | src/discord/client.ts:301, ADR 11 |
| Configuration | 17 variables. 11 are required by the schema, including 5 Discord IDs and the Home Kingdom; IDs are checked for format only | src/config.ts:79-139 |
| `#onboarding`, `#neil-log` | Must be ordinary text channels. Neil needs View Channel, Send Messages in Threads, Create Private Threads and Manage Threads in the first, View Channel and Send Messages in the second. Any problem **stops Neil**: it exits 1 and writes to the console only | src/discord/onboarding-channels.ts:86-94, client.ts:948-953, src/startup.ts:86-90 |
| Manage Roles, Manage Nicknames | Checked at startup. A missing one posts one log line and Neil runs on | src/discord/role-permissions.ts:14-39 |
| Role order | Not checked at startup. A role at or above Neil's is skipped per Member as `hierarchy` | src/discord/member-roles.ts:200, 235 |
| Neil-made roles | Found by exact name; created on first **give**, with no permissions, not hoisted, not mentionable; a role of that name with permissions is refused | member-roles.ts:220-254, ADR 8 |
| Onboarding Role | Startup gives it to every non-bot Member who is not Linked, so it appears at the first start once such a Member exists | src/discord/link-state-role.ts:124-156 |
| Doctor Role | Startup gives it only to Linked Members, so with nobody Linked it does not exist until the first Link | same; src/discord/interview.ts:841 |
| Other roles | Alliance tag (Home Kingdom only), `R1`-`R5` (Home Kingdom Alliance, rank known), `#<kingdom>` and `T1`-`T10` exist only once a Member needs them | src/domain/managed-roles.ts:15-30 |
| Preference Roles | 28 names: 17 languages, 3 regions, 5 interests, 3 experiences; each created when first chosen | src/domain/preferences.ts:31-99, 165-170 |
| Fixed role names | 45 (28 + `R1`-`R5` + `T1`-`T10` + Onboarding + Doctor), before tags and Kingdoms; the server limit is 250 | ADR 8 |
| Commands | 11. `/quota`, `/rank` and `/link` are hidden (default member permissions 0); the rest are open. Neil never registers them itself | src/discord/commands.ts:7, 183-195, HOSTING.md:139 |
| Where a command runs | Discord's Integrations settings only; Neil does not check the channel | specs/017 FR-007, client.ts:337-375 |
| Channel permissions | Neil never changes them | specs/013 FR-008, 016 FR-011, 017 FR-007, DICTIONARY.md:26, 30 |
| Guides forum | The only other channel Neil knows, and only by an optional ID used in a text line | src/config.ts:87, client.ts:450 |
| Live server | Steps 8, 8b, 8c and 9 are not done: newcomers still see every channel | documentation/STATUS.md:46, 55 |

## 2. Drift

### Wrong: a step fails or misleads

| # | Where | Finding | Evidence | Fix |
|---|-------|---------|----------|-----|
| D1 | SS:338, 372 | Presence Intent is missing from section 6 and Troubleshooting, and Neil cannot log in without it | client.ts:301, ADR 11, HOSTING.md:153 | Add it as REQUIRED beside Server Members Intent |
| D5 | SS:61, 156, 217, 264 | SS:61 is correct. The problem is sequence: step 8 tells you to allow Doctor, but the warning that it may not exist comes later, in step 8c | link-state-role.ts:140-146 | Move the warning before step 8, or pre-create Doctor |
| D6 | SS:175-176 | Step 6 sets permissions for `Onboarding` and `R5`, which don't exist yet: Onboarding needs step 7 first, and `R5` needs a Linked R5 | SS:205, managed-roles.ts:22-25 | Create the roles first (order O5) |
| D7 | SS:231-255, 275 | Steps 8b and 8c use Preference Roles and `#330` with no warning that they may not exist | member-roles.ts:233 | Same |
| D8 | SS:189, 376 | "Neil says so at startup… in the log" is false for channel problems: Neil exits and posts nothing. A missing permission shows as Neil being offline, not as "no thread opens" | client.ts:948-953, startup.ts:86-90 | Correct both lines; add a Troubleshooting row |
| D9 | SS:372 | "A missing or wrong ID" keeps Neil offline only for the server and channel IDs. With a wrong Moderator or King ID Neil starts and that role simply has no Officers | config.ts:42-45, client.ts:946-948 | Add a Troubleshooting row |
| D10 | SS:321-322 | Step 10 says the thread is deleted at Link. It stays until Done or timeout when the Preferences message opened, and also while a Rank Approval is pending | interview.ts:849-852, specs/016 FR-009 | Correct step 10 |
| D11 | SS:30, 177 | **Check first.** The Onboarding Role comes off, then Preferences is posted in the thread. With @everyone denied on `#onboarding` the Member can no longer view the parent channel. SS:176 itself says thread members need View Channel. If so, the Preferences message is invisible, except to a Member who holds `R5` | interview.ts:841-849; TEST-RUN §6k not run | Q4 |
| D12 | SS:174 | Officer access to `#onboarding` is labelled RECOMMENDED, but hand-offs and Rank Approvals with no Linked R5 only mention the roles in the thread; Neil adds only the leader | interview.ts:978, interview-texts.ts:421-429, 469, rank-approval.ts:59-61 | Relabel REQUIRED for those capabilities |
| D13 | SS:176 | The rule assumes the approver holds `R5`. Only a Home Kingdom leader with a known rank does, while `leaderPing` is not limited to the Home Kingdom | managed-roles.ts:22-25, interview.ts:894-903 | Q11 |
| D15 | SS:38, 357 | `/link` works only for a handed-off Member. SS:357 offers it as a general fix | corrections.ts:300 | Say so in both places |
| D16 | SS:104, 299 | Step 9 uses a moderator-only channel, but no step creates it or sets its permissions | SS:119-314 | Add a step |
| D20 | SS:205, 291-314 | `/ping` and step 9 assume commands are registered, which appears only as a note in SS:347 | HOSTING.md:139 | Add a step before step 9 |
| D21 | SS:131-132 | The invite uses "no bot permissions" and Public Bot is off "so only you can invite it", yet step 2 has the server owner open the link and a Neil role appear. *Unverified:* whether a role appears at all with no permissions | HOSTING.md:18-19 | Q5; decide what the invite link carries |
| D23 | SS:173 | Read Message History is not listed. Neil fetches messages in threads and the startup check doesn't cover it. *Unverified:* it probably works today only through @everyone defaults, as does Use Application Commands for newcomers | onboarding-channels.ts:86-91, 168 | Add a row: keep those defaults, or allow them explicitly |

### Out of date

| # | Where | Finding | Evidence | Fix |
|---|-------|---------|----------|-----|
| D2 | SS:26-41, 301, 309 | `/usage` is missing from section 1 and from both step 9 lists. It is the only one of the 11 commands missing | commands.ts:77, 194 | Add to all three |
| D3 | SS:40 | REAPER is merged (#44), registered and live, not "coming soon". Only its manual check §6j is open | commands.ts:135, STATUS.md:31-34, 47 | Remove "coming soon" |
| D4 | SS:37, 39, 341-342 | No Daily Allowance setting exists; the minimum of 100 is a constant. The real gaps: reserve and share also shrink the Daily Allowance, Look up doesn't mention the limit, and `/quota` now shows the top Members | daily-allowance.ts:10, 55, startup.ts:112-118, STATUS.md:16 | Reword these rows; add a Daily Allowance row |
| D14 | SS:28 | Interviews also start when a Member comes online and at a start of Neil, up to 10 per start | specs/018 FR-001, FR-003 | Add |
| D22 | SS:194, 330-345 | `DATA_DIR` is the only one of the 17 variables missing from section 6; all listed defaults match. SS:194 sends readers to a HOSTING §3 table that lacks the Moderator and King IDs, `LAP_TRACKER_API_KEY`, the quota reserve and the cache setting | config.ts:138, HOSTING.md:40-53 | Add to both |
| D25 | HOSTING.md:59-85, 143-147 | HOSTING repeats the server setup per slice and has aged: it names Alliance and Kingdom roles where the guide now uses Doctor | HOSTING.md:74-75 | HOSTING links to the guides only |

### Minor or contradictory

| # | Where | Finding | Fix |
|---|-------|---------|-----|
| D17 | SS:66, 100-112 | The NaP discussions channel is in step 8b but not section 4. `New` and `Intermediate` are said to show channels, but none exists for them | Add the channel; Q2 |
| D18 | SS:227, 253, 320 | "Only `#onboarding`" contradicts the guides forum being visible to newcomers. specs/013 says newcomers see only `#onboarding` | Q8 |
| D19 | SS:114 | "Both must be…" and "the names don't matter" date from when the table had two channels | Name the two |
| D24 | SS:91 | "Neil below Officers" is REQUIRED, but nothing breaks or checks it, so it doesn't fit the definition at SS:13. It is an ADR 8 decision | Keep it, marked as a decision |

## 3. Requirements, Recommendations, Suggestions

| SERVER-SETUP label | Becomes | Meaning |
|--------------------|---------|---------|
| REQUIRED | Requirement | Neil won't start, or the named capability doesn't work |
| RECOMMENDED | Recommendation | Neil works, but Members see too much or lose a convenience |
| OPTIONAL | Suggestion | A matter of taste; proposal: rename the label to match |
| "created automatically" | no label | Neil's job; listed below only where a role must exist before channels use it |

**Bot token?** Yes = a bot token can set it. Yes* = also needs Manage Channels, which Neil doesn't hold today (Q6). No = a person must do it. Limits on overwrites are in section 5.

### Requirements

| What | Why | Breaks without it | Bot token? |
|------|-----|-------------------|------------|
| **Channels** | | | |
| `#onboarding`, a text channel | Holds the Interview threads | Neil won't start | Yes* |
| `#neil-log`, a text channel | Officers follow every Link and role change (constitution V) | Neil won't start | Yes* |
| **Roles** | | | |
| Moderator and King, with IDs in configuration | They define Officers | Neil won't start without valid IDs; a wrong ID means no Officers | Yes to create; No to place above Neil |
| Neil's role above every role it gives | Discord hierarchy | Roles skipped per Member; nicknames and roles degrade | No |
| Neil's role below Officers | ADR 8 decision; nothing breaks | A safety rule only (D24) | No |
| Onboarding, Doctor and every role a channel uses exist before the channel does | An overwrite needs a role | Setup can't be done in order (D5-D7) | Yes; Neil adopts a permission-free role of that name (ADR 8). Alliance tags can't be known ahead |
| No permissions on Neil's roles | Neil refuses such a role | That role is never given | Yes, as a check |
| **Permissions** | | | |
| Server Members Intent, Presence Intent | Joins, leaves, coming online | Neil can't log in | No |
| Manage Roles, Manage Nicknames on Neil | Names and roles | All name and role changes; one log line | No: a person sets them, or the invite carries them |
| Neil's four permissions in `#onboarding` | Threads | Neil won't start | Yes* |
| Neil's two permissions in `#neil-log` | Logging | Neil won't start | Yes* |
| Read Message History for Neil; Use Application Commands for Members (D23) | Message edits and every command | Interview edits; `/interview` | Yes* for channel overwrites |
| Onboarding: View Channel, Send Messages, Send Messages in Threads in `#onboarding` | Newcomers answer | Onboarding Interview | Yes* |
| Moderator and King: View Channel, Manage Threads in `#onboarding` *(was RECOMMENDED, D12)* | Officers reach threads | Hand-offs; Rank Approval with no Linked R5 | Yes* |
| `R5`: View Channel, Send Messages in Threads in `#onboarding` | The approver opens the thread | Rank Approval by an R5 (D13) | Yes*, once `R5` exists |
| @everyone View Channel denied everywhere except `#onboarding`, with Doctor allowed | Keeps newcomers in onboarding | Newcomers see everything; Linked Members need Doctor allowed | Yes* |
| @everyone denied on `#neil-log`, Moderator and King allowed *(was RECOMMENDED)* | The log shows uids, which are In-game Proof (DICTIONARY.md:168) | In-game Proof weakens; Officers can't check Links | Yes* |
| Commands registered | They must exist on Discord | Every command | Yes, `npm run commands:register` |
| Moderator and King allowed on `/quota`, `/rank`, `/link` in Integrations | Hidden by default | Officers can't use them (except Administrators) | No (Q3) |

### Recommendations

| What | Why | Degrades without it | Bot token? |
|------|-----|---------------------|------------|
| **Channels** | | | |
| Moderator-only channel | A place for Officer commands | Officer answers and commands mix with others | Yes* |
| Basic information (e.g. `#rules`, `#welcome`), read only for Doctor | What every Doctor should read (specs/017) | Nothing common to read | Yes* |
| `#alliance-hall`, Doctor may write | Where Members use commands | Commands scattered | Yes* |
| Home Kingdom area, `#330` only | Home Kingdom information | Guests see it, or it has no home | Yes*, once `#330` exists |
| Shared area, text and voice for Doctor | Shared information | Guests can't get in touch | Yes* |
| Home Kingdom and Shared announcements, only King posts | King announcements | Anyone can post in them | Yes*; announcement type may need Community (Q9) |
| NaP publications, Doctor | Every Linked Member reads them | NaP results don't reach Members | Yes* |
| NaP discussions, role only | Leaders' talks stay private | The Interest shows nothing, or talks leak | Yes* |
| Language, region and interest channels | Less visual noise (specs/016) | Preferences show nothing | Yes*; which ones: Q2 |
| Guides forum, Veteran may write | New Players find guides | The guides line has nowhere to point | Yes*; may need Community (Q9) |
| **Roles** | | | |
| Keep Officers Linked, or allow Moderator and King on the channels they need | Unlinked Officers hold Onboarding | Officers lose channels after step 8 | Yes* |
| **Permissions** | | | |
| @everyone denied on `#onboarding` | Linked Members don't need it | Noise. Note D11 | Yes* |
| Give Neil nothing beyond its needs; never Administrator | Constitution V | More damage if the token leaks | No; a person decides |
| Member commands limited to `#alliance-hall`, `/interview` to `#onboarding`, Officer commands to the moderator channel | specs/017 FR-008 | Commands usable anywhere | No (Q3) |
| Permissions set on categories, channels synced | New channels inherit them | More work, more mistakes | Yes* |
| Check with View Server As Role and a non-Administrator account | Administrators see everything | Mistakes go unnoticed | No |

### Suggestions

| What | Why | Effect if skipped | Bot token? |
|------|-----|-------------------|------------|
| Color, icon, "display separately" of Neil's roles | Taste | None | Yes |
| Order of Neil's roles among themselves | Taste | None | Yes |
| A channel per Alliance, by its tag | Alliance privacy | None | Yes*, once the tag exists |
| `#rules` visible to newcomers (SS:359) | They read the rules first | None | Yes* |
| `DISCORD_GUIDES_FORUM_ID` | The guides line links the forum | The line says "the guides forum" | No: hosting setting; a script can print the ID |
| Tuning: `INTERVIEW_TIMEOUT_MINUTES`, `SYNC_HOUR_UTC`, `SYNC_SHARE`, `GAME_API_QUOTA_RESERVE`, `GAME_API_CACHE_MINUTES`, `TROOP_BRACKET_LEVELS`, `DATA_DIR` | Defaults work | None | No: hosting settings |

## 4. Proposed guides

### Order constraints (both guides)

| # | Constraint | Why |
|---|-----------|-----|
| O1 | Both intents before any start | No login otherwise |
| O2 | Channels, Officer roles and Neil's channel permissions before the first start | Neil exits otherwise |
| O3 | Manage Roles and Neil's position before Neil gives roles | Otherwise skipped |
| O4 | Links on the database Neil runs on before any restart | Startup takes Doctor off and gives Onboarding to anyone without a Link there (HOSTING.md:156) |
| O5 | A role exists before a channel refers to it | D5-D7 |
| O6 | Linked Members hold Doctor (log line after a restart) before channels move to it | Otherwise they lose them |
| O7 | Per category: add the allow first, then deny @everyone | No gap in access |
| O8 | Officers and other bots are allowed before the deny | Bots never get Doctor (link-state-role.ts:134) |
| O9 | Commands registered before Integrations | Nothing to configure otherwise |
| O10 | `#onboarding` is added to `/interview` in the same sitting as turning off All Channels | Newcomers lose it otherwise |
| O11 | Members are told about `/channels` before language channels are gated | Members Linked before slice 016 hold no Preference Roles |

### Startup guide (new server)

1. Before you start: what you need, who does what (owner, whoever runs Neil), and Community if Q9 needs it.
2. Developer Portal: application and both intents (depends on Q5).
3. Invite Neil; give it Manage Roles and Manage Nicknames.
4. Create Moderator and King; place Neil below them.
5. Create the two channels with Neil's permissions.
6. Create the roles channels depend on: Onboarding, Doctor, `R5`, the Home Kingdom's Kingdom role, the chosen Preference Roles. All permission-free and below Neil.
7. Send the IDs; register commands; start Neil; check `/ping`.
8. Set the rest of `#onboarding` and `#neil-log`.
9. Build the layout: basic information, `#alliance-hall`, Home Kingdom, Shared, moderator channel, Preference channels.
10. Integrations.
11. Test with a non-Administrator account.

The first Link needs nothing special, because Doctor already exists after step 6.

### Migration guide (existing server)

1. Inventory: channels, roles, bots. Find name collisions: an existing `Events`, `New`, `Veteran`, `R5` or `Doctor` without permissions **becomes Neil's** and is given and taken by its rules; one with permissions is refused.
2. Decide the fate of unknown channels (Q1).
3. Check Links: right database (O4); list unlinked Officers.
4. Announce the date, `/channels` and the Interview (Q7).
5. Bring Neil up to date: intents, permissions, position, commands.
6. Restart; confirm Doctor and Onboarding counts in `#neil-log` (O6).
7. Create the missing roles.
8. Move one category at a time, allow before deny (O7, O8); check with View Server As Role after each.
9. Hide or report unknown channels.
10. Gate Preference channels last (O11).
11. Integrations (O10).
12. Test, then keep the way back: a category returns by removing the @everyone deny.

Expect a wave of Interviews: up to 10 per start, and one per unlinked Member coming online (specs/018). Each is a private thread.

### What SERVER-SETUP.md becomes

The reference both guides link to: what Neil does (section 1), the three lists, role order, where to change what, and Troubleshooting. The step-by-step sections move into the guides. Section 6 stays as the settings list, or moves to HOSTING.md, which then keeps only hosting and links here (D25). Proposed files: `documentation/STARTUP-GUIDE.md` and `documentation/MIGRATION-GUIDE.md`.

## 5. Questions for the user

1. **Channels on an existing server that aren't in the layout?**
   a. Hide them from newcomers: deny @everyone, allow Doctor, keep other overwrites, and report them. b. Leave them and report. c. Remove them.
   **Recommended: a.** It is what keeps newcomers in onboarding while Linked Members keep them; b leaves them visible to newcomers; c can't be undone.

2. **Which language, region and interest channels does a server get?**
   a. One per Preference Role: 17 languages, 3 regions, 4 interests, plus NaP discussions. b. All regions and interests, plus only the languages you name. c. Only what the server has now, matched to roles.
   **Recommended: b**, with your list of languages. Also: `New` and `Intermediate` show no channel today; keep them as roles only? **Recommended: yes**, and SS:66 is reworded.

3. **Should the command limits in Integrations (step 9) be automated?** Discord needs an admin's own login, not a bot token.
   a. Stay manual, with a checklist the script prints. b. A separate step in which an admin logs in once. c. Change Neil to check roles and channels itself.
   **Recommended: a.** It is done once per server and again per new command; b handles an admin's login for little gain; c reverses specs/017 FR-007.

4. **Preferences after the Link (D11), if a test confirms the Member can't see the thread?**
   a. Keep the Onboarding Role until Done (changes specs/013 FR-003). b. Allow Doctor to view `#onboarding` (guide only, but Linked Members see it, against specs/013). c. Tell the Member to run `/channels` instead of posting in the thread (small code change).
   **Recommended: test first; then c**, as its own small slice, since 019 has no code.

5. **Who is a "new server"?**
   a. Only a rebuild of the one server. b. Another Kingdom's server, running its own Neil: own application, hosting, database and Game API key. c. One Neil serving many servers.
   **Recommended: b.** It needs no code, since Neil serves one server (ADR 11), but the guide must include the Developer Portal and write `#<Home Kingdom>` instead of `#330`. c is a different product.

6. **Which rights does the slice 020 script run with?** Today Neil lacks Manage Channels, and "Neil does not change channel permissions" stands in specs and the dictionary.
   a. Neil's token with Manage Channels granted for the run, then removed. b. A separate setup application. c. Temporary Administrator.
   **Recommended: a**, recorded in an ADR, with the script described as the owner's tool rather than Neil acting. c goes against constitution V.

7. **Members already on the server who aren't Linked, at the cutover?** They hold Onboarding and would see only `#onboarding`.
   a. Cut over at once. b. Announce a date, let Interviews run, then cut over. c. Leave some channels open to them for a while.
   **Recommended: b.** The date is yours to set.

8. **May newcomers see the guides forum?**
   a. Yes, keep the exception. b. No, Doctor only, as specs/013 says.
   **Recommended: b**, unless you made the exception on purpose.

9. **Is Community on for the live server, and does the guide require it?** The guides forum and announcement channels may depend on it, and a bot can't turn it on.
   a. Required, as the guide's first step. b. Optional, with plain text channels as fallback.
   **Recommended: a** if it is already on; otherwise b.

10. **What makes the auto-translated channels work?** The repository doesn't say.
    a. Another bot (which one?). b. Something else (what?).
    **Recommended: name it.** If it is a bot, it needs its own allow (O8) or translation stops at the cutover.

11. **May a Guest Alliance's leader be asked for a Rank Approval (D13)?** They hold no `R5` role, so they can't open the thread. First confirm Guests get Rank Approvals at all.
    a. No: such approvals go to the Officers (code change, own slice). b. Yes, and the guide accepts that Officers use `/rank`.
    **Recommended: b** for now, as a Troubleshooting row, with an issue for a.

12. **New dictionary terms?**
    - **Server Layout** (proposed): the categories, channels and permission overwrites a server should have; what the guides describe and slice 020 reads.
    - **Basic information** (proposed): the read-only channels every Doctor sees. Already used in "Doctor Role" without an entry.
    - **Moderator channel** (proposed): the channel for Officer commands.

    a. All three. b. Server Layout only. c. None.
    **Recommended: a.** "Home Kingdom" names 330, which changes if Q5 = b. "Requirement", "Recommendation" and "Suggestion" stay plain words.

**To check on Discord before the guides are written** (*unverified*)
- D11: can a thread member see a private thread once they can't view the parent channel?
- D21: does a bot invited with no permissions get a role?
- D23: Read Message History for Neil; Use Application Commands for newcomers.
- Q9: do forum and announcement channels need Community?
- Slice 020: can a bot set only those overwrite permissions it holds itself, and do roles it creates land below its own?
- `/interview` limited to `#onboarding`: does that cover its threads?

## 6. The user's answers (2026-11-06)

- **Q1:** a. Channels outside the layout are hidden from newcomers and reported.
- **Q3:** a. The Integrations limits stay manual, with a checklist.
- **Q5:** b. A new server is another Kingdom's, running its own Neil.
- **Q2**, in the user's words, replacing the options offered:
  - NaP: closed discussion channels for R4, R5 and King; one for only R5 and King; public announcements, fed only by the King; another bot translates announcements into other languages; a public discussion forum.
  - Languages: one general chat channel per language.
  - Regions: no dedicated channels.
  - Events: a moderated forum where Veterans can publish guides. Keep interviewing on the specifics of the interest categories.
  - A general hangout area for everyone, with at least a general text chat and a voice channel.
  - An inter-server area where home-server players mingle with Guests, where no commands can be used.
  - More to come: "some other things that have not come to mind yet".
- **PvP total:** chat, voice, intel and a tactics forum. Intel means the existing lookups (`/player`, `/alliance`, `/reaper`) used in that channel; no code.
- **AD and KvK:** the user will explain them later, so they stay open. Their groups are seen by the Home Kingdom only.
- **Hangout and inter-server area:** two areas. The hangout is for Home Kingdom Members, the inter-server area for every Doctor.
- **Guests:** "in general, everything on the server should not be shared with the guests, as it includes tactical plans. Guests only in the guest area." This overrides specs/017, section 3 and SERVER-SETUP step 8c, where basic information, `#alliance-hall` and NaP publications go to every Doctor: those become Kingdom-role channels.
- **NaP closed channels:** Home Kingdom only.
- **Translation:** Interaction Bot. It needs its own allow on the announcement channels (O8).
- **Consequence, checked in code:** `preferenceRolesFor` has no Guest rule, so Guests can hold Preference Roles. Discord combines role allows, and a role's allow beats another role's deny, so a language channel allowed to `Italian` would show to a Guest with `Italian`. No overwrite can express "Italian and `#330`".
- **Guest Preferences:** Neil gives Preference Roles only to Home Kingdom Members, and Guests get no Preferences message. Code, in its own slice, before the layout goes live.
- **Guest area:** has its own read-only rules channel.
- **Q7:** b. Announce a date, let Interviews run, then hide the channels.
- **Q12:** Server Layout, Guest area, Basic information and Moderator channel are approved.
- **Alliance areas:** each Alliance gets its own area with voice and text chat. This moves "a channel per Alliance" from Suggestions to the Server Layout.
- **New Alliance areas:** slice 020's script creates one for every Alliance tag role it finds, and is re-run for a new Alliance. Neil keeps no channel rights.
- **Guides forum (Q8):** the Events role only. Newcomers and Guests don't see it.
- **Community (Q9):** off on the live server, and optional in the guide, with plain text channels as a fallback.
- **Interests**, second round:
  - PvP: "also a channel for getting intel from Neil and a forum to exchange tactics".
  - Trading: dropped as a topic. Recruitment takes its place, with one text channel.
  - Off-topic: its own channel; the same group holds a memes channel.
  - Events: the forum, event chat, event announcements and an ask-for-help channel. "The other events are only of interest within the same alliance, except for AD and KvK as separate groups with overlapping interest of NaP, Events and PvP."

## Slice 020: Set up the server

A server owner runs one script that does as much of the server setup as Discord allows: roles, categories, channels and permission overwrites from one layout file, with a dry run, safe to run twice, reporting what it can't do. The user asked to take as much off their hands as possible.

Waits for slice 019, which decides what to set up.

Known limits: a bot can't place a role above its own, can't change the Developer Portal or Community settings, and can't set the command limits in Integrations with a bot token.
