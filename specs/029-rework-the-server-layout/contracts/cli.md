# Contract: `npm run server:setup` (changes)

Slice 020's [contract](../../020-set-up-the-server/contracts/cli.md) stands. Additions:

- **Exit code 1** also when a description message would be longer than 2000 characters; the error names the channel and
  nothing is written.
- **Output**: among what will or did change, after the channel and permission lines:
  `set topic of <channel>`, `post description in <channel>`, `edit description in <channel>` (each prefixed `would` on a dry
  run).
- A second run on an unchanged server still ends with `Nothing to do.`

# Contract: `server-layout.json` (changes)

```jsonc
{
  "translations": ["Russian", "French", "Italian", "German"],   // each also in "languages"
  "categories": [
    {
      "name": "Basic information",
      "seenBy": ["#<Home Kingdom>"],
      "channels": [
        {
          "name": "rules",
          "type": "text",
          "mode": "read-only",
          "description": "The rules of this server.",              // required, at most 1024 characters
          "codeOfConduct": ["📜 **Code of Conduct**", "", "1. …"]  // optional, one string per line
        }
      ]
    }
  ]
}
```
