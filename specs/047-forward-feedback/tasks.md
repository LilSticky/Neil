# Tasks: Forward feedback

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test.

## Phase 1: Foundational

- [x] T001 [P] `src/discord/feedback-texts.ts` (+ test): the feedback channel names, the template text, the entry for a
  post (channel, thread, name, text, attachments, stickers, embeds, jump link; no text; split over 2000 characters at
  line breaks with nothing lost).
- [ ] T002 [P] `server-layout.json` and `server-setup.ts` (+ test): `#feedback` right after `#suggestions` in Hangout,
  seen by everyone; Neil may view, post, read history, pin and add reactions in both; `AddReactions` is a permission
  name; the by-hand lines name the Message Content Intent.

## Phase 2: User Stories 1 to 3

- [ ] T003 `src/discord/feedback.ts` (+ test): which messages are Feedback Posts (bots, webhooks, system messages, other
  channels and other guilds are not; threads under a feedback channel are), forwarding with mentions off, the 📝 only
  after the entry, a failed entry (no reaction, nothing in the channel), a failed reaction (one `#neil-log` line), and
  pinning the template at startup (missing, present, missing channel, refused pin).
- [ ] T004 `client.ts` (+ test): the `GuildMessages` and `MessageContent` intents, `MessageCreate` routed to the
  forwarding, the templates pinned once at startup.

## Phase 3: Polish

- [ ] T005 ADR 30, DICTIONARY (Feedback Post, Feedback Template).
- [ ] T006 ROADMAP row 047, STATUS, SERVER-SETUP (`#feedback`), HOSTING section 1 (Message Content Intent, and the invite
  gives Neil a role), DISCORD-PLATFORM (the intents).
- [ ] T007 Smoke test on test Neil through Neil Police (NEIL-POLICE.md section 3a), after the setup script: `#feedback`
  exists beside `#suggestions`, both have Neil's pinned template, and the console and `#neil-log` show no errors. A post
  by a Member needs a Member's account, so the forwarding itself is left to the #330 server (ADR 29).
