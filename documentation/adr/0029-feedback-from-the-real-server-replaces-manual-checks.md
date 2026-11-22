# 29. Feedback from the real server replaces manual checks

Date: 2026-11-21

## Status

Accepted. Amends [ADR 16](0016-develop-branch-and-test-environment.md) and [ADR 17](0017-neil-police-acts-on-the-test-server.md)
(what a check on test Neil is) and [ADR 15](0015-neil-police-test-bot-and-server-crawl.md) (Police on the real server).
Constitution 1.3.0.

## Context

Every slice's Definition of Done asked for a check on the test server, and most checks need a person: slash commands,
buttons, joining, a Linked R5, a second Alliance. The test server has neither R5s nor several Alliances, so the open
manual checks piled up (slices 015 to 046 and several fixes) without being run.

On 2026-11-21 the user decided to start a new Discord server for Kingdom 330 and deploy the real Neil there. Its
`#suggestions` and `#feedback` channels become the source of testing feedback, a log of what breaks, and input for new
ideas, in place of the manual checks.

## Decision

- **Production.** The #330 server is the production server. Production Neil runs there from `main` on `lap-330-neil`.
  Releases (`develop` → `main`) still need the user's approval and a merge commit.
- **Smoke test, not manual checks.** After a slice is merged into `develop`, a session checks on test Neil only what Neil
  Police can arrange and read back by itself (ADR 17). It hands the user no manual steps. What needs a person is left to
  real use on the #330 server.
- **Feedback.** Members post in `#suggestions` and `#feedback` on the #330 server. Neil forwards each post to
  `#neil-log`, naming the Member, and reacts to the post once forwarded (slice 047). Sessions read `#neil-log` through
  Police and turn bugs and ideas into GitHub Issues in their own words, without the Member's name.
- **Feedback Template.** The user filters the feedback. Sessions act only on feedback that follows the Feedback
  Template in [FEEDBACK.md](../FEEDBACK.md) and silently discard the rest (the user's decision, 2026-11-22). Neil pins
  the template in both channels.
- **Police on the #330 server.** Police may stay on the #330 server with View Channels and Read Message History in
  `#neil-log`, `#suggestions` and `#feedback` only, and no other permission. Its write permissions (ADR 17) stay on the
  test server.
- **Open manual checks** recorded before this decision are closed as superseded. A problem found in real use is filed as
  an issue.

## Consequences

- A slice is Done without the user running checks; the feedback loop runs on real use instead.
- A bug may reach the real server before anyone sees it. The release approval and the smoke test are what stands
  between them; a bug found in feedback is fixed first (bugs lead the queue).
- Police holds a read-only seat on the real server, so a leaked Police token reads those three channels there.
- GitHub Issues never carry a Member's name; only `#neil-log` and Discord do.
