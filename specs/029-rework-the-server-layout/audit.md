# Audit: slice 029, against spec.md, plan.md and tasks.md

Typecheck: green. Tests: 3230 passed (97 files). Lint (--quiet): green.

## Criteria -> tests

| Criterion | Covered by | Status |
|---|---|---|
| US1.1 / FR-001 no guest-/ad-announcements | server-setup.test "holds no guest-announcements and no ad-announcements"; "gives Kingdom vs Kingdom an announcement only King posts, and Alliance Duel none" | covered |
| US1.2 / FR-002 Hangout category, no Home Kingdom/Off-topic | "has no Home Kingdom or Off-topic category..."; "seats Hangout for the Kingdom with exactly the reworked channels"; "holds #gift-codes in Hangout..." | covered |
| US1.3 off-topic/memes only with Off-topic role | "lets only the Off-topic role see off-topic and memes" | covered |
| US1.4 / FR-003 Recruitment two channels | "holds looking-for-alliance and looking-for-players in Recruitment, and no recruitment channel" | covered |
| US1.5 / FR-004 Coaching voice | "holds a Coaching voice channel in Events" | covered |
| US1.6 / FR-005 translated copies KvK + NaP | "holds Russian, French, Italian and German copies of kvk-announcements and nap-announcements..."; server-layout.test "expandLayout: translated copies" (6) | covered |
| US1.7 translated: only King and Interaction Bot post | "a copy keeps the original's mode...", "the Interaction Bot may view and send in a copy" | covered |
| US1.8 / FR-005a Kingdom sees four announcements | "lets the Kingdom see home-kingdom-, nap-, event-, kvk-announcements, and only King posts" | partial: overwrites asserted, no test of a Member without PvP/Events seeing no other KvK/Events channel |
| US1.9 German role sees only German copies | "a copy is seen by its Language role, King and the Interaction Bot, not by the category's seenBy roles" | covered (by overwrites) |
| FR-006 translation Languages in one place | "lists Russian, French, Italian and German as the translations"; parseLayout translations tests (5) | covered |
| US2.1 / FR-008 topic = purpose | expandLayout topic tests (5); setup-plan topic tests; runSetup "creates each channel with its description as topic" | covered |
| US2.2 / FR-009 pinned message | expandLayout message tests (9); runSetup "posts one description in each text, announcement and voice channel..."; rest post + pin + delete-notice tests | covered |
| US2.3 / FR-010 edit own, repost if gone, leave others | setup-plan edit-/post-description; "reads the oldest pin by Neil ... ignores the other pins"; "corrects a stale topic and description" | covered |
| US2.4 nothing changes when matching | setup-plan "neither a topic nor a description step"; "a second real run ... Nothing to do." | covered |
| US2.5 / FR-012 dry run lists, writes nothing | "says would set topic, would edit description and would post description on a dry run, and writes nothing" | covered |
| US3.1 / US3.2 / FR-011 code of conduct | "gives rules and guest-rules a code of conduct"; rules / guest-rules message tests (< 2000); "appends its lines after a blank line" | covered |
| US3.3 changed code of conduct reaches message | append test plus edit-description path | covered (no single end-to-end test) |
| FR-007 purpose required, <= 1024, refused at load | parseLayout description tests (8, incl. Alliance area, translated credit overflow) | covered |
| Edge: message over 2000 stops run, names channel | "refuses a description message over 2000 characters"; "every message in the shipped expansion is at most 2000" | covered |
| Edge: deleted/unpinned message reposted | setup-plan "without Neil's description gets a post-description" | covered |
| Edge: other pins left alone | readServer pin test | covered |
| Edge: channel outside layout only reported | slice 020 tests only; no new topic case | partial |
| Edge: voice no topic, forum topic only | setup-plan new/existing forum and voice tests; expandLayout forum/voice | covered |
| Edge: without Community, announcement as text; forum-as-text keeps forum treatment | none found | missing |
| Edge: Alliance areas described, naming the [TAG] | "an Alliance area names its [TAG] role in Seen by and Posts"; "gives every channel and Alliance area channel a description" | covered |
| FR-013 docs match | SERVER-SETUP.md, STARTUP-GUIDE.md, DICTIONARY.md, TEST-RUN.md in diff | covered by construction |
| SC-001 real run, second run nothing to do | second-run test on the fake; real run is T022 | partial (manual open) |
| SC-002 exactly one pinned description per channel | post-description tests; not asserted across the whole shipped layout | partial |
| SC-003 / SC-004 | manual (T022) | out of scope |

## Tasks

- T001-T017 ticked and their changes exist in the diff (channel-description.ts, server-layout.ts, setup-plan.ts, server-setup.ts, setup-server-rest.ts, server-layout.json).
- T015 ticked, but no review.md in the slice folder: the bot-reviewer result is not recorded.
- T018-T020 ticked; docs present. STATUS and ROADMAP are done in parallel (not verified here).
- T021 unticked: test, typecheck, lint green here; dry run against the test server and this audit still to be recorded.
- T022 open by design (manual run of TEST-RUN.md 6v).
- No task found done but unticked.

## Tests covering nothing in the spec

The 403 pin-read handling (rest "resolves to undefined when the pin read is refused with 403"; readServer pinsReadable; plan "descriptions-unread" finding), the pin-failure cleanup (delete the posted message, rethrow) and "keeps a pinned message when its pin notice cannot be deleted" go beyond spec.md. They are defensive, not scope creep, but the spec has no edge case for them.

## Test-server check recorded in tasks.md: NO (T022 open)

Definition of Done 2 is open.

## Gaps to close

1. Test (or spec change) for the no-Community fallback: announcement as text, forum-as-text topic only.
2. US1.8 behaviour test (Kingdom-only Member sees exactly two KvK/Events channels), or accept the overwrite assertions.
3. Record the bot-reviewer result (T015), tick T021 after the dry run, record T022; add spec edge cases for the 403 pin read.
