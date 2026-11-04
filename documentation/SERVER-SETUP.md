# Setting up your Discord server for Neil

A guide for server owners and admins. It covers what Neil does, which roles and channels it needs, and
where in Discord to change each setting. Running the bot itself (token, hosting, deploys) is covered in
[HOSTING.md](HOSTING.md).

## How to read this guide

Every setting has one of three labels:

| Label | Meaning |
|-------|---------|
| 🔴 **REQUIRED** | Neil won't start, or the feature named next to it won't work, without this. |
| 🟡 **RECOMMENDED** | Neil works without it, but Members may see things they shouldn't, or Officers lose a convenience. Do it unless you have a reason not to. |
| ⚪ **OPTIONAL** | A matter of taste. The default is fine. |

"Requirement" in this guide always means 🔴. Anything else is advice.

---

## 1. What Neil does

Neil links each Member of the Discord server to their character (Player) in *Last Asylum: Plague*, and
keeps their nickname and roles matching the game.

| Capability | Who | How |
|------------|-----|-----|
| **Onboarding Interview** | every newcomer | When someone joins, Neil opens a private thread in `#onboarding` and asks which Player they are. The Member proves it with their uid (the number under their in-game profile picture). If the thread got lost, `/interview` starts a new one. |
| **Link** | Neil | Once the Member confirms ("that's me"), Neil Links them to the Player, then gives them their nickname and roles. |
| **Preferences** | Neil | After the Link, one message in the Interview thread with four menus (Languages, Region, Interests, Experience) and a **Done** button. Each choice gives a Preference Role, which shows the matching channels (step 8b). `/channels` shows the same menus later, privately. |
| **Nickname and roles** | Neil | Nickname `[TAG\|R5] Name` (the rank shows only for R4 and R5; ` \| #331` is added for Guests from another Kingdom). Roles: Alliance tag, Alliance Rank `R1`–`R5`, Kingdom `#330`, Troop Bracket `T1`–`T10`. |
| **Daily Sync** | Neil | Once a day (03:00 UTC by default) Neil re-reads the game and updates nicknames and roles. |
| **Keep newcomers in onboarding** | Neil | Members who aren't Linked hold the `Onboarding` role, which (with the channel permissions in step 8) lets them see only `#onboarding`. |
| **Rank Approval** | the Alliance's R5, or an Officer | When the game lists no rank for a new Member, Neil asks their Alliance's R5 in a private thread to confirm it. |
| **Say goodbye** | Neil | A Linked Member who leaves the server is Unlinked, and the Officers are told in the log. |
| **Look up** | any Member | `/player` (by name or uid) and `/alliance` (by name or tag, with suggestions as you type) show profile cards. The Alliance card has a button for an activity overview. |
| **Correct a Link** | Officers, and Members for themselves | `/unlink` (Members: yourself; Officers: anyone), `/rank` (Officers set an Alliance Rank), `/link` (Officers Link a Member by hand). |
| **Daily Quota** | Officers | `/quota` shows how many Game API requests are left today. |
| **REAPER** *(coming soon, not live yet)* | any Member; Home Kingdom R5s edit | A shared list of Exiles (malicious Players): `/reaper closest`, `/reaper list`, `/reaper add`, `/reaper remove`. |
| **Ping** | any Member | `/ping` shows that Neil is online, and which version. Temporary. |

### What Neil never does

- It never changes **channel permissions**. You set those yourself (steps 6 and 8).
- It never touches roles other than its Managed Roles (Alliance tags, `R1`–`R5`, `#<kingdom>`, `T1`–`T10`) and
  `Onboarding`.
- It can't rename the **server owner**. Discord doesn't allow that.

---

## 2. Roles at a glance

