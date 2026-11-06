# Quickstart: check slice 020 on the test server

Needs the test server's token and ID in `.env`, and Neil invited. The details are in [contracts/cli.md](contracts/cli.md).

1. `npm run server:setup`: the plan lists everything to create; the server is unchanged.
2. `npm run server:setup -- --apply` without Administrator: refused, nothing changes.
3. Give Neil's role Administrator. `npm run server:setup -- --apply`: the layout appears. Forums and announcements are plain text
   channels if Community is off.
4. Run it again: `Nothing to do.`
5. Add a role `[TST]` and an unknown channel, and an extra overwrite on `#general`. Run again: `[TST]` gets an area; the other two
   are reported and unchanged.
6. Take Administrator off Neil, drag Moderator and King above Neil, put the printed IDs in the settings, start Neil: it starts.
7. View Server As Role: **Onboarding** sees `#onboarding` only; **Doctor** alone sees the Guest area only.
8. A Linked Member whose Alliance role was plain `NML` holds the same role, named `[NML]`, after the Daily Sync.
