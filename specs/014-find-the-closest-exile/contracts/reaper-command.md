# Contract: `/reaper`

One slash command, visible to every Member; all replies are ephemeral.

| Subcommand | Options | Who | Game API |
|------------|---------|-----|----------|
| `closest` | `x` (integer, optional), `y` (integer, optional, required with `x`), `all` (boolean, optional) | any Member | caller's Player + each Exile in the Kingdom, `lookup`, cached 10 min |
| `list` | – | any Member | none |
| `add` | `name` (string, required), `reason` (string, required, max 200), `kingdom` (integer, optional) | Home Kingdom R5 | one name lookup (+ one uid read after a pick), `lookup` |
| `remove` | `exile` (string, required, autocomplete from REAPER, value = uid) | Home Kingdom R5 | none |

## Answers

- `closest`: header (origin and Kingdom, "Neil cannot see shields reliably", how many Exiles were left out and why),
  then up to 3 Exile cards: player card + Coordinates, Distance, Reason, Exiled on. Stale: "position as of <date>".
  With `all`: Previous/Next buttons, 3 per page. No Exiles: "No Exiles in Kingdom N."
- `list`: 20 per page, newest first: name, Kingdom, reason, date. Empty: "REAPER is empty."
- `add`: "<name> (Kingdom N, [TAG]) is now an Exile." / "already an Exile: <reason>" / pick list / not found.
- `remove`: "<name> is no longer an Exile." / "not an Exile".
- Refusal for `add`/`remove`: "Only R5s of Home Kingdom Alliances may change REAPER."
- `x` without `y` (or the reverse): "Give both x and y."

## Custom ids

- `reaper:<session>:page:<n>` – page buttons (owner only; expired → "This list has expired, run /reaper again.").
- Pick list for `add` reuses `pick:<session>:select` with the `exile` choice.

## Log channel

- Add: "🔥 <name> (uid, Kingdom N) added to REAPER by @R5: <reason>"
- Remove: "<name> (uid, Kingdom N) removed from REAPER by @R5"
