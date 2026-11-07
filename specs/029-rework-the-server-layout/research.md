# Research: Rework the Server Layout

## R1. Where the topic goes

- **Decision**: the channel's `topic` field, sent in the create request for a new channel and with `PATCH /channels/{id}`
  for an existing one. Text and announcement channels (and their text fallback without Community) and forums get it; voice
  channels have no topic and get none.
- **Rationale**: one field, read back with the channels the setup already lists (`GET /guilds/{id}/channels` returns
  `topic`), so comparing costs no extra request. Discord caps a text topic at 1024 characters, a forum's at 4096; the setup
  uses 1024 for every kind.
- **Alternatives**: none worth keeping; the topic is the only place Discord shows at the top of every channel.

## R2. The description message

- **Decision**: Neil posts one message (`POST /channels/{id}/messages`, `allowed_mentions: { parse: [] }`), pins it
  (`PUT /channels/{id}/messages/pins/{message}`) and deletes Discord's "pinned a message" notice that follows (the newest
  messages, type 6, whose reference is that message). Text, announcement and voice channels get one; forums don't (a forum
  holds posts, not messages).
- **Rationale**: the pin keeps the description at hand after the channel fills up; deleting the notice keeps the
  description the first thing in a new channel. No mention pings anyone, because role names are written as plain text.
- **Alternatives**: role mentions (`<@&id>`) render nicer but tie the text to IDs and risk a ping on a later edit; a topic
  alone can't hold the code of conduct (1024 characters) or its formatting.

## R3. Recognising Neil's own message

- **Decision**: on each run the setup reads the pins of every text, announcement and voice channel
  (`GET /channels/{id}/messages/pins`). Neil's description is the oldest pin written by Neil's user whose text starts with
  `📌`. It is edited (`PATCH /channels/{id}/messages/{message}`) when the text differs, and posted and pinned again when there
  is none. Other pins are left alone.
- **Rationale**: no storage needed, works on a server another copy of Neil built, and the author check means another
  member's pin is never edited.
- **Alternatives**: keeping message IDs in `neil.db` (the script doesn't use the database, and the PC and Wispbyte hold
  different ones); searching the whole history (slow, and the pin is what the Member sees anyway).

## R4. Translated copies

- **Decision**: a top-level `translations` list in `server-layout.json` (each name also in `languages`). Expansion turns a
  channel with `translated: true` into the channel itself plus one copy per translation Language, named
  `<channel>-<language in lower case>`, seen only by that Language's role, with the same mode and the Interaction Bot
  allow. The copy's description is the channel's, followed by "Translated into <Language> by Interaction Bot."
- **Rationale**: one place to change the Languages (FR-006); the copies can't drift from their original.
- **Alternatives**: writing the eight channels out in the file: easy to get one wrong, and a new translation Language means
  editing every translated channel.

## R5. The access line

- **Decision**: built in the domain from the expanded overwrites, never written by hand. "Seen by" lists the targets with
  View Channel allowed (Neil and external roles left out); "Posts" says who may post: the seers whose Send Messages isn't
  denied plus every target with Send Messages allowed, or "read only" when that is nobody. Voice channels get "Seen by" only.
  `#<Home Kingdom>` reads as the Kingdom role, e.g. `#330`; an Alliance area names its `[TAG]` role.
- **Rationale**: FR-009, the text can't drift from the permissions.

## R6. Length limits

- **Decision**: `parseLayout` refuses a `description` over 1024 characters. The full message (description, access line,
  code of conduct) is rendered when the plan is made; a message over 2000 characters stops the run before any write,
  naming the channel.
- **Rationale**: the message length depends on the Kingdom number and the role names, which only the plan knows.

## R7. Voice channels

- **Decision**: voice channels get the description message in their text chat. If Discord refuses the post or the pin,
  that step fails and is reported like any other failed write; the manual check (quickstart) confirms it.
- **Rationale**: text in voice and its pins are standard, but the setup has never written to one; the report names it if
  not.

## R8. Rate limits and run time

- **Decision**: no throttle of our own. The extra reads are one pins request per channel (about 70); discord.js's REST
  queue waits out Discord's per-route limits.
- **Rationale**: the script already makes about 100 creates in one run through the same queue without trouble (the run on
  2026-11-07).

## R9. Rights

- **Decision**: no change to ADR 12. Posting, pinning, editing and setting topics happen in the same Administrator run;
  Neil at runtime gets no new right and never touches the descriptions.
- **Rationale**: the script is the owner's tool (constitution V's exception); what it writes grows, how it runs doesn't.