| Role | Who creates it | Status | Purpose |
|------|----------------|--------|---------|
| **Neil** (the bot's own role) | Discord, when the bot is invited | 🔴 REQUIRED | Holds Neil's permissions. Its **position** matters (section 3). |
| **Moderator** | you | 🔴 REQUIRED | Officers. Can use the Officer commands and see the Daily Quota. |
| **King** | you | 🔴 REQUIRED | Officers too, treated the same as Moderator. |
| **Onboarding** | Neil, at its first start | created automatically | Held by every Member who isn't Linked yet. |
| Alliance tags (e.g. `NML`) | Neil, when first needed | created automatically | One per Home Kingdom Alliance. |
| `R1`–`R5` | Neil, when first needed | created automatically | Alliance Rank, for Home Kingdom Alliances only. |
| `#330`, `#331`, … | Neil, when first needed | created automatically | The Kingdom a Member's Player is in. |
| `T1`–`T10` | Neil, when first needed | created automatically | Troop Bracket (highest troop tier the sanctuary level unlocks). |
| **Preference Roles**: languages (e.g. `Italian`), `Americas`, `Europe/Africa`, `Asia/Oceania`, `PvP`, `Events`, `Trading`, `Off-topic`, `NaP discussions`, `New`, `Intermediate`, `Veteran` | Neil, when first needed | created automatically | Given by the Member's choices (section 1, Preferences). They show the channels in step 8b. |

🔴 **REQUIRED: never give a permission to a role Neil creates.** Neil creates them with no permissions, and refuses
to use a role with one of these names (`Onboarding`, an Alliance tag, `R1`–`R5`, `#<number>`, `T1`–`T10`, a Preference
Role) that has any. If you made such a role yourself before, remove its permissions or delete it and let Neil recreate it.

⚪ **OPTIONAL:** you may change the **color**, **icon** and **"display separately"** setting of Neil's roles. Neil
doesn't mind.

## 3. Role order

Discord lets a bot manage only the roles and Members **below** its own role. Neil's order:

```
  King              ← Officers stay above Neil
  Moderator
  Neil              ← the bot's role
  Onboarding        ← everything Neil manages sits below Neil
  Preference Roles
  NML, R5 … R1, #330, T10 … T1
  @everyone
```

- 🔴 **REQUIRED:** **Neil** sits **above** `Onboarding`, the Preference Roles and every Managed Role, or it can't give or remove them.
- 🔴 **REQUIRED:** **Neil** sits **below** Moderator and King.
- ⚪ **OPTIONAL:** the order of the Managed Roles among themselves.

**Where:** Server Settings → **Roles** → drag the roles into place.

Neil also can't change the nickname of a Member whose highest role is above Neil's. That's normal for Officers.

## 4. Channels at a glance

| Channel | Status | Purpose |
|---------|--------|---------|
| `#onboarding` (a text channel) | 🔴 REQUIRED | Neil opens one private thread per newcomer here. |
| `#neil-log` (a text channel) | 🔴 REQUIRED | Neil reports Links, Unlinks, handed-off Interviews, missing permissions and problems here. |
| A moderator-only channel | 🟡 RECOMMENDED | Where Officers use `/quota`, `/rank` and `/link`. |
| Language, region and interest channels | 🟡 RECOMMENDED | Shown only to Members with the matching Preference Role (step 8b). |
| The NaP publications channel | 🟡 RECOMMENDED | Visible to every Linked Member (step 8b). |
| The guides forum | 🟡 RECOMMENDED | Readable by everyone; Veterans are invited to write (step 8b). |
| Every other channel | — | Hidden from newcomers (step 8). |

The names don't matter; Neil finds the channels by their ID (step 7). Both must be ordinary **text channels**,
not forum or announcement channels.

---

## 5. Step-by-step setup

Do the steps in order. Each step says where to click.

### Step 1: Turn on Developer Mode (for you)

You need it to copy IDs later.

**Where:** User Settings (the gear next to your name) → **Advanced** → **Developer Mode** on.

### Step 2: Invite Neil

🔴 **REQUIRED.** The bot's developer gives you an invite link (HOSTING.md §1 covers how it's made). Open it, pick
your server, confirm. A role called **Neil** appears.

### Step 3: Officer roles

