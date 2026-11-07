# What a server needs for Neil

The reference for server owners and admins: what Neil does, and the channels, roles and permissions a server needs.
To do the work, follow a guide:

- [STARTUP-GUIDE.md](STARTUP-GUIDE.md) for a new server.
- [MIGRATION-GUIDE.md](MIGRATION-GUIDE.md) for a server that already has Members and channels.

Running the bot itself (token, hosting, deploys) is in [HOSTING.md](HOSTING.md). The decisions behind this page are in
[discovery/019-know-what-a-server-needs.md](discovery/019-know-what-a-server-needs.md).

`#<Home Kingdom>` below means your Kingdom role, for example `#330`.

## How to read this page

| Label | Meaning |
|-------|---------|
| 🔴 **Requirement** | Neil won't start, or the feature named next to it won't work, without this. |
| 🟡 **Recommendation** | Neil works without it, but Members may see things they shouldn't, or lose a convenience. Do it unless you have a reason not to. |
| ⚪ **Suggestion** | A matter of taste. The default is fine. |

---

## 1. What Neil does

Neil links each Member of the Discord server to their character (Player) in *Last Asylum: Plague*, and keeps their
nickname and roles matching the game.

| Capability | Who | How |
|------------|-----|-----|
| **Onboarding Interview** | every newcomer | When someone joins, Neil opens a private thread in `#onboarding` and asks which Player they are. The Member proves it with their uid (the number under their in-game profile picture). A Member who isn't Linked also gets an Interview on coming online, and at a start of Neil, up to 10 per start. If the thread got lost, `/interview` starts a new one. |
| **Link** | Neil | Once the Member confirms ("that's me"), Neil Links them to the Player, then gives them their nickname and roles. |
| **Preferences** | Neil | After the Link, one message in the Interview thread with four menus (Languages, Region, Interests, Experience) and a **Done** button. Each choice gives a Preference Role, which shows the matching channels. `/channels` shows the same menus later, privately. |
| **Nickname and roles** | Neil | Nickname `[TAG\|R5] Name` (the rank shows only for R4 and R5; ` \| #331` is added for Guests from another Kingdom). Roles: Alliance role (`[NML]`), Alliance Rank `R1`–`R5`, Kingdom `#330`, Troop Bracket `T1`–`T10`. |
| **Daily Sync** | Neil | Once a day (03:00 UTC by default) Neil re-reads the game and updates nicknames and roles. |
| **Keep newcomers in onboarding** | Neil | Members who aren't Linked hold the `Onboarding` role, which (with the Server Layout) lets them see only `#onboarding`. After the Link they keep it until their Interview thread closes, so they can finish their Preferences there. |
| **Doctor Role** | Neil | Every Linked Member, Guests included, holds the `Doctor` role. It shows the Guest area. |
| **Rank Approval** | the Alliance's R5, or an Officer | When the game lists no rank for a new Home Kingdom Member, Neil asks their Alliance's R5 in a private thread to confirm it. Guests aren't asked about; an Officer can still use `/rank`. |
| **Say goodbye** | Neil | A Linked Member who leaves the server is Unlinked, and the Officers are told in the log. |
| **Look up** | any Member | `/player` (by name or uid) and `/alliance` (by name or tag, with suggestions as you type) show profile cards. The Alliance card has a button for an activity overview. Each Member's lookups stop at a Daily Allowance. `/usage` shows a Member's own use. |
| **Correct a Link** | Officers, and Members for themselves | `/unlink` (Members: yourself; Officers: anyone), `/rank` (Officers set an Alliance Rank), `/link` (Officers Link a Member whose Interview was handed off). |
| **Daily Quota** | Officers | `/quota` shows how many Game API requests are left today, and the top Members. |
| **REAPER** | any Member; Home Kingdom R5s edit | A shared list of Exiles (malicious Players): `/reaper closest`, `/reaper list`, `/reaper add`, `/reaper remove`. |
| **Booty Call** | any Member of the Alliance | `/booty` in the Alliance's `alliance-chat` asks for a private Confirm, then posts a card that mentions the Members of that Alliance whose Booty Alerts match. One per Alliance per minute. `/booty-alerts` records when you want to be mentioned: Off (the default), Always, Only when online or Only when offline, with a daily window and your time zone. |
| **Help** | any Member | `/help` privately lists the commands you can use, how to write them and what they are for. Officers see their commands too. |
| **Ping** | any Member | `/ping` shows that Neil is online, and which version. Temporary. |

