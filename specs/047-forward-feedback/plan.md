# Implementation Plan: Forward feedback

**Spec**: [spec.md](spec.md) · **ADR**: [29](../../documentation/adr/0029-feedback-from-the-real-server-replaces-manual-checks.md),
[30](../../documentation/adr/0030-neil-reads-feedback-posts.md)

## Design

- **Texts** `src/discord/feedback-texts.ts`: `FEEDBACK_CHANNELS` (`feedback`, `suggestions`), the pinned
  `FEEDBACK_TEMPLATE` (the text in FEEDBACK.md, with a short line on how to use it), and `feedbackEntry(post)` that turns a
  Feedback Post (channel, thread, the Member's server nickname else display name, text, attachment URLs, sticker names,
  whether it has embeds, jump link) into message contents of at most 2000 characters with `splitBetweenLines`. A post
  without text says so and lists what it has. Pure, no discord.js.
- **Adapter** `src/discord/feedback.ts`:
  - `isFeedbackPost(message)`: in Neil's guild, not by a bot or webhook, a default or reply message (not a system message),
    in a feedback channel or a thread whose parent is one.
  - `forward(message)`: posts each part through `#neil-log` with `allowedMentions: { parse: [] }`, then reacts 📝. A failed
    post writes to the error log and does not react; a failed reaction writes one `#neil-log` line. Nothing is stored.
  - `pinTemplates()`: at startup, for each feedback channel found by name, reads the pins; if none is Neil's with the
    template's text, posts and pins it. A missing channel or a refused pin writes one `#neil-log` line.
- **Client** `client.ts`: the `GuildMessages` and `MessageContent` intents; `Events.MessageCreate` goes to
  `forward` when `isFeedbackPost`; `pinTemplates` once at startup next to the other pinned cards. Neil's own template post
  is a bot message, so it is never forwarded.
- **Layout** `server-layout.json`: `#feedback` in Hangout right after `#suggestions`; on both, Neil may view, post, read
  history, pin and add reactions (`AddReactions` joins the permission names in `server-setup.ts`). The by-hand lines name
  the Message Content Intent.

No migration, no new dependencies, no Game API requests.

## Constitution check

- Domain stays free of discord.js; the entry is built from plain values, the adapter validates the message shape.
- Personal data (ADR 7, ADR 29): the Member's name appears only in `#neil-log`; nothing about a post is stored.
- Least privilege: Message Content is read only to forward posts in the two feedback channels (ADR 30).
- Tests through fakes, no real Discord. Smoke test on test Neil through Police (ADR 29).
