# Data Model: Rework the Server Layout

Changes to slice 020's [data model](../020-set-up-the-server/data-model.md). Everything not named here stays as it is.

## Layout file (`server-layout.json`)

New fields:

| Field | Where | Rule checked on load |
|-------|-------|----------------------|
| `translations` | top level, list of Language names | each is in `languages`; no duplicates |
| `description` | every channel, also in `allianceArea` | required, 1–1024 characters |
| `codeOfConduct` | a channel, list of lines | optional; joined with line breaks |

The Languages category's channels and the translated copies are generated, so their descriptions are too:

- `<language>-chat`: "Chat in <Language>."
- a translated copy: "<original description> Translated into <Language> by Interaction Bot."

## Shipped layout, what changes

| Category | Change |
|----------|--------|
| Guest area | `guest-announcements` removed |
| Alliance Duel | `ad-announcements` removed |
| Home Kingdom, Off-topic | removed; their channels move into Hangout |
| Hangout | `home-kingdom-announcements` (only King posts), `gift-codes`, `general`, `Hangout voice`, `alliance-hall`, `off-topic` and `memes` (both `seenBy: ["Off-topic"]`) |
| Recruitment | `recruitment` replaced by `looking-for-alliance` and `looking-for-players` |
| Events | `Coaching voice` added; `event-announcements` gets `seenBy: ["#<Home Kingdom>"]` and only King posts |
| Kingdom vs Kingdom | `kvk-announcements` gets `seenBy: ["#<Home Kingdom>"]` and `translated: true` |
| NaP | `nap-announcements` unchanged (already seen by the Kingdom, translated) |
| Basic information, Guest area | `rules` and `guest-rules` carry `codeOfConduct` from [code-of-conduct.md](code-of-conduct.md) |
| top level | `translations: ["Russian", "French", "Italian", "German"]` |

## Expansion

`ExpandedChannel` gains:

- `topic: string | undefined`: the description; undefined for voice.
- `message: string | undefined`: the description message (below); undefined for forums.

Translated channels expand into the channel plus one copy per translation Language (research R4), in the same category,
right after the original.

### Description message

```text
📌 **#<channel>**
<description>

👀 Seen by: <targets>
✍️ Posts: <posters | read only>        (left out for voice)

<code of conduct, if any>
```

## Server state

`ServerChannel` gains:

- `topic: string | undefined`
- `description: { messageId: string; text: string } | undefined`: Neil's pinned description (research R3); read only
  for text, announcement and voice channels.

## Setup steps

| Step | When | Writes |
|------|------|--------|
| `create-channel` | as today, now with `topic` | the topic goes in the create request |
| `set-topic` | an existing channel's topic differs from the wanted one | `PATCH` the channel's topic |
| `post-description` | a channel (new or existing) without Neil's description | post, pin, delete the pin notice |
| `edit-description` | Neil's description differs | edit the message |

Order on apply: roles, categories, channels, overwrites, topics, descriptions. A `post-description` for a new channel
finds it by name in its category after creation; when that channel's step failed, it fails too.

Report lines: `set topic of <channel>`, `post description in <channel>`, `edit description in <channel>`, with `would`
before each on a dry run.