🔴 **REQUIRED.** Create (or keep) a **Moderator** and a **King** role and give them to your Officers.

**Where:** Server Settings → **Roles** → **Create Role**.

### Step 4: Neil's server permissions

🔴 **REQUIRED** for nicknames and roles. Give Neil's role:

- **Manage Roles**
- **Manage Nicknames**

**Where:** Server Settings → **Roles** → **Neil** → **Permissions** tab.

If one is missing, Neil says so in `#neil-log` at startup.

🟡 **RECOMMENDED:** give Neil nothing else, and in particular not **Administrator**. Neil doesn't need it, and a
bot with fewer rights can do less damage if its token leaks.

### Step 5: Role order

🔴 **REQUIRED.** Drag Neil's role **below** King and Moderator. Neil's own roles (`Onboarding` etc.) appear after its
first start; check then that they sit **below** Neil (section 3).

### Step 6: Create the two channels

🔴 **REQUIRED.** Create a text channel for onboarding (e.g. `#onboarding`) and one for the log (e.g. `#neil-log`).

**Where:** the **+** next to a category → **Text** channel.

Set these channel permissions. **Where:** hover over the channel → gear (**Edit Channel**) → **Permissions** →
**Advanced permissions** → **+** next to *Roles/Members* → pick the role, then set each permission to ✅ (allow)
or ❌ (deny).

**`#onboarding`**

| Role | Permission | Setting | Status |
|------|------------|---------|--------|
| **Neil** | View Channel, Send Messages in Threads, Create Private Threads, Manage Threads | ✅ | 🔴 REQUIRED |
| **Moderator**, **King** | View Channel, Manage Threads | ✅ | 🟡 RECOMMENDED: lets Officers see and step into stuck Interviews |
| **Onboarding** | View Channel, Send Messages, Send Messages in Threads | ✅ | 🔴 REQUIRED for newcomers to answer in their thread |
| **R5** | View Channel, Send Messages in Threads | ✅ | 🔴 REQUIRED for Rank Approval: Alliance leaders open the private threads Neil adds them to (they only see those) |
| **@everyone** | View Channel | ❌ | 🟡 RECOMMENDED: Linked Members don't need to see onboarding |

Neil deletes each Interview thread when it's finished.

**`#neil-log`**

| Role | Permission | Setting | Status |
|------|------------|---------|--------|
| **Neil** | View Channel, Send Messages | ✅ | 🔴 REQUIRED |
| **Moderator**, **King** | View Channel | ✅ | 🟡 RECOMMENDED: the log is written for Officers |
| **@everyone** | View Channel | ❌ | 🟡 RECOMMENDED, strongly: the log shows uids, which are what Members prove their identity with |

If a permission is missing, Neil says so at startup (in its console, and in the log when it can post there).

### Step 7: Send the IDs to whoever runs Neil

🔴 **REQUIRED.** Neil won't start until it has these. Right-click each item → **Copy … ID** (needs step 1), and pass
them to whoever runs Neil (HOSTING.md §3 covers where they go):

| What | Right-click | Setting name |
|------|-------------|--------------|
| The server | the server icon → **Copy Server ID** | `DISCORD_GUILD_ID` |
| Moderator role | Server Settings → Roles → `…` next to the role → **Copy Role ID** | `DISCORD_MODERATOR_ROLE_ID` |
| King role | same | `DISCORD_KING_ROLE_ID` |
| `#onboarding` | the channel → **Copy Channel ID** | `DISCORD_ONBOARDING_CHANNEL_ID` |
| `#neil-log` | the channel → **Copy Channel ID** | `DISCORD_LOG_CHANNEL_ID` |
| Home Kingdom | — (the number, e.g. `330`) | `HOME_KINGDOM` |

After Neil restarts with these, `/ping` answers and the `Onboarding` role appears under Server Settings → Roles.

### Step 8: Hide the rest of the server from newcomers