### What Neil never does

- It never changes **channel permissions**. The setup script does, as the owner's tool, while the owner gives it
  Administrator for that one run (ADR 12).
- It never touches roles other than its Managed Roles (Alliance roles, `R1`–`R5`, `#<kingdom>`, `T1`–`T10`), `Onboarding`,
  `Doctor` and the Preference Roles.
- It never checks **where** a command is used. Discord does that (section 5).
- It can't rename the **server owner**. Discord doesn't allow that.

---

## 2. Roles

| Role | Who creates it | Status | Purpose |
|------|----------------|--------|---------|
| **Neil** (the bot's own role) | Discord, when the bot is invited | 🔴 Requirement | Holds Neil's permissions. Its **position** matters. |
| **Moderator** | you | 🔴 Requirement | Officers. Can use the Officer commands and see the Daily Quota. |
| **King** | you | 🔴 Requirement | Officers too, treated the same as Moderator. |
| **Onboarding** | Neil, at a start with an unlinked Member, or you | automatic | Held by every Member who isn't Linked yet. |
| **Doctor** | Neil, at a start or at the first Link, or you | automatic | Held by every Linked Member, Guests included. |
| Alliance roles (e.g. `[NML]`) | Neil, when first needed | automatic | One per Home Kingdom Alliance, its tag in brackets. Shows that Alliance's area. The brackets are how the setup script finds it, so don't give another role such a name. |
| `R1`–`R5` | Neil, when first needed, or you | automatic | Alliance Rank, for Home Kingdom Alliances only. |
| `#330`, `#331`, … | Neil, when first needed, or you | automatic | The Kingdom a Member's Player is in. `#<Home Kingdom>` shows nearly everything. |
| `T1`–`T10` | Neil, when first needed | automatic | Troop Bracket. |
| **Preference Roles**: languages (e.g. `Italian`), `Americas`, `Europe/Africa`, `Asia/Oceania`, `PvP`, `Events`, `Recruitment`, `Off-topic`, `NaP discussions`, `New`, `Intermediate`, `Veteran` | Neil, when first chosen, or you | automatic | Given by the Member's choices. Regions, `New` and `Intermediate` show no channel. |

🔴 **Requirement: never give a permission to a role Neil uses.** Neil creates them with no permissions, and refuses to use
a role with one of these names that has any. A permission-free role you make with such a name **becomes Neil's**: it finds
roles by exact name, and gives and takes them by its own rules.

⚪ **Suggestion:** change the color, icon and "display separately" setting of Neil's roles as you like.

### Role order

Discord lets a bot manage only the roles and Members **below** its own role.

```
  King              ← Officers stay above Neil
  Moderator
  Neil              ← the bot's role
  Onboarding        ← everything Neil manages sits below Neil
  Doctor
  Preference Roles
  [NML], R5 … R1, #330, T10 … T1
  @everyone
```

- 🔴 **Requirement:** Neil sits **above** every role it gives. Neil doesn't check this at startup: a role above it is skipped, Member by Member.
- 🔴 **Requirement (a decision, ADR 8):** Neil sits **below** Moderator and King.
- ⚪ **Suggestion:** the order of the Managed Roles among themselves is up to you.

Neil can't change the nickname of a Member whose highest role is above Neil's. That's normal for Officers.

---

## 3. The Server Layout

`npm run server:setup` builds this layout from `server-layout.json` ([STARTUP-GUIDE.md](STARTUP-GUIDE.md#3-run-the-setup-script)).
Every category denies **@everyone** View Channel. The table says which role is allowed to see it. Set permissions on the
category and keep channels synced, unless the row says otherwise. `Kingdom` means `#<Home Kingdom>`.

**Guests see only the Guest area.** The server holds tactical plans, so everything else is for the Home Kingdom.

| Category | Channels | Seen by | Status |
|----------|----------|---------|--------|
| Onboarding | `#onboarding` | Onboarding, Moderator, King, `R5` | 🔴 |
| Officers | `#neil-log`, Moderator channel | Moderator, King | 🔴 for the log; 🟡 for the Moderator channel |
| Basic information | `#rules`, `#welcome` (read only) | Kingdom | 🟡 |
| Home Kingdom | Home Kingdom announcements (only King posts), `#gift-codes` (only `R4`, `R5` and King post, or a Follow from the game's official server) and your other Home Kingdom channels | Kingdom | 🟡 |
| Hangout | `#general`, voice, `#alliance-hall` (commands) | Kingdom | 🟡 |
| Guest area | guest rules (read only), text, voice, announcements for everyone (only King posts) | Doctor | 🟡 |
| NaP | closed discussion | NaP discussions, King | 🟡 |
| | closed leaders' channel | `R5`, King | 🟡 |
| | NaP announcements (only King posts; Interaction Bot translates) | Kingdom | 🟡 |
| | NaP forum | Kingdom | 🟡 |
| Languages | one general chat per language you name | that language's Preference Role | 🟡 |
| PvP | chat, voice, intel (Members use `/player`, `/alliance`, `/reaper` here), tactics forum | PvP | 🟡 |
| Events | event chat, event announcements, ask for help, guides forum | Events | 🟡 |
| Alliance Duel | chat, voice, announcements (only King posts), tactics forum, intel | PvP, Events | 🟡 |
| Kingdom vs Kingdom | the same, plus five voice channels: Vanguard, Overwatch, Strike Team, Blackout, War Room | PvP, Events | 🟡 |
| Recruitment | one text channel | Recruitment | 🟡 |
| Off-topic | off-topic, memes | Off-topic | 🟡 |
| One per Alliance | text, voice | that Alliance's tag | 🟡 |

**Special cases**

- **Only King posts** (announcements): set these on the channel itself. A role's ✅ beats the ❌ on @everyone, so the role
  that sees the channel needs its own ❌ on Send Messages, Send Messages in Threads, Create Public Threads and Create
  Private Threads. **King** gets View Channel and Send Messages ✅.
- **Interaction Bot** needs View Channel and Send Messages ✅ on the announcement channels it translates. Bots hold no
  Doctor or Kingdom role, so without this allow it stops.
- **Read only** (Basic information, guest rules): the role that sees the channel gets Send Messages ❌.
- **Guides forum**: **Events** View Channel ✅; **Veteran** Create Posts and Send Messages in Threads ✅; **Moderator** and
  **King** Manage Threads ✅, which is what makes it moderated. A Veteran writes there only when they hold Events too.
- **No Community on your server?** Forums and announcement channels may need it. Use plain text channels instead; the
  permissions above stay the same.
- **Guest area, no commands:** nothing to set here. Section 5 limits every command to other channels, and Guests see none of them.

---

## 4. Requirements, Recommendations, Suggestions

**Bot token?** says whether the setup script can set it: Yes, Yes* (only during the run, under temporary Administrator, ADR 12),
or No (a person must do it).

### 🔴 Requirements

| What | Breaks without it | Bot token? |
|------|-------------------|------------|
| **Channels** | | |
| `#onboarding` and `#neil-log`, both ordinary text channels | Neil won't start | Yes* |
| **Roles** | | |
| Moderator and King, with IDs in configuration | Neil won't start without valid IDs; a wrong ID means that role has no Officers | Yes to create; No to place above Neil |
| Neil's role above every role it gives | Roles and nicknames skipped, Member by Member | No |
| Neil's role below Moderator and King | A safety rule, ADR 8; nothing breaks | No |
| Each role exists before a channel refers to it | Setup can't be done in order | Yes, except Alliance roles, which appear with their first Member; run the script again then |
| No permissions on Neil's roles | That role is never given | Yes, as a check |
| **Permissions** | | |
| Server Members Intent and Presence Intent (Developer Portal) | Neil can't log in | No |
| Manage Roles and Manage Nicknames on Neil | All name and role changes; one line in the log | No |
| Neil in `#onboarding`: View Channel, Send Messages in Threads, Create Private Threads, Manage Threads | Neil won't start | Yes* |
| Neil in `#neil-log`: View Channel, Send Messages | Neil won't start | Yes* |
| Read Message History for Neil and Use Application Commands for Members, in `#onboarding` (they usually come from @everyone defaults; don't deny them) | Interview edits; `/interview` | Yes* |
| Onboarding in `#onboarding`: View Channel, Send Messages, Send Messages in Threads | Onboarding Interview | Yes* |
| Moderator and King in `#onboarding`: View Channel, Manage Threads | Hand-offs, and Rank Approval with no Linked R5 | Yes* |
| `R5` in `#onboarding`: View Channel, Send Messages in Threads | Rank Approval by an R5 | Yes*, once `R5` exists |
| @everyone View Channel denied everywhere | Keeping newcomers in onboarding | Yes* |
| @everyone denied on `#neil-log`, Moderator and King allowed | The log shows uids, which are In-game Proof | Yes* |
| Commands registered (`npm run commands:register`) | Every command | Yes |
| Moderator and King allowed on `/quota`, `/rank`, `/link` in Integrations | Officers can't use them (except Administrators) | No: Discord needs an admin's own login, so this stays manual |

### 🟡 Recommendations

| What | Without it | Bot token? |
|------|------------|------------|
| Every category and channel in the Server Layout (section 3) | Members lose that part of the server; Guests may see tactical plans | Yes*; roles must exist first |
| Unlinked Officers Linked, or Moderator and King allowed on the categories they need | Officers lose channels once they are hidden | Yes* |
| Nothing beyond Neil's needs, and never Administrator | More damage if the token leaks | No |
| Command channels as in section 5 | Commands usable anywhere | No |
| Permissions on categories, channels synced | More work, more mistakes | Yes* |
| Check with View Server As Role and an account that isn't an Administrator | Mistakes go unnoticed | No |

### ⚪ Suggestions

| What | Bot token? |
|------|------------|
| Color, icon, "display separately" and order of Neil's roles | Yes |
| `#rules` visible to newcomers: **Onboarding** View Channel ✅ on that channel | Yes* |
| `DISCORD_GUIDES_FORUM_ID`, so the Preferences message links the forum | No: a hosting setting |
| The tuning settings in section 6 | No: hosting settings |

---

## 5. Commands

Set in Server Settings → **Integrations** → **Neil**. Neil doesn't check the channel, so this is all there is. Administrators
can use every command everywhere, so test with an account that isn't one.

| Command | **Roles & Members** | **Channels** |
|---------|---------------------|--------------|
| `/quota`, `/rank`, `/link` | 🔴 add **Moderator** and **King** | 🟡 Moderator channel |
| `/player`, `/alliance`, `/reaper` | leave as is | 🟡 `#alliance-hall` and the intel channels (PvP, Alliance Duel, Kingdom vs Kingdom) |
| `/channels`, `/usage`, `/ping`, `/help` | leave as is | 🟡 `#alliance-hall` |
| `/booty` | leave as is | 🔴 don't limit it, or allow every `alliance-chat`: it works nowhere else |
| `/booty-alerts` | leave as is | 🟡 `#alliance-hall` |
| `/unlink` | leave as is | 🟡 `#alliance-hall` and the Moderator channel |
| `/interview` | leave as is | 🟡 `#onboarding`, or newcomers can't start a new Interview |

Neil still checks the Officer role itself, so a mistake here never gives a Member Officer powers.

Guests see none of these channels, so they have no commands. An Officer runs `/unlink member:@them` for a Guest.

---

## 6. Settings for whoever runs Neil

These live with Neil's hosting, not in Discord ([HOSTING.md §3](HOSTING.md#3-wispbyte-server)).

| Setting | Status | What it does | Default |
|---------|--------|--------------|---------|
| `DISCORD_TOKEN`, `DISCORD_APPLICATION_ID` | 🔴 Requirement | The bot's login | — |
| `DISCORD_GUILD_ID`, `DISCORD_MODERATOR_ROLE_ID`, `DISCORD_KING_ROLE_ID`, `DISCORD_ONBOARDING_CHANNEL_ID`, `DISCORD_LOG_CHANNEL_ID`, `HOME_KINGDOM` | 🔴 Requirement | Which server, roles, channels and Kingdom | — |
| `LAP_TRACKER_API_KEY` | 🔴 Requirement | Key for the Game API | — |
| **Server Members Intent**, **Presence Intent** (Developer Portal → Bot) | 🔴 Requirement | Joins, leaves and coming online. Without them Neil can't log in | — |
| `DATA_DIR` | ⚪ Suggestion | Where Neil keeps its database | `./data` |
| `INTERVIEW_TIMEOUT_MINUTES` | ⚪ Suggestion | How long an Interview may stay silent before it's abandoned | `1440` (one day) |
| `SYNC_HOUR_UTC` | ⚪ Suggestion | Hour of the Daily Sync, UTC | `3` |
| `SYNC_SHARE` | ⚪ Suggestion | Game API requests the Daily Sync may use. It also shrinks the Daily Allowance | `500` |
| `GAME_API_QUOTA_RESERVE` | ⚪ Suggestion | Requests kept back for Interviews. It also shrinks the Daily Allowance | `100` |
| `GAME_API_CACHE_MINUTES` | ⚪ Suggestion | How long a lookup is cached (at least 10) | `10` |
| `TROOP_BRACKET_LEVELS` | ⚪ Suggestion | Sanctuary level where each of T1–T10 starts | `1,3,6,10,14,17,20,24,27,30` |
| `DISCORD_GUIDES_FORUM_ID` | ⚪ Suggestion | ID of the guides forum, named in the Veteran and New guides line of the Preferences message | — (the line says "the guides forum") |

The Daily Allowance has no setting of its own: Neil works it out from what's left of the Daily Quota.

Slash commands are registered by the developer (`npm run commands:register`) when the command list changes. After that,
check section 5 for any new command.

---

## 7. Where to change what

| I want to… | Go to |
|------------|-------|
| add or remove an Officer | give or take the **Moderator** / **King** role (right-click the Member → **Roles**) |
| fix someone's Link | `/unlink member:@them` (Officer), then they redo the Interview. `/link member:@them uid:…` works only for a Member whose Interview was handed off |
| set an Alliance Rank the game doesn't show | `/rank member:@them rank:R4` (Officer) |
| let newcomers see one more channel (e.g. `#rules`) | that channel → **Edit Channel** → **Permissions** → **Onboarding**: View Channel ✅ |
| give the Home Kingdom a new channel | the channel or its category → **Permissions** → `#<Home Kingdom>`: View Channel ✅ |
| feed `#gift-codes` from the game's official server | in the official server's announcement channel, press **Follow** and choose `#gift-codes`. You need **Manage Webhooks** on this server; the posts arrive whatever the channel's Send Messages settings say |
| give Guests a new channel | put it in the Guest area, or give **Doctor** View Channel ✅ |
| give a new Alliance its area | run the setup script again ([STARTUP-GUIDE.md](STARTUP-GUIDE.md#6-add-alliance-areas)) |
| change the Server Layout | edit `server-layout.json`, then run the setup script again; what you remove from it stays on the server and is reported |
| change a role's color | Server Settings → **Roles** → the role → **Display** |
| move the log or onboarding channel | create the new channel with the permissions in section 4, send its ID, and Neil restarts |
| see what a newcomer sees | Server Settings → **Roles** → **Onboarding** → **View Server As Role** |
| see what a Guest sees | the same, with **Doctor** alone |
| check Neil is online | `/ping` |

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Neil is offline after a change | a missing or wrong setting, an intent off, or a problem in `#onboarding` or `#neil-log`. Neil stops and posts nothing | whoever runs Neil checks the console. It names the problem |
| Officers aren't recognized, though Neil runs | a wrong Moderator or King ID: Neil checks only the format | correct the ID and restart |
| `#neil-log` says Neil lacks Manage Roles / Manage Nicknames | Neil's role misses the permission | give Neil's role the permission |
| Roles or nicknames don't change | Neil's role is too low, or the Member is above Neil | drag Neil's role up, still below Moderator and King |
| Neil ignores a role you made, e.g. `R5` | the role has permissions | remove all its permissions |
| Newcomers see the whole server | @everyone isn't denied, or a channel isn't synced to its category | deny @everyone View Channel; **Sync Now** |
| Linked Members lose access | a category allows a role they don't hold, or they aren't Linked on the database Neil runs on | check the role in section 3; check the Links ([HOSTING.md](HOSTING.md)) |
| A Guest sees a Home Kingdom channel | that channel allows **Doctor** or a Preference Role | allow `#<Home Kingdom>` instead; see section 3 |
| `/player` isn't offered in a channel | section 5 limits it | use `#alliance-hall`, or add the channel |
| A newcomer can't use `/interview` | section 5 doesn't include `#onboarding` | add `#onboarding` for `/interview` |
| An R5 can't open a Rank Approval thread | `R5` lacks a permission in `#onboarding` | section 4 |
| Translations stop in an announcement channel | Interaction Bot lost its allow | section 3, special cases |
| Officers don't see `/quota`, `/rank`, `/link` | Integrations isn't set | section 5 |
| The setup script refuses a real run | Neil's role lacks Administrator, or Neil has no role | give it for the run, then take it off |
| The setup script makes a second channel | the name in `server-layout.json` differs from yours | use the exact name in the file |
| The server owner has no nickname | Discord doesn't let bots rename the owner | set it by hand |
