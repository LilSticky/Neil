# 16. An integration branch `develop` and a hosted test Neil

Date: 2026-11-15

## Status

Accepted. Partly supersedes [ADR 6](0006-two-servers-deployed-from-main.md) (where the test instance runs, and
what reaches `main`).

## Context

ADR 6 planned a test instance next to production, but there was only ever one bot application: it ran on Wispbyte
against the test server, and locally with the same token while Wispbyte was stopped. Every slice was squash-merged into
`main` and deployed at once, so its manual check on the test server (Definition of Done 2) came after the merge or not
at all: most slices since 015 are "Merged red" (STATUS).

On 2026-11-15 production Neil moved to a Premium Wispbyte server, and the free one became available. The user decided
the same day:

- a second Discord application, **Neil Test**, runs on the test server, hosted on the free Wispbyte server;
- the existing application **Neil** stays the production bot, for the real server; it is not set up there yet;
- work collects on an integration branch, **`develop`**, is tested for real on the test server, and only then reaches
  `main`; afterwards `develop` starts anew from `main`;
- Neil Police checks the results and runs test cases there ([ADR 17](0017-neil-police-acts-on-the-test-server.md)).

## Decision

**Branches.**

- `develop` is the integration branch and the repository's default branch. Every slice, fix, docs or chore branch
  starts from `develop` and returns to it through a pull request, squash-merged by the agent once CI is green.
- `main` is production. It receives only **release pull requests** from `develop`, merged with a **merge commit** (not
  squashed), after the user approves them (`main` requires one review). The slices keep their own commits on `main`.
- After a release, CI fast-forwards `develop` to `main` (job `restart-develop`): `develop` starts anew without a
  force-push. If `develop` moved on during the release, CI leaves it and warns.

**Builds.** The CI `deploy` job builds every green push: `main` into `deploy` (production, `/ping` shows the short
sha), `develop` into `deploy-test` (test Neil, the sha followed by `-test`). Both get one new commit per build, never a
force-push.

**Servers.**

| Wispbyte server | Tier | Pulls | Bot | Discord server |
|---|---|---|---|---|
| `lap-test-neil` | free | `deploy-test` | Neil Test | test server |
| `lap-330-neil` | Premium | `deploy` | Neil | real server (from the release; stopped until then) |

A free server only starts from the Wispbyte panel, and only while the user's AI pass runs, so the user restarts test
Neil after a `develop` deploy; a session can do the rest (startup values, `.env`, files, console) while the pass runs.

**Testing.** Definition of Done 2 is met on test Neil before the release pull request: the slice's checks run against
the `deploy-test` build, are verified through Neil Police, and are recorded in the slice's `tasks.md`. A release pull
request lists the slices it carries and their checks.

**Local runs** use Neil Test's token, with `lap-test-neil` stopped, as before (one application, two places).

## Consequences

- A slice reaches the real server only after a real check on the test server, not after review alone.
- Two bot applications to keep in step: intents, Public Bot off, and `npm run commands:register` for each.
- `main` and `develop` differ between releases; a hotfix also goes through `develop` and a release.
- The free server's limits (AI pass, panel-only start, 0.35 CPU, 512 MB) bound how often test Neil can be redeployed.
- Test Neil's database (`data/neil.db` on `lap-test-neil`) holds test data only. Production data starts on the Premium
  server at the release.
