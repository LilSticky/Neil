# Startup guide: a new server

For another Kingdom's server, running its own Neil: its own Discord application, hosting, database and Game API key. Do the
steps in order; several depend on the one before. [SERVER-SETUP.md](SERVER-SETUP.md) is the reference for everything named
here. On a server that already has Members, use [MIGRATION-GUIDE.md](MIGRATION-GUIDE.md).

`#<Home Kingdom>` means your Kingdom role, for example `#330`.

## Before you start

- Two people's work: the **server owner** (Discord) and **whoever runs Neil** (hosting, [HOSTING.md](HOSTING.md)). It can be one person.
- Turn on Developer Mode, to copy IDs: User Settings → **Advanced** → **Developer Mode**.
- ⚪ Community is optional. Forums and announcement channels may need it; without it, use plain text channels.

## 1. Create the application

*Whoever runs Neil.* Follow [HOSTING.md §1](HOSTING.md). In the Developer Portal → **Bot**, switch on **Server Members Intent**
and **Presence Intent**. Neil can't log in without both.

## 2. Invite Neil

Open the invite link, pick your server, confirm. Check that a **Neil** role appears; if it doesn't, tell whoever runs Neil,
because the link has to carry a permission.

Give Neil's role **Manage Roles** and **Manage Nicknames**, and nothing else: Server Settings → **Roles** → **Neil** → **Permissions**.

## 3. Create the Officer roles

Create **Moderator** and **King** and give them to your Officers: Server Settings → **Roles** → **Create Role**. Drag them
**above** Neil.

## 4. Create the roles channels will use

Neil creates its roles when it first needs them, which is too late for setting channels. Create these yourself, with **no
permissions**, **below** Neil. Neil adopts them by name, so spell them exactly:

- `Onboarding`, `Doctor`, `R5`, `#<Home Kingdom>`
- `NaP discussions`, `PvP`, `Events`, `Off-topic`, `Recruitment`, `Veteran`
- one language role for each language channel you want, spelled as in the Preferences menu (e.g. `Italian`)

## 5. Create `#onboarding` and `#neil-log`

Create two ordinary text channels. Neil won't start without them and their permissions.

**Where:** hover over the channel → gear → **Permissions** → **Advanced permissions** → **+** → pick the role.

| Channel | Role | Permission | Setting |
|---------|------|------------|---------|
| `#onboarding` | **Neil** | View Channel, Send Messages in Threads, Create Private Threads, Manage Threads | ✅ |
| | **Moderator**, **King** | View Channel, Manage Threads | ✅ |
| | **Onboarding** | View Channel, Send Messages, Send Messages in Threads | ✅ |
| | `R5` | View Channel, Send Messages in Threads | ✅ |
| | **@everyone** | View Channel | ❌ |
| `#neil-log` | **Neil** | View Channel, Send Messages | ✅ |
| | **Moderator**, **King** | View Channel | ✅ |
| | **@everyone** | View Channel | ❌ |

## 6. Start Neil

Right-click each item → **Copy … ID**, and send them to whoever runs Neil:

| What | Setting |
|------|---------|
| The server | `DISCORD_GUILD_ID` |
| Moderator, King | `DISCORD_MODERATOR_ROLE_ID`, `DISCORD_KING_ROLE_ID` |
| `#onboarding`, `#neil-log` | `DISCORD_ONBOARDING_CHANNEL_ID`, `DISCORD_LOG_CHANNEL_ID` |
| Your Kingdom's number | `HOME_KINGDOM` |

*Whoever runs Neil* adds them with the other settings ([SERVER-SETUP.md §6](SERVER-SETUP.md#6-settings-for-whoever-runs-neil)),
registers the commands (`npm run commands:register`) and starts Neil. If Neil stays offline, its console names the problem.

Check: `/ping` answers.

## 7. Build the Server Layout

Create the categories and channels in [SERVER-SETUP.md §3](SERVER-SETUP.md#3-the-server-layout). For each category:

1. Allow the role that should see it: View Channel ✅.
2. Deny **@everyone**: View Channel ❌.
3. In each channel, click **Sync Now** if Discord shows it isn't synced.

Then set the special cases on the channels themselves: only King posts, Interaction Bot, read only, the guides forum.

Alliance areas come later: a tag role appears with an Alliance's first Linked Member. Create the area then.

## 8. Set the commands

Set **Integrations** as in [SERVER-SETUP.md §5](SERVER-SETUP.md#5-commands). This stays manual, because Discord needs an
admin's own login for it. Add `#onboarding` for `/interview` when you turn off **All Channels**, or newcomers lose it.

## 9. Test it

With an account that isn't an Administrator:

1. Join. Only `#onboarding` is visible, and a private thread opens in it.
2. Give the uid and confirm. The nickname and roles appear, **Doctor** among them, and `Onboarding` goes. The thread stays
   until you press **Done**, or until it times out, and while a Rank Approval is waiting.
3. `#neil-log` shows the Link.
4. **View Server As Role**: **Doctor** alone shows the Guest area only; **Doctor** plus `#<Home Kingdom>` shows the rest.
5. `/unlink` yourself in `#alliance-hall`. The roles and nickname go, and `Onboarding` comes back.

**Check at step 2:** does the Member still see the Preferences message? Once `Onboarding` is gone they can't view
`#onboarding`, and this has not been tested yet. If it's gone, they use `/channels` in `#alliance-hall`, and report it.
