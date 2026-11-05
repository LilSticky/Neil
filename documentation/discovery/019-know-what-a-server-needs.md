# Discovery brief: Know what a server needs (slice 019)

Discovery before any setup script, asked for by the user on 2026-11-06. Documentation only, no code.

**Deliverables**
- Lists of requirements, recommendations and suggestions for channels, roles and permissions.
- A startup guide for new servers.
- A migration guide for existing servers.

**Start from** `documentation/SERVER-SETUP.md`, which has the current required and recommended settings, and `documentation/discovery/` for the format. Domain discovery goes to the `domain-modeler` agent.

**Questions to settle, not yet answered by the user**
- What happens to channels on an existing server that aren't in the layout: hide them from newcomers, leave and report, or remove them?
- Which language, region and interest channels does a server get?
- Should the command limits in Integrations (step 9) be automated? Discord needs an admin's own login for them, not a bot token.

The setup script itself follows as slice 020.

## Slice 020: Set up the server

A server owner runs one script that does as much of the server setup as Discord allows: roles, categories, channels and permission overwrites from one layout file, with a dry run, safe to run twice, reporting what it can't do. The user asked to take as much off their hands as possible.

Waits for slice 019, which decides what to set up.

Known limits: a bot can't place a role above its own, can't change the Developer Portal or Community settings, and can't set the command limits in Integrations with a bot token.
