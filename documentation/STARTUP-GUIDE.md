# Startup guide: a new server

For another Kingdom's server, running its own Neil: its own Discord application, hosting, database and Game API key. Do the
steps in order; several depend on the one before. [SERVER-SETUP.md](SERVER-SETUP.md) is the reference for everything named
here. On a server that already has Members, use [MIGRATION-GUIDE.md](MIGRATION-GUIDE.md).

`#<Home Kingdom>` means your Kingdom role, for example `#330`.

## Before you start

- Two people's work: the **server owner** (Discord) and **whoever runs Neil** (hosting, [HOSTING.md](HOSTING.md)). It can be one person.
- Turn on Developer Mode, to copy IDs: User Settings → **Advanced** → **Developer Mode**.
- ⚪ Community is optional. Announcement channels need it; without it, they are plain text channels. Forums work either way.

## 1. Create the application

*Whoever runs Neil.* Follow [HOSTING.md §1](HOSTING.md). In the Developer Portal → **Bot**, switch on **Server Members Intent**
and **Presence Intent**. Neil can't log in without both.

## 2. Invite Neil

Open the invite link, pick your server, confirm. Check that a **Neil** role appears. If it doesn't, tell whoever runs Neil:
the link has to carry a permission, because a bot invited with none gets no role, and the next step needs that role.

Give Neil's role **Manage Roles** and **Manage Nicknames**: Server Settings → **Roles** → **Neil** → **Permissions**.

## 3. Run the setup script

*Whoever runs Neil*, with `DISCORD_TOKEN`, `DISCORD_GUILD_ID` and `HOME_KINGDOM` in `.env`. It creates the roles, categories,
channels and permissions of the [Server Layout](SERVER-SETUP.md#3-the-server-layout) from `server-layout.json`. Edit that
file first if you want other names or fewer languages.

1. `npm run server:setup` shows what would change, and changes nothing.
2. The server owner gives Neil's role **Administrator** for the run (ADR 12).
3. `npm run server:setup -- --apply` does the work. It prints the IDs for step 5 and what is left by hand.
4. 🔴 **Take Administrator off Neil's role straight away.** While Neil holds it, a leaked token controls your whole server.

It also sets each channel's topic and pins Neil's description in it, with the code of conduct in `#rules` and `#guest-rules`. A dry run without Administrator can't read the pins of hidden channels and says so; the real run checks them.

Running it twice is safe. Without Community, announcement channels become plain text channels, with the same permissions.

If Interaction Bot isn't on your server yet, invite it and run the script again, so it gets its allow.

## 4. Place the roles

Server Settings → **Roles**: drag **Moderator** and **King** above Neil, and Neil above every other role the script made.
A bot can't do this itself. Give Moderator and King to your Officers, with the permissions you want them to have.

## 5. Start Neil

Send the IDs the script printed to whoever runs Neil, with your Kingdom's number as `HOME_KINGDOM`.

*Whoever runs Neil* adds them with the other settings ([SERVER-SETUP.md §6](SERVER-SETUP.md#6-settings-for-whoever-runs-neil)),
registers the commands (`npm run commands:register`) and starts Neil. If Neil stays offline, its console names the problem.

Check: `/ping` answers.

## 6. Add Alliance areas

An Alliance's role, for example `[NML]`, appears with its first Linked Member. Then run step 3 again: the script builds an area
for every `[TAG]` role, seen by that role only, and lets Neil post in its `alliance-chat` for Booty Calls. The same goes for each new Alliance.

## 7. Follow the official news

`#news` shows the game-wide news from the official Last Asylum: Plague server, for everyone on your server. Your own Kingdom's news
goes in the Home Kingdom announcements. Neil can't set this up, so do it by hand: on the official
server, open its announcement channel, press **Follow**, and choose your server and `#news`. You need **Manage Webhooks** on your
server. Members can't post in `#news`, but followed messages still arrive.

## 8. Set the commands

Set **Integrations** as in [SERVER-SETUP.md §5](SERVER-SETUP.md#5-commands). This stays manual, because Discord needs an
admin's own login for it. Add `#onboarding` for `/interview` when you turn off **All Channels**, or newcomers lose it.

## 9. Test it

With an account that isn't an Administrator:

1. Join. Only `#onboarding` and `#news` are visible, and a private thread opens in `#onboarding`.
2. Give the uid and confirm. The nickname and roles appear, **Doctor** among them. The thread stays
   until you press **Done**, or until it times out, and while a Rank Approval is waiting. `Onboarding` goes when the thread closes.
3. `#neil-log` shows the Link.
4. **View Server As Role**: **Doctor** alone shows the Guest area and `#news` only; **Doctor** plus `#<Home Kingdom>` shows the rest.
5. `/unlink` yourself in `#alliance-hall`. The roles and nickname go, and `Onboarding` comes back.
