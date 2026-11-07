# Tasks: Rework the Server Layout

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/cli.md](contracts/cli.md), [quickstart.md](quickstart.md)

**Tests**: required (constitution II). Every implementation task follows a red task: `test-first` writes the failing test,
`implementer` makes it green.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

None: the slice works in slice 020's modules.

## Phase 2: Foundational (the layout file's new fields)

- [ ] T001 Red: in `src/discord/server-setup.test.ts`, `parseLayout` accepts a channel `description` (string), a channel
  `codeOfConduct` (list of strings, optional) and a top-level `translations` (list of Language names); it refuses a channel
  without `description`, a `description` over 1024 characters ("required, 1–1024 characters"), and a `translations` entry
  missing from `languages` or listed twice, each naming the category and channel. Same for `allianceArea` channels.
- [ ] T002 Green: extend the zod schemas and the checks in `src/discord/server-setup.ts` and the types in
  `src/domain/server-layout.ts` (`LayoutChannel.description`, `LayoutChannel.codeOfConduct`, `ServerLayout.translations`).
  Update the test layouts in `src/discord/server-setup.test.ts` and `src/domain/*.test.ts` to carry descriptions.

## Phase 3: User Story 1 - The owner builds the reworked layout (P1)

**Goal**: the shipped layout holds the user's eight changes; translated copies are generated.

**Independent Test**: the shipped file loads, and its expansion holds exactly the reworked categories and channels.

- [ ] T003 [US1] Red: in `src/domain/server-layout.test.ts`, `expandLayout` turns a `translated: true` channel into the
  channel plus one copy per `translations` entry, named `<channel>-<language in lower case>`, right after it in the same
  category, seen only by that Language's role (@everyone denied View Channel), with the same mode, the Interaction Bot allow,
  and the description "<description> Translated into <Language> by Interaction Bot."
- [ ] T004 [US1] Green: copies in `expandLayout`, `src/domain/server-layout.ts`.
- [ ] T005 [US1] Red: in the "shipped server-layout.json" tests of `src/discord/server-setup.test.ts`, replace the tests
  that name the old categories and assert: no `guest-announcements`, no `ad-announcements`; no Home Kingdom or Off-topic
  category; Hangout (seen by the Kingdom) holds `home-kingdom-announcements`, `gift-codes` (R4, R5, King post),
  `general`, `Hangout voice`, `alliance-hall`, `off-topic` and `memes`, the last two seen only by `Off-topic`; Recruitment
  holds `looking-for-alliance` and `looking-for-players` and no `recruitment`; Events holds voice `Coaching voice`;
  `home-kingdom-announcements`, `nap-announcements`, `event-announcements` and `kvk-announcements` are seen by the Kingdom
  role with only King posting; the Russian, French, Italian and German copies of `kvk-announcements` and
  `nap-announcements` exist, each seen by its Language role; every channel has a description; Doctor still sees only the
  Guest area.
