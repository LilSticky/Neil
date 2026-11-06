# Data model: Set up the server

No storage. All of these live in memory during one run.

## Layout file (`server-layout.json`)

```jsonc
{
  "roles": ["Moderator", "King", "Onboarding", "Doctor", "R5", "#<Home Kingdom>", "PvP", "..."],
  "externalRoles": ["Interaction Bot"],          // found, never created
  "languages": ["English", "..."],               // one `<language>-chat` each, in the Languages category, seen by that role
  "categories": [
    {
      "name": "Hangout",
      "seenBy": ["#<Home Kingdom>"],             // View Channel allow; @everyone View Channel deny is always added
      "channels": [
        { "name": "general", "type": "text" },
        { "name": "rules", "type": "text", "mode": "read-only" },
        { "name": "kvk-announcements", "type": "announcement", "mode": "only-king-posts", "translated": true },
        { "name": "closed", "type": "text", "seenBy": ["R5", "King"] },       // replaces the category's seenBy
        { "name": "onboarding", "type": "text", "overwrites": { "Neil": { "allow": ["ViewChannel"], "deny": [] } } }
      ]
    }
  ],
  "allianceArea": { "channels": [{ "name": "alliance-chat", "type": "text" }, { "name": "alliance-voice", "type": "voice" }] }
}
```

Rules checked on load, each failure naming the place:

- `type` is `text`, `voice`, `forum` or `announcement`; `mode` is `read-only` or `only-king-posts`.
- A target is a listed role, an external role, `@everyone` or `Neil`.
- A permission is one of the known names.
- Category names are unique; channel names are unique across the layout; text-like names are lowercase with no spaces.

## Expansion

| Input | Wanted overwrites |
|-------|-------------------|
| any category or channel | `@everyone`: deny ViewChannel |
| `seenBy` role | allow ViewChannel |
| `read-only` | each `seenBy` role: deny SendMessages |
| `only-king-posts` | each `seenBy` role: deny SendMessages, SendMessagesInThreads, CreatePublicThreads, CreatePrivateThreads; King: allow ViewChannel, SendMessages |
| `translated` | Interaction Bot: allow ViewChannel, SendMessages |
| `languages` | category `Languages`, channel `<language lowercased>-chat`, seen by the language's role |
| each `[TAG]` role | category `[TAG]`, seen by that role, with `allianceArea.channels` |

## Server state (read by the adapter)

`roles` (id, name, hasPermissions, managed, position), `channels` (id, name, kind, parentId, overwrites by target with allow and deny
names), `everyoneId`, `botUserId`, `botTopPosition`, `hasCommunity`, `botIsAdministrator`.

## Setup plan

- **Steps**: `create-role`, `create-category`, `create-channel` (with its fallback note), `correct-overwrites` (existing id, wanted
  targets and permissions, whether @everyone loses View Channel).
- **Findings**, reported only: `outside-layout`, `extra-overwrite`, `wrong-type`, `other-category`, `duplicate-name`,
  `external-role-missing`, `role-has-permissions`, `role-above-neil`, `fallback-to-text`, `hides-from-everyone`.
- **Result of a real run**: per step, done or failed with a reason. IDs for FR-012 come from a final read.
