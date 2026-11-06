# Review: Keep Preferences within the Home Kingdom

`bot-reviewer`, 2026-11-06. No must-fix findings.

| Finding | Outcome |
|---------|---------|
| A Guest whose Player the Game API no longer returns keeps Preference Roles: the Daily Sync's `not-found` branch never applies them | Fixed (T018) |
| A Member with no Applied State loses held Preference Roles on a select press, for example after a failed apply | Kept. It is the spec's fail-closed rule (FR-004), and that Member could be a Guest. The roles return at the next startup apply or Daily Sync |
| A Guest with no Applied State isn't refused, so their choices are stored | Kept. No role is given, and refusing would also refuse a Home Kingdom Member in the gap after a Link (research.md) |
| Done tells a Guest to run `/channels`, which then refuses them | Left. Only a Member who moved Kingdom with a message still open sees it |
| When only Preference Roles change, the Daily Sync's summary doesn't count the Member as changed | Left, as before this slice. The role change has its own log line, so the cleanup after the deploy shows there and not in the summary |

Checked clean: the Applied State is recorded before every apply, no old row marks a Home Kingdom Member as a Guest, and the
Link ordering and every Guest path hold.
