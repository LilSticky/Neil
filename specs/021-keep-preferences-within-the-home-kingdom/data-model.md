# Data Model: Keep Preferences within the Home Kingdom

No stored data changes, and there is no migration.

| Applied State of the Member | Preference Roles | `/channels`, select menus |
|-----------------------------|------------------|---------------------------|
| holds `#<homeKingdom>` | given from the Preferences | work as before |
| exists without it (Guest) | all taken off | refused |
| none yet | none given | work; the roles follow with the name and roles |

Stored Preferences are never touched by a change of Kingdom. They are deleted at Unlink, as before, so the retention
described for slice 016 still holds.
