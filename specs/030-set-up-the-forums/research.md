# Research: Set up the forums

## R1 Where the forum settings live

- **Decision**: a `forum` block on each forum channel of `server-layout.json`:
  `{ "tags": [...], "reaction": "📚", "howTo": { "belongs": "...", "exampleTitle": "...", "template": [...] } }`. It is
  required on a forum and refused on any other type.
- **Rationale**: one place per forum, next to its description; the owner edits a file, as for descriptions (slice 029).
- **Alternatives**: a separate forums file (two places to keep in step); tags shared by all forums (rejected by the user).

## R2 Recommended permissions

- **Decision**: a forum's wanted overwrite for @everyone denies View Channel **and Send Messages**. The roles that see or
  post in the forum keep their own allows (slice 029's fix), so posting is unchanged.
- **Rationale**: measured on the test server on 2026-11-07: Discord's "Set recommended permissions" step changed only
  @everyone's deny on `pvp-tactics` from View Channel to View Channel + Send Messages.
- **Alternatives**: none; this is what the checklist checks.

## R3 Tags

- **Decision**: the script compares tags by name. A missing tag is added; present tags keep their ids (so posts keep them);
  a tag the layout doesn't name is kept and reported as `extra-tag`. The written list is the layout's tags in layout order,
  then the extras. One `PATCH /channels/{forum}` with `available_tags` (existing tags with their `id`, new ones by `name`).
  No emoji on tags; not moderated.
- **Rationale**: removing a tag would strip it from posts; the owner removes tags by hand, as with extra overwrites.
- **Alternatives**: replace the list (loses tags on posts).

## R4 Default reaction

- **Decision**: `default_reaction_emoji: { emoji_id: null, emoji_name: "<emoji>" }` via the same PATCH route, planned
  only when `emoji_name` differs. The layout value must be one emoji: one Extended_Pictographic code point, optionally
  followed by U+FE0F (⚔️ is U+2694 U+FE0F).
- **Alternatives**: custom server emoji (needs an id per server).

## R5 Finding Neil's how-to post

- **Decision**: Neil's post is the oldest thread in the forum whose owner is Neil and whose starter message starts with 📌.
  Threads come from `GET /guilds/{guild}/threads/active` (once) and `GET /channels/{forum}/threads/archived/public` (per
  forum). The starter message of a forum post has the thread's id: `GET /channels/{thread}/messages/{thread}`. A 403 on the
  archived read means Neil can't see the forum's posts (no Administrator): the forum's posts are unread, reported in one
  line like the descriptions.
- **Rationale**: same rule as descriptions (Neil's author id plus the 📌 mark); archived posts are found too, so a quiet
  week doesn't produce a second post.

## R6 Opening, editing and pinning

- **Decision**: open with `POST /channels/{forum}/threads` `{ name: "How to post in #<forum>", message: { content,
  allowed_mentions: { parse: [] } } }`, then pin with `PATCH /channels/{thread}` `{ flags: PINNED (1 << 1) }`. Edit with
  `PATCH /channels/{thread}/messages/{thread}`. An archived post is unarchived first (`archived: false`), since an
  archived thread's messages can't be edited. A post that is Neil's but not pinned gets a pin step.
- **One pinned post per forum**: when another post is pinned, the script reports `other-post-pinned` and opens Neil's post
  without pinning it.
- **Rationale**: Discord's documented routes; Manage Threads comes with Administrator in the real run.

## R7 The how-to text

- **Decision**: built in `src/domain/forum-how-to.ts` from the forum block and the forum's name (data-model.md, How-to
  Post). The title is fixed per forum; the content follows [how-to-posts.md](how-to-posts.md). Checked at load against
  2000 characters.

## R8 Apply order and report

- **Decision**: forum steps run after topics and descriptions: tags, reaction, then posts. Report lines:
  `set tags of <forum>`, `set reaction of <forum>`, `open how-to post in <forum>`, `edit how-to post in <forum>`,
  `pin how-to post in <forum>`, each prefixed `would` on a dry run. Findings: `<forum> has tag <tag> that the layout
  doesn't name`; `<forum> has another pinned post; Neil's how-to post stays unpinned`; and one aggregate line for unread
  forums.
