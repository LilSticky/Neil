# Contract: `npm run server:setup` (changes)

Slice 020's and 029's contracts stand. Additions:

- **Exit code 1** also when a forum block is missing or invalid, or the built how-to post exceeds 2000 characters; the
  error names the forum, and nothing is written.
- **Output**, after the description lines (each prefixed `would` on a dry run):
  `set tags of <forum>`, `set reaction of <forum>`, `open how-to post in <forum>`, `edit how-to post in <forum>`,
  `pin how-to post in <forum>`.
- **Findings**: `<forum> has tag <tag> that the layout doesn't name`;
  `<forum> has another pinned post; Neil's how-to post stays unpinned`;
  `Neil can't read the posts of <n> forums without Administrator; a real run checks their how-to posts.`
- A second run on an unchanged server still ends with `Nothing to do.`

# Contract: `server-layout.json` (changes)

```jsonc
{
  "name": "pvp-tactics",
  "type": "forum",
  "description": "Battle plans and lessons learned, one post per topic.",
  "forum": {
    "tags": ["Rally", "Defense", "Scouting", "Troops", "Lessons learned"],
    "reaction": "⚔️",
    "howTo": {
      "belongs": "One battle plan, trick or lesson per post.",
      "exampleTitle": "Rally timing against #412",
      "template": ["Situation", "What we did", "What worked", "What didn't"]
    }
  }
}
```
