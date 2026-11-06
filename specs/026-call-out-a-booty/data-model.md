# Data Model: Call out a booty

## Booty Alerts (stored, table `booty_alerts`)

| Field | Type | Rule |
|-------|------|------|
| `member_id` | text, primary key | the Member |
| `mode` | text | `off`, `always`, `online`, `offline` |
| `window_start` | integer | minutes after midnight, 0 to 1439 |
| `window_end` | integer | the same; equal to the start means the whole day |
| `time_zone` | text | an IANA name Neil recognises |

No row means Off. The row is deleted at Unlink. A window whose start is after its end runs over midnight; the end minute itself is outside.

## Booty Call (in memory only)

| Field | Rule |
|-------|------|
| Alliance tag | the cooldown's key |
| called at | the cooldown runs one minute from here |
| card link | shown to later callers; empty while the card is being posted |

## Rule

A Member matches when their mode is not Off, the local time is inside the window, and:
`always`, or `online` and they are online, or `offline` and they are not.
