# Migration guide: an existing server

For a server that already has Members and channels and moves to the
[Server Layout](SERVER-SETUP.md#3-the-server-layout). Do the steps in order: the order is what keeps Linked Members from
losing channels. For a new server, use [STARTUP-GUIDE.md](STARTUP-GUIDE.md).

`#<Home Kingdom>` means your Kingdom role, for example `#330`.

## 1. Take stock

- List your channels, roles and bots.
- **Name collisions:** a role called `Events`, `New`, `Veteran`, `R5`, `Doctor` or any other name Neil uses becomes Neil's if
  it has no permissions: Neil gives and takes it by its own rules. If it has permissions, Neil refuses it. Rename the ones
  that mean something else.
- **Other bots:** they hold no Doctor or Kingdom role, so each needs its own allow before a channel is hidden. Interaction
  Bot is one of them.

## 2. Check the Links

- Neil runs on one database. Links on any other don't count: at a restart, anyone without a Link on the running database
  loses `Doctor` and gets `Onboarding`. Check [HOSTING.md](HOSTING.md) first.
- List Officers who aren't Linked. Link them, or allow Moderator and King on the categories they need.

## 3. Announce a date

Tell the server when the channels change, and:

- Members who aren't Linked will see only `#onboarding` and `#news` from then on, so they should finish their Interview before that.
- Linked Members use `/channels` to choose languages and Interests. Anyone Linked before Preferences existed holds no Preference Roles.
- Guests will see only the Guest area and `#news`.

Interviews run on their own until the date: up to 10 at a start of Neil, and one for each unlinked Member who comes online.
Each is a private thread, so expect a wave of them.

## 4. Bring Neil up to date

*Whoever runs Neil*, using [SERVER-SETUP.md §4](SERVER-SETUP.md#4-requirements-recommendations-suggestions) and [§6](SERVER-SETUP.md#6-settings-for-whoever-runs-neil):

- Both intents are on, and Neil is on the current version.
- Neil has Manage Roles and Manage Nicknames, and sits below Moderator and King and above its own roles.
- Commands are registered.

Restart Neil. Check `#neil-log`: one line gives the `Doctor` and `Onboarding` counts. Do they match the Members you expect?
Don't go on until they do.

## 5. Prepare the layout file

Edit `server-layout.json` so its names match what you already have: the script finds roles, categories and channels by exact
name, and creates whatever it doesn't find. A channel with another name stays outside the layout.

Wait for one Daily Sync after deploying slices 020 and 021: Alliance roles become `[NML]` only then, and Guests lose their
Preference Roles only then.

Delete the `Trading` role if your server has it: Recruitment replaced that Interest, and Neil no longer uses the role. If a
channel is already set on `Trading`, set it on `Recruitment` first, or it goes dark for those Members.

If your server already has a role named `Recruitment`, rename it before the deploy. Neil treats that name as a Preference
Role and takes it off anyone who hasn't chosen the Interest at the Daily Sync.

Check that Home Kingdom Members hold `#<Home Kingdom>`: nearly every channel will depend on it.

## 6. Run the setup script on the announced date

*Whoever runs Neil*, with `DISCORD_TOKEN`, `DISCORD_GUILD_ID` and `HOME_KINGDOM` in `.env`. Neil may stay online.

1. `npm run server:setup` changes nothing. Read all of it, days before the date if you can: it lists what it would create, what it
   would correct, what is outside the layout, and any role it won't use.
2. ⚠️ **Every channel it warns about is hidden from @everyone at once by the real run.** There is no second step, so the real run
   is your cutover: make it on the announced date, and not before.
3. The server owner gives Neil's role **Administrator** for the run (ADR 12).
4. `npm run server:setup -- --apply`.
5. 🔴 **Take Administrator off Neil's role straight away.**
6. Check with **View Server As Role**: `Onboarding` alone, **Doctor** alone, then **Doctor** plus `#<Home Kingdom>`.

The script keeps the overwrites you made and only adds or corrects the permissions the layout names. So if a channel still
allows `Doctor`, Guests keep seeing it: the report lists it as an extra overwrite. Remove those yourself. It also doesn't
move a channel that sits in another category; the report says where it is.

## 7. Hide what isn't in the layout

The script only reports these channels and never changes them. Don't delete them. Deny **@everyone** View Channel, allow `#<Home Kingdom>`, keep the
overwrites they already have, and note them in a list for your Officers. If a channel is for Guests too, move it to the Guest area.

## 8. Gate the Preference channels last

The script creates a chat for each language, and an existing language channel is hidden by the real run. If Members need more
time to use `/channels`, take that language out of `server-layout.json` until they've had it, and run the script again later.

## 9. Set the commands

Set **Integrations** as in [SERVER-SETUP.md §5](SERVER-SETUP.md#5-commands). Add `#onboarding` for `/interview` in the same
sitting as turning off **All Channels**, or newcomers lose it.

## 10. Test, and keep the way back

- With an account that isn't an Administrator, run [the startup guide's test](STARTUP-GUIDE.md#9-test-it).
- **View Server As Role**: `Onboarding` alone, **Doctor** alone, then **Doctor** plus `#<Home Kingdom>`.
- If a category went wrong, removing its @everyone ❌ brings it back at once.