🔴 **REQUIRED for "keep newcomers in onboarding"**. Without it, newcomers still hold the `Onboarding` role but see
every channel. Do this **after** Neil has created the `Onboarding` role.

For every category (or channel not in a category) **except** `#onboarding`:

| Role | Permission | Setting |
|------|------------|---------|
| **@everyone** | View Channel | ❌ |
| the roles that should see it, e.g. `#330` (every Linked Member of the Home Kingdom), Alliance tags, or Guest Kingdom roles | View Channel | ✅ |

**Where:** right-click the **category** → **Edit Category** → **Permissions**. Then, for each channel in it, open
**Edit Channel** → **Permissions** and click **Sync Now** if Discord shows the channel is not synced. Channels
outside a category are set one by one.

🟡 **RECOMMENDED:** set permissions on **categories** and keep channels synced. It's much less work, and a channel
created later inherits them.

Tip: open **Server Settings → Roles → Onboarding → View Server As Role** to check what a newcomer sees. They
should see only `#onboarding`.

### Step 8b: Show channels by Preference

🟡 **RECOMMENDED.** Preference Roles (section 2) decide which channels a Member sees, once they have chosen. Set these
the same way as step 8, on the channel or its category. Neil never changes these permissions itself.

**Language, region and interest channels.** For each one, e.g. the auto-translated Italian channel (role **Italian**),
or `Europe/Africa`, `PvP`:

| Role | Permission | Setting |
|------|------------|---------|
| **@everyone** | View Channel | ❌ |
| that channel's Preference Role, e.g. **Italian** | View Channel | ✅ |

**NaP discussions.** The channel is visible only to the **NaP discussions** role. Neil gives it to every R5 and to each
R4 who chooses it, and takes it off anyone else.

| Role | Permission | Setting |
|------|------------|---------|
| **@everyone** | View Channel | ❌ |
| **NaP discussions** | View Channel | ✅ |

**NaP publications.** Every Linked Member sees it, with no Preference Role. Set it as in step 8: **@everyone** View
Channel ❌, and the roles of Linked Members (e.g. `#330`) View Channel ✅.

**Guides forum.** Everyone can read it, newcomers included, so this one channel is the exception to step 8: **@everyone**
View Channel ✅. The **Veteran** role is invited to write in it: give **Veteran** Create Posts ✅ and Send Messages in
Threads ✅ on that forum.

🟡 **RECOMMENDED:** check one language with **View Server As Role**, as in step 8.

### Step 9: Make the Officer commands visible to Officers

🔴 **REQUIRED** for Officers to use `/quota`, `/rank` and `/link`. Discord hides these three from everyone except
Administrators until you allow them.

**Where:** Server Settings → **Integrations** → **Neil** → for each of `/quota`, `/rank` and `/link`:

1. **Roles & Members** → **Add** → **Moderator** and **King**. 🔴 REQUIRED
2. **Channels** → limit it to the moderator-only channel. 🟡 RECOMMENDED

Leave `/player`, `/alliance`, `/interview`, `/unlink`, `/channels`, `/reaper` and `/ping` as they are: every Member may use them.
Neil still checks the Officer role itself, so a mistake here never gives a Member Officer powers.

### Step 10: Test it

🟡 **RECOMMENDED.** With an alt account (or a willing friend):

1. Join the server. Only `#onboarding` is visible, and a private thread opens in it.
2. Give the uid and confirm. The nickname and roles appear, `#onboarding` disappears, the rest of the server
   becomes visible, and the thread is deleted.
3. `#neil-log` shows the Link.
4. `/unlink` yourself. The roles and nickname go, and `Onboarding` comes back.

---

## 6. Settings for whoever runs Neil

These live with Neil's hosting, not in Discord ([HOSTING.md §3](HOSTING.md#3-wispbyte-server)). Most server admins
never need them.

