# Plan: Start the Interview

- `src/discord/interview.ts`: `onMemberJoined` only gives the role (Doctor Role when Linked, else the Onboarding Role).
  Remove `onMemberOnline`, `onlineAtStartup`, `startIfWanted`, `startOnlineAtStartup`, `STARTUP_LIMIT` and their types
  where nothing else uses them. Add `onStartButton(press: CommandLike)`, which runs the same path as `onCommand`.
- `src/discord/interview-texts.ts`: `INTERVIEW_START_ID = "interview-start"`, `interviewStartMessage()` (text + button,
  mentions off). Remove `onlineAtStartupLogLine`.
- `src/discord/onboarding-channels.ts`: `pinStartMessage(neilId)`: post and pin unless Neil's pinned copy (same
  content) is there. `ONBOARDING_PERMISSIONS` gains `SendMessages`, `PinMessages`.
- `src/discord/client.ts`: drop the `PresenceUpdate` → `memberOnline` route and the startup call; route a button with
  customId `interview-start` (checked before the `interview` prefix) to the start, adapting the discord.js button to
  `CommandLike` (displayName from the guild member); call `pinStartMessage` once at startup.
- `server-layout.json`: Neil in `#onboarding` gains `SendMessages` and `PinMessages`.
- No migration, no Game API change, no new dictionary term.
