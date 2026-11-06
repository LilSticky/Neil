# Review: slice 020

`bot-reviewer` and `spec-auditor`, 2026-11-06, on the diff to `main`. The reviewer read the code and ran nothing.

- **Fixed (must-fix, found by both):** a role the script created inherited @everyone's permissions, so Neil would have refused it.
  It now posts no permissions, not hoisted, not mentionable.
- **Fixed (must-fix):** a Member overwrite of another user went back as a role overwrite and would have failed the whole write. The
  overwrite's type is now read and kept.
- **Fixed:** a failed read after the writes lost the outcomes. They are now reported, with a line saying the IDs couldn't be read.
- **Fixed:** the rename could hit one of Neil's own roles when a tag matched it (`PvP`, `Events`, `R5`) or pick one of two roles.
  Neil's fixed names and duplicates are now left alone.
- **Fixed:** a dry run says "would create" and "would correct".
- **Fixed in the main session, before the review:** the first layout lacked Neil's Manage Threads and Read Message History, without
  which Neil won't start; and a channel in another category got no correction, against the spec.
- **Accepted:** the real run hides existing channels at once, with only the dry run's warning. The reviewer proposed a flag; the user
  chose one mode.
- **Accepted:** any role named `[...]` counts as an Alliance and gets an area. The dry run shows it, and SERVER-SETUP.md warns.
- **Not done:** no test shows the script parsing the layout before reading the server (FR-001). The code does, in `scripts/setup-server.ts`.
- **Open:** the check on the test server (T019). A dry run against the server in `.env` worked and changed nothing; no real run was made.
