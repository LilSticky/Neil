# Quickstart: Show how old game data is

Manual check on the test server after the deploy (no command registration needed: no command changes).

1. `/player` for a Player of the Home Kingdom. The footer's "as of" equals the time on the tracker's player page
   (map time), not "a few seconds ago". If older than 5 minutes: a "Newer data" field with the Kingdom's map link and a
   🔄 Look again button.
2. Open the link, press Update Map, wait until it has finished. Press 🔄 Look again on the card: the card updates in
   place; the usage line counts one more request. If the Player changed in the refresh, the "as of" is now a few
   minutes old or less and the field and button are gone.
3. Another Member presses the button: they get the private "only the Member who ran this command" reply.
4. `/alliance` for an Alliance: no "as of"; the field and the button are always there. Press Overview: the same.
   Press 🔄 Look again on each: the card and the Overview reload.
5. `/reaper closest`: positions with their times; the field and button when any is older than 5 minutes.
6. Interview, a correction and a Booty Call: no field, no button; Neil's log shows no `?fresh=1` requests for them.

Automated: `npm run test`, `npm run typecheck`, `npm run lint`.
