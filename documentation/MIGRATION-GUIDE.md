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

- Members who aren't Linked will see only `#onboarding` from then on, so they should finish their Interview before that.
- Linked Members use `/channels` to choose languages and Interests. Anyone Linked before Preferences existed holds no Preference Roles.
- Guests will see only the Guest area.

Interviews run on their own until the date: up to 10 at a start of Neil, and one for each unlinked Member who comes online.
Each is a private thread, so expect a wave of them.

## 4. Bring Neil up to date

*Whoever runs Neil*, using [SERVER-SETUP.md §4](SERVER-SETUP.md#4-requirements-recommendations-suggestions) and [§6](SERVER-SETUP.md#6-settings-for-whoever-runs-neil):

- Both intents are on, and Neil is on the current version.
- Neil has Manage Roles and Manage Nicknames, and sits below Moderator and King and above its own roles.
- Commands are registered.

Restart Neil. Check `#neil-log`: one line gives the `Doctor` and `Onboarding` counts. Do they match the Members you expect?
Don't go on until they do.

## 5. Create the missing roles

Create every role the Server Layout uses that doesn't exist yet, with **no permissions** and **below** Neil. Check that Home
Kingdom Members hold `#<Home Kingdom>`: nearly every channel will depend on it.

Delete the `Trading` role if your server has it: Recruitment replaced that Interest, and Neil no longer uses the role.

## 6. Move one category at a time

For each category in the Server Layout:

1. Allow the role that should see it, and any bot that needs it.
2. Only then deny **@everyone** View Channel.
3. Click **Sync Now** on channels that aren't synced.
4. Check with **View Server As Role**, then go on to the next.

Start with what newcomers and Guests must not see. Set the special cases on the channels themselves
([SERVER-SETUP.md §3](SERVER-SETUP.md#3-the-server-layout)).

If you're moving channels off `Doctor`, allow `#<Home Kingdom>` **first**, then remove `Doctor`. Guests keep only the Guest area.

## 7. Hide what isn't in the layout

Don't delete channels that aren't in the Server Layout. Deny **@everyone** View Channel, allow `#<Home Kingdom>`, keep the
overwrites they already have, and note them in a list for your Officers. If a channel is for Guests too, move it to the Guest area.

## 8. Gate the Preference channels last

Language channels come after everything else, once Members have had time to use `/channels`. Wait for one Daily Sync after
deploying slice 021: it takes the Preference Roles off the Guests who still hold them.

## 9. Set the commands

Set **Integrations** as in [SERVER-SETUP.md §5](SERVER-SETUP.md#5-commands). Add `#onboarding` for `/interview` in the same
sitting as turning off **All Channels**, or newcomers lose it.

## 10. Test, and keep the way back

- With an account that isn't an Administrator, run [the startup guide's test](STARTUP-GUIDE.md#9-test-it).
- **View Server As Role**: `Onboarding` alone, **Doctor** alone, then **Doctor** plus `#<Home Kingdom>`.
- If a category went wrong, removing its @everyone ❌ brings it back at once.
