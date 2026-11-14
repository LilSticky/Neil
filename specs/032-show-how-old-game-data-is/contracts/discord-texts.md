# Discord texts: Show how old game data is

Neil's voice: plain instructions (Liaison, light theme).

## Card footer

- Player, map time known: `Data from Last Asylum Tracker · as of 22:13 UTC` (earlier day: `· as of 13 Nov 22:13 UTC`), as
  today but from the map time.
- Alliance card, Alliance Overview, Player without map time: `Data from Last Asylum Tracker` (no "as of").
- The usage line stays where it is.

## "Newer data" field (last field of the card, only when old)

- Name: `Newer data`
- Value: `Use **Update Map** on the [Kingdom 330 map](https://lastasylumtracker.com/map?kid=330), wait until it has finished, then press 🔄 Look again.`
- Without a Kingdom: `[tracker map](https://lastasylumtracker.com/map)`.

## Button

- Style secondary, label `Look again`, emoji 🔄, custom id per data-model.md, in its own action row.

## Replies to a press (private)

- Not the owner: `Only the Member who ran this command can use this button. Run it yourself.`
- Refusals and failures: the same texts as the original lookup's (allowance, quota, not found, try again, unavailable).