- [ ] T006 [US1] Green: rework `server-layout.json`: the moves and removals above, `translations`, a description for
  every channel and Alliance area channel (what it is for, in Neil's Liaison voice), `codeOfConduct` for `rules` and
  `guest-rules` copied from [code-of-conduct.md](code-of-conduct.md).

**Checkpoint**: a dry run on the test server lists the reworked layout.

## Phase 4: User Story 2 - A Member sees what a channel is for (P1)

**Goal**: every channel gets its topic and Neil's pinned description, kept up to date by later runs.

**Independent Test**: plan, apply and report tests with `FakeSetupServer`; REST tests with the fake `SetupRest`.

- [ ] T007 [US2] Red: in `src/domain/server-layout.test.ts`, each expanded channel carries `topic` (the description;
  undefined for voice) and `message` (undefined for forums): `📌 **#<channel>**`, the description, a blank line,
  `👀 Seen by: <targets>` (View Channel allowed, Neil and external roles left out, Kingdom role as `#<number>`), and, not for
  voice, `✍️ Posts: <posters>` (seers whose Send Messages isn't denied plus targets with Send Messages allowed) or
  `✍️ Posts: read only`. Language chats get "Chat in <Language>."; Alliance areas name their `[TAG]` role.
- [ ] T008 [US2] Green: topic and message in `src/domain/server-layout.ts` (or `src/domain/channel-description.ts` if it
  grows past a few functions).
- [ ] T009 [US2] Red: in `src/domain/setup-plan.test.ts`, with `ServerChannel.topic` and `ServerChannel.description`
  (`{ messageId, text }`): a new channel's `create-channel` step carries its topic and is followed by `post-description`;
  an existing channel with another topic gets `set-topic`; without Neil's description, `post-description`; with a
  different text, `edit-description`; with matching topic and text, no step. Forums get no description step, voice no topic.
- [ ] T010 [US2] Green: the new steps in `src/domain/setup-plan.ts`.
- [ ] T011 [US2] Red: in `src/discord/server-setup.test.ts`, `readServer` reads each channel's topic and, for text,
  announcement and voice channels, Neil's description: the oldest pin by Neil's user starting with `📌`; other pins are
  ignored. `applySetup` runs topics and descriptions after overwrites, finds a new channel by name in its category, fails
  `post-description` when the channel's creation failed, and the report says `set topic of`, `post description in`,
  `edit description in` (with `would` on a dry run). A message over 2000 characters stops the run before any write with
  exit 1, naming the channel. A second run on the fake after a real run reports `Nothing to do.`
- [ ] T012 [US2] Green: `SetupServer` gains `readPinnedDescriptions`-style reads, `setTopic`, `postPinnedMessage`,
  `editMessage`, and `createChannel` takes a topic, in `src/discord/server-setup.ts` and its `FakeSetupServer`.
- [ ] T013 [US2] Red: in `src/discord/setup-server-rest.test.ts`: the topic is in the create body and in
  `PATCH /channels/{id}`; `readChannels` maps `topic`; pins come from `GET /channels/{id}/messages/pins` (`items[].message`,
  checked with zod); posting sends `allowed_mentions: { parse: [] }`, then
  `PUT /channels/{id}/messages/pins/{message}`, then deletes the type 6 notice that references it; editing is
  `PATCH /channels/{id}/messages/{message}`.
- [ ] T014 [US2] Green: `SetupRest` gains `put` and `delete`; implement in `src/discord/setup-server-rest.ts`.
- [ ] T015 [US2] Review: `bot-reviewer` on the adapter and setup changes; fixes via `implementer`.

## Phase 5: User Story 3 - The rules are already there (P2)

**Goal**: `#rules` and `#guest-rules` show the code of conduct.

**Independent Test**: the expanded message of `rules` and `guest-rules` ends with their code of conduct.

- [ ] T016 [US3] Red: in `src/domain/server-layout.test.ts`, a channel with `codeOfConduct` has its lines, joined by line
  breaks, after a blank line at the end of its message; and in the shipped-layout tests, the `rules` and `guest-rules`
  messages hold the approved texts and stay under 2000 characters.
- [ ] T017 [US3] Green: append the code of conduct in `src/domain/server-layout.ts`.

## Phase 6: Polish & Cross-Cutting

- [ ] T018 [P] `documentation/SERVER-SETUP.md` §3: the new table (Hangout, Recruitment, Events voice, translated copies,
  announcements seen by the Kingdom, no Guest or AD announcements) and descriptions; `documentation/STARTUP-GUIDE.md`
  step 3 and 8 where they name channels.
- [ ] T019 [P] Dictionary: propose to the user the changes to Home Kingdom information, Guest area and Recruitment
  (`domain-modeler`); edit `documentation/DICTIONARY.md` only after approval.
- [ ] T020 [P] `documentation/TEST-RUN.md` §6v from [quickstart.md](quickstart.md); STATUS and ROADMAP (`housekeeper`).
- [ ] T021 `npm run test`, `npm run typecheck`, `npm run lint`, a dry run against the test server; `spec-auditor` before
  merging.
- [ ] T022 Manual: the user empties the test server and runs TEST-RUN.md §6v (Definition of Done 2).

## Dependencies

- T001–T002 block everything (the shipped file needs descriptions to load).
- US1 (T003–T006) and US2 (T007–T015) are independent after Phase 2; US3 (T016–T017) needs T007–T008.
- Polish after the stories; T022 after the merge or on the branch, as the user prefers.

## Parallel opportunities

- T003 and T007 (different describe blocks of one test file: run one after the other to keep the TDD guard simple).
- T013–T014 (REST) can run beside T009–T010 (domain).
- T018, T019, T020.

## Implementation strategy

MVP is US1: the reworked layout on a dry run. US2 then adds the descriptions, US3 the code of conduct; each is a commit
series of its own.
