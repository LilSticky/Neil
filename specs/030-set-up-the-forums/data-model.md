# Data model: Set up the forums

## Layout file: Forum Setup (on a forum channel)

| Field | Type | Rules |
|-------|------|-------|
| `forum.tags` | string[] | 1–20 entries; each 1–20 characters, no outer whitespace; no name twice (case-insensitive) |
| `forum.reaction` | string | one emoji (one Extended_Pictographic code point, optional U+FE0F) |
| `forum.howTo.belongs` | string | 1–500 characters: what belongs in the forum |
| `forum.howTo.exampleTitle` | string | 1–100 characters |
| `forum.howTo.template` | string[] | 1–10 lines, each 1–100 characters: the headings to fill in |

Required on `type: "forum"`, refused on any other type. The built post must fit 2000 characters.

## Expansion

`ExpandedChannel` of a forum gains `forum: { tags: string[]; reaction: string; howTo: { title: string; content: string } }`.
Its @everyone overwrite denies `ViewChannel` and `SendMessages`.

## How-to Post (built by `forumHowTo(name, forum)`)

- **title**: `How to post in #<name>`
- **content**:

```text
📌 **How to post in #<name>**
<belongs>

**Title:** what your post is about, e.g. "<exampleTitle>"
**Tags:** pick one or two: <tags joined by ", ">
**Body:** copy this and fill it in:
```<newline><template lines, each followed by ":"><newline>```

Reply inside a post to discuss it. React with <reaction> to a post you found useful.
```

## Server state

`ServerChannel` gains, for a forum only, `forum`:

| Field | Type | Meaning |
|-------|------|---------|
| `tags` | `{ id: string; name: string }[]` | the forum's available tags |
| `reaction` | `string \| undefined` | the default reaction's `emoji_name` |
| `postsReadable` | boolean | false when Discord refused the read of the forum's posts |
| `howTo` | `{ threadId; title; content; archived; pinned } \| undefined` | Neil's post (R5) |
| `otherPinned` | boolean | another post of the forum is pinned |

## Steps (new)

| Step | Fields | When |
|------|--------|------|
| `set-forum-tags` | id \| undefined, name, categoryName, tags: `{ id?: string; name: string }[]` | layout tags missing |
| `set-forum-reaction` | id \| undefined, name, categoryName, reaction | reaction differs or missing |
| `open-how-to` | id \| undefined, name, categoryName, title, content, pin: boolean | no Neil post |
| `edit-how-to` | threadId, name, title, content, unarchive: boolean | title or content differs |
| `pin-how-to` | threadId, name | Neil's post unpinned and no other pinned |

`id` is undefined for a forum the plan creates; the adapter looks it up by name and category, as for descriptions.

## Findings (new)

| Finding | Fields |
|---------|--------|
| `extra-tag` | name, tag |
| `other-post-pinned` | name |
| `forum-posts-unread` | name (aggregated into one line) |
