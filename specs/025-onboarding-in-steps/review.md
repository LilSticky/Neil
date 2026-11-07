# Review of slice 025 (bot-reviewer)

Custom-id parsing, Guest/unlinked/other-Member refusals and Discord limits are sound. No must-fix findings.

## Should fix
- src/discord/preferences-texts.ts:178-248 and :32-34: `preferencesMessage` (four menus) is unused in production; only
  preferences-texts.test.ts uses it. Delete it with its tests, and drop the now-unused `PreferencesMessage` doc "four menus".
- src/discord/preferences-texts.ts:413-424: `finishedMessage` (guides line on Done) is never called; preferences-choices.ts:182
  still answers Done with `savedMessage()`. Either use `finishedMessage(preferences.experience, guidesForumId)` in `finish`
  (needs `deps.preferences.get` and the guides forum id) or delete it. As is, the guides line on Done is dead code.

## Nit
- src/discord/preferences-choices.ts:131-142: a Guest pressing Done passes the Guest check (done is handled first) and
  closes the prompt/thread. Pre-existing, but now reachable on the last step; consider refusing Guests before `finish`.
- src/discord/preferences-texts.ts:250: `pref:go:` regex and `[a-z]+` step are length-safe (id at most 39 of 100 chars,
  memberId 17-20 digits). `match[2] ?? ""` could use a capture-group assertion instead, harmless.
- src/discord/preferences-texts.ts:263: `PREFERENCE_STEPS.find(candidate => candidate === match[1])` is correct; no change.