| Setting | Status | What it does | Default |
|---------|--------|--------------|---------|
| `DISCORD_TOKEN`, `DISCORD_APPLICATION_ID` | 🔴 REQUIRED | The bot's login | — |
| The six IDs and numbers from step 7 | 🔴 REQUIRED | Which server, roles, channels and Kingdom | — |
| `LAP_TRACKER_API_KEY` | 🔴 REQUIRED | Key for the Game API | — |
| **Server Members Intent** (developer portal → Bot) | 🔴 REQUIRED | Lets Neil see joins and leaves. Without it Neil can't log in | — |
| `INTERVIEW_TIMEOUT_MINUTES` | ⚪ OPTIONAL | How long an Interview may stay silent before it's abandoned | `1440` (one day) |
| `SYNC_HOUR_UTC` | ⚪ OPTIONAL | Hour of the Daily Sync, UTC | `3` |
| `SYNC_SHARE` | ⚪ OPTIONAL | Game API requests the Daily Sync may use | `500` |
| `GAME_API_QUOTA_RESERVE` | ⚪ OPTIONAL | Requests kept back for Interviews | `100` |
| `GAME_API_CACHE_MINUTES` | ⚪ OPTIONAL | How long a lookup is cached (at least 10) | `10` |
| `TROOP_BRACKET_LEVELS` | ⚪ OPTIONAL | Sanctuary level where each of T1–T10 starts | `1,3,6,10,14,17,20,24,27,30` |
| `DISCORD_GUIDES_FORUM_ID` | ⚪ OPTIONAL | ID of the guides forum, named in the Veteran and New guides line of the Preferences message | — (the line says "the guides forum") |

Slash commands are registered by the developer (`npm run commands:register`) when the command list changes. After
that, check step 9 again for any new Officer command.

---

## 7. Where to change what

| I want to… | Go to |
|------------|-------|
| add or remove an Officer | give or take the **Moderator** / **King** role (right-click the Member → **Roles**) |
| fix someone's Link | `/unlink member:@them` (Officer), then they redo the Interview, or `/link member:@them uid:…` |
| set an Alliance Rank the game doesn't show | `/rank member:@them rank:R4` (Officer) |
| let newcomers see one more channel (e.g. `#rules`) | that channel → **Edit Channel** → **Permissions** → **Onboarding**: View Channel ✅ |
| give Linked Members a new channel | the channel or its category → **Permissions** → `#330` (or the Alliance role): View Channel ✅ |
| give an Alliance its own channel | channel → **Permissions** → @everyone View Channel ❌, the Alliance tag role View Channel ✅ |
| change a role's color | Server Settings → **Roles** → the role → **Display**. Fine for Neil's roles too |
| move the log or onboarding channel | create the new channel with step 6's permissions, send its ID (step 7), and Neil restarts |
| see what a newcomer sees | Server Settings → **Roles** → **Onboarding** → **View Server As Role** |
| check Neil is online | `/ping` |

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Neil is offline after a change | a missing or wrong ID, or Server Members Intent off | whoever runs Neil checks the console. It names the setting |
| `#neil-log` says Neil lacks Manage Roles / Manage Nicknames | step 4 | give Neil's role the permission |
| Roles or nicknames don't change | Neil's role is too low (step 5), or the Member is above Neil | drag Neil's role up, still below Moderator and King |
| Neil ignores a role you made, e.g. `R5` | the role has permissions | remove all its permissions |
| No thread opens for a newcomer | Neil lacks a permission in `#onboarding` (step 6) | check the four 🔴 permissions; the newcomer then runs `/interview` |
| Newcomers see the whole server | step 8 not done, or a channel isn't synced to its category | deny @everyone View Channel; **Sync Now** |
| Linked Members lose access to everything | step 8 allows a role they don't hold | allow `#330` (and Guest Kingdom roles) on those categories |
| An R5 can't open a Rank Approval thread | `R5` lacks View Channel / Send Messages in Threads in `#onboarding` | step 6 |
| Officers don't see `/quota`, `/rank`, `/link` | step 9 | Integrations → Neil → add Moderator and King |
| The server owner has no nickname | Discord doesn't let bots rename the owner | set it by hand |
