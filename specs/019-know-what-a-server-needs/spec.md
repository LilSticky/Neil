# Spec: Know what a server needs (slice 019)

Issue #61. Documentation only, so there is no plan or code; the discovery is
[documentation/discovery/019-know-what-a-server-needs.md](../../documentation/discovery/019-know-what-a-server-needs.md).

A server owner sees which channels, roles and permissions are required, recommended or suggested, and follows a startup
guide for a new server or a migration guide for an existing one.

## Acceptance

- AC1: SERVER-SETUP.md lists Requirements, Recommendations and Suggestions for channels, roles and permissions, and says what a bot token can set.
- AC2: SERVER-SETUP.md holds the Server Layout from the user's answers. Guests see only the Guest area.
- AC3: STARTUP-GUIDE.md takes another Kingdom's owner from nothing to a tested server, in an order that works.
- AC4: MIGRATION-GUIDE.md moves an existing server without Linked Members losing channels, and hides channels outside the layout rather than deleting them.
- AC5: Every drift item in the discovery is fixed or has an issue.
- AC6: Followed on the test server (open: the user's check).

## Out of scope

Code. Guest Preferences (#64), Recruitment (#65), the Preferences check (#66) and Guest Rank Approvals (#67) have their own issues.
Slice 020's rights (discovery Q6) are decided in slice 020.
