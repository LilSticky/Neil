# Audit: 030 Set up the forums

Branch `030-set-up-the-forums`. T016 (docs), T017 (review/audit) and T018 (manual check) are open by design.

| Criterion | Test(s) | Status |
|-----------|---------|--------|
| US1-1 tags in layout order | setup-plan.test "a new forum gets a set-forum-tags...", "keep the order"; server-setup.test "applySetup gives a new forum its tags..." | covered |
| US1-2 default reaction | setup-plan "set-forum-reaction"; server-setup applySetup forum test; setup-server-rest setForumReaction | covered |
| US1-3 @everyone denied Send Messages, posting roles keep it | server-layout.test "expandLayout: forums" (@everyone deny); server-setup.test ~l.1008/1211 (R4/R5/King allow) | covered |
| US1-4 Neil opens and pins the how-to post | setup-plan "open-how-to"; forum-how-to.test; applySetup forum test; rest openForumPost/pinForumPost | covered |
| US1-5 second run plans nothing | setup-plan "existing forum whose state matches"; server-setup "a real run finishes the forums of the shipped layout" (with and without Community) | covered |
| US1-6 checklist has no open step | none automated | manual (T018) |
| US2-1 missing tags added, extras reported and kept | setup-plan "missing tag", "extra tag"; server-setup "words the forum findings" | covered |
| US2-2 reaction changed | setup-plan "reaction that differs" | covered |
| US2-3 post edited, no second post | setup-plan "post whose text differs"; "dry run/real run edit how-to post" | covered |
| US2-4 deleted post reopened and pinned | setup-plan covers open-how-to for a forum with no Neil post (via other-post-pinned and new forum); no explicit "existing forum, post deleted, pinned again" test | partial |
| US3-1 how-to at top | pin via PINNED flag (rest tests); real placement manual | partial (manual T018) |
| US3-2 Members pick tags | manual only | manual (T018) |
| US3-3 non-Veteran of guides can't post | @everyone denied Send Messages (see US1-3); no guides-specific test | partial |
| FR-001 shipped file holds tags, reactions, how-to texts | server-setup "shipped server-layout.json carries the decided tags and reaction"; tags/reaction checked. How-to texts of how-to-posts.md not compared | partial |
| FR-002 layout refused at load | server-setup "parseLayout forum setup" (all limits, duplicate, reaction ""/"ab"/"📚📚", missing/extra block) | covered |
| FR-003 deny Send Messages on every forum | server-layout.test; shipped layout test | covered |
| FR-004 tags add/keep/report | setup-plan tag tests; rest setForumTags | covered |
| FR-005 reaction | as US1-2 | covered |
| FR-006 post titled "How to post in #<forum>" | forum-how-to.test | covered |
| FR-007 find archived post, edit, reopen only when gone, leave other posts | rest readForumPosts (archived read, 403); server-setup readServer (oldest by Neil, pin mark, other pinned); setup-plan unarchive/edit; "gone then reopen" not explicit | partial |
| FR-008 dry run lists, real run reports, second run nothing | server-setup "runSetup reports the forum steps, with would"; second-plan test | covered |
| FR-009 docs | T016 not done | open (docs) |
| Edge: pinned post not Neil's | setup-plan other-post-pinned; readServer otherPinned; report line | covered |
| Edge: invalid layout (name length, count, duplicate, non-emoji) | parseLayout tests | covered |
| Edge: dry run unreadable posts | setup-plan forum-posts-unread; readServer unreadable; aggregate report line | covered |
| Edge: archived post still found | rest readForumPosts archived; readServer | covered |
| Edge: forum built as text channel gets no forum steps | wrong-type exists for channels generally (setup-plan l.561); no forum-specific test showing no tags/reaction/post steps | partial |

## Tasks
T001-T015 ticked and their code exists (forum-how-to.ts, setup-plan.ts, setup-server-rest.ts, server-setup.ts, FakeSetupServer, server-layout.json). T016, T017, T018 unticked, as expected. No task done but unticked found.

## Tests covering nothing in the spec
None found.

## Test-server check recorded
No (T018 pending; nothing recorded in tasks.md yet).

## Runs
- typecheck: clean
- test: 3365 passed on two reruns; one earlier full run showed 1 failed (unidentified, not reproduced; likely flaky)
- lint --quiet: clean
