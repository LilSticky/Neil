# Quickstart: check slice 029 on the test server

Becomes TEST-RUN.md §6v. Needs: the test server emptied again (no channels, no layout roles), Interaction Bot on it, the
test server's token, ID and `HOME_KINGDOM` in `.env`.

1. `npm run server:setup`: lists the reworked layout (no `guest-announcements`, `ad-announcements`, Home Kingdom or
   Off-topic category; `looking-for-alliance`, `looking-for-players`, `Coaching voice`, eight translated announcement
   channels) and a `would post description in …` line for every text, announcement and voice channel.
2. Give Neil's role Administrator, `npm run server:setup -- --apply`: the layout appears; every text channel has a topic and
   one pinned message from Neil, with no "pinned a message" notice below it.
3. Run it again: `Nothing to do.` Take Administrator off.
4. Open `#rules` and `#guest-rules`: the code of conduct is there, below the description.
5. Open a voice channel's chat (e.g. `Coaching voice`): Neil's description is pinned.
6. **View Server As Role**: `#330` alone sees `kvk-announcements` and `event-announcements` but no other KvK or Events
   channel; `#330` plus `German` also sees `kvk-announcements-german` and `nap-announcements-german`; `#330` without
   `Off-topic` doesn't see `off-topic` or `memes` in Hangout.
7. Change one channel's `description` in `server-layout.json`, run with `--apply` again: that channel's topic and pinned
   message change, and no second message appears.
8. Delete Neil's pinned message in one channel, run again: it is posted and pinned again.

Automated: `npm run test`, `npm run typecheck`, `npm run lint`.
