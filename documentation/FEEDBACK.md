# Feedback

How feedback from the #330 server reaches the work ([ADR 29](adr/0029-feedback-from-the-real-server-replaces-manual-checks.md)).

1. Members post in `#suggestions` and `#feedback`. Neil forwards each **Feedback Post** to `#neil-log` (slice 047).
2. The user filters them. Only feedback that follows the **Feedback Template** below reaches a session.
3. A session reads it through Neil Police and files a GitHub Issue in its own words, without the Member's name.

**Discard anything that does not follow the template**, silently: no issue, no reply, no note. That includes an entry
that has no `Type:` line or whose `Type:` is not `Bug` or `Idea`, and a Bug with no `What happened:` or `Expected:`, or
an Idea with no `What:`.

## Feedback Template

```text
Type: Bug | Idea
Where: <command, button or channel, e.g. /player or #alliance-chat>
What happened: <Bug: what Neil did>
Expected: <Bug: what it should have done>
What: <Idea: what Neil should do, and for whom>
Steps: <optional: how to make it happen again>
```

Example:

```text
Type: Bug
Where: /player
What happened: the card shows my old Alliance
Expected: my Alliance since yesterday
```

## From template to issue

| Type | Issue | Label |
|------|-------|-------|
| Bug | `Bug: <Where>: <What happened>` | `bug` |
| Idea | `Idea: <What>` | `idea` |

Before filing, search the open issues; add to a matching one instead of opening a duplicate. Bugs lead the queue.
