# Tasks: Set up the forums

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/cli.md](contracts/cli.md), [quickstart.md](quickstart.md), [how-to-posts.md](how-to-posts.md)

**Tests**: required (constitution II). Every implementation task follows a red task: `test-first` writes the failing test,
`implementer` makes it green.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

None: the slice works in slice 020/029's modules.

## Phase 2: Foundational (the forum block)

- [ ] T001 Red: in `src/discord/server-setup.test.ts`, `parseLayout` accepts on a `type: "forum"` channel a `forum` block
  `{ tags: string[], reaction: string, howTo: { belongs: string, exampleTitle: string, template: string[] } }` and refuses,
  naming the category and channel: a forum without `forum`; a `forum` block on a non-forum channel; `tags` empty or more
  than 20 ("1–20 entries"); a tag empty, over 20 characters or with outer whitespace ("each 1–20 characters, no outer
  whitespace"); a tag named twice, case-insensitive; a `reaction` that is not one emoji ("one Extended_Pictographic code
  point, optional U+FE0F": accept 📚, 🤝, ⚔️; refuse "", "ab", "📚📚"); `belongs` outside 1–500 characters; `exampleTitle`
  outside 1–100 characters; `template` outside 1–10 lines or a line outside 1–100 characters.
- [ ] T002 Green: `ForumSetup` type and `LayoutChannel.forum?` in `src/domain/server-layout.ts`; zod schema and checks in
  `src/discord/server-setup.ts`. Give every forum in the test layouts of `src/domain/*.test.ts` and
  `src/discord/server-setup.test.ts` a valid forum block.

## Phase 3: User Story 1 - The owner gets finished forums from the setup (P1)

**Goal**: one real run on an empty server leaves every forum with recommended permissions, tags, reaction and Neil's
pinned how-to post; a second run plans nothing.

**Independent Test**: plan and apply against `FakeSetupServer` from empty; the second plan is empty.

- [ ] T003 [P] [US1] Red: in `src/domain/forum-how-to.test.ts` (new), `forumHowTo(name, forum)` returns title
  `How to post in #<name>` and the content of data-model.md "How-to Post" exactly: 📌 heading line, `belongs`, blank line,
  Title line with the example title in quotes, Tags line with the tags joined by ", ", Body line, the template lines each
  followed by ":" inside a ``` code block, blank line, the closing line with the reaction.
- [ ] T004 [US1] Green: `src/domain/forum-how-to.ts`.
- [ ] T005 [US1] Red: in `src/domain/server-layout.test.ts`, the expansion of a forum: its @everyone overwrite denies
  `ViewChannel` and `SendMessages`; its `forum` carries `tags`, `reaction` and `howTo` (from `forumHowTo`). A text
  channel's @everyone overwrite still denies only `ViewChannel`.
- [ ] T006 [US1] Green: `expandChannel` in `src/domain/server-layout.ts`.
- [ ] T007 [US1] Red: in `src/domain/setup-plan.test.ts`, for a forum the plan creates: `set-forum-tags` (all layout tags
  by name, no ids), `set-forum-reaction`, `open-how-to` with `pin: true`, all with `id: undefined` and the category name,
  ordered after the description steps; for an existing forum whose `forum` state matches (tags by name, reaction, Neil's
  post with equal title and content, pinned): no forum step.
- [ ] T008 [US1] Green: `ServerChannel.forum` state, the new steps in `src/domain/setup-plan.ts` (data-model.md "Steps").
- [ ] T009 [US1] Red: in `src/discord/setup-server-rest.test.ts`: `setForumTags` PATCHes `available_tags` (existing with
  `id` and `name`, new with `name`); `setForumReaction` PATCHes `default_reaction_emoji: { emoji_id: null, emoji_name }`;
  `readForumPosts` reads `GET /guilds/{g}/threads/active` once and `GET /channels/{forum}/threads/archived/public`, and the
  starter message `GET /channels/{thread}/messages/{thread}`, returning owner id, title, content, archived and pinned
  (flags & 2); a 403 on the archived read gives undefined; `openForumPost` POSTs `/channels/{forum}/threads` with `name`
  and `message: { content, allowed_mentions: { parse: [] } }` and returns the thread id; `pinForumPost` PATCHes the thread
  `flags` with PINNED (1 << 1); `editForumPost` unarchives when asked, PATCHes the thread name and the starter message.
  Channel reads include `available_tags` and `default_reaction_emoji`.
- [ ] T010 [US1] Green: `src/discord/setup-server-rest.ts`, the `SetupServer` port in `src/discord/server-setup.ts`, and
  `FakeSetupServer` (forum tags, reaction, posts with owner, archived and pinned; `refuseForumPostReads(name)`).
- [ ] T011 [US1] Red: in `src/discord/server-setup.test.ts`: `readServer` fills `forum` for forums (Neil's post = oldest
  thread owned by Neil whose content starts with 📌; `otherPinned`; `postsReadable`); `applySetup` runs the forum steps
  after the descriptions and creates, then pins, the post; on an empty server with Community and without, a real run of the
  shipped layout followed by a second plan gives no steps; report lines of contracts/cli.md with and without `would`.
- [ ] T012 [US1] Green: read, apply and report in `src/discord/server-setup.ts`.
- [ ] T013 [US1] Shipped layout: add the five forum blocks from spec.md (tags, reactions) and how-to-posts.md to
  `server-layout.json`; red first in the "shipped server-layout.json" tests of `src/discord/server-setup.test.ts` (each forum's
  tags and reaction as decided).

## Phase 4: User Story 2 - The owner changes a forum in the layout file (P2)

**Goal**: later runs bring forums in step with the file without duplicates or loss.

**Independent Test**: plan against a server built from an older forum block.

- [ ] T014 [US2] Red: in `src/domain/setup-plan.test.ts`: a missing tag gives `set-forum-tags` with the present tags (with
  ids) in layout order, the new ones, then the extras; an extra tag gives the `extra-tag` finding and stays; a different
  reaction gives `set-forum-reaction`; Neil's post with other text gives `edit-how-to` (with `unarchive` when archived);
  Neil's post unpinned and no other pinned gives `pin-how-to`; another pinned post gives `other-post-pinned` and
  `open-how-to` with `pin: false`; unreadable posts give `forum-posts-unread` and no post step.
- [ ] T015 [US2] Green: `src/domain/setup-plan.ts`; report lines for the findings in `src/discord/server-setup.ts`
  (aggregate line for `forum-posts-unread`).

## Phase 5: User Story 3 - A Member posts the way the forum expects (P2)

Covered by US1's how-to post and permissions; checked by hand in TEST-RUN §6x.

## Phase 6: Polish

- [ ] T016 Docs: SERVER-SETUP.md (forums: tags, reaction, how-to post, changed in the layout file), STARTUP-GUIDE.md,
  TEST-RUN.md §6x (quickstart.md "Manual"), STATUS.md, ROADMAP.md row 030; Dictionary terms proposed to the user.
- [ ] T017 Review: `bot-reviewer` on the diff; `spec-auditor` against spec.md.
- [ ] T018 Manual: TEST-RUN §6x on the test server.

## Dependencies

T001–T002 before everything. T003→T004→T005→T006→T007→T008; T009→T010 can run alongside T003–T008; T011–T012 need T008
and T010; T013 needs T012. US2 (T014–T015) needs T008. Polish last.

## Implementation Strategy

MVP is US1: after T013 a real run finishes the forums. US2 makes later edits safe; both ship in this slice.
