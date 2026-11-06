# Quickstart: Keep Preferences within the Home Kingdom

Automated: `npm run test`, `npm run typecheck`, `npm run lint`.

On the test server (recorded as [TEST-RUN.md](../../documentation/TEST-RUN.md) §6o):

1. Link a Member to a Player outside the Home Kingdom. Expect no Preferences message, and the thread gone.
2. As that Guest, run `/channels`. Expect the private refusal ([contract](contracts/guest-refusal.md)).
3. Give a Guest a Preference Role by hand and run the Daily Sync. Expect the role gone and one log line.
4. Link a Home Kingdom Member. Expect the Preferences message and the roles as before.
