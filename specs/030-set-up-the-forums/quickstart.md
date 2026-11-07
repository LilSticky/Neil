# Quickstart: Set up the forums

## Automated

```sh
npm test            # forum block parsing, expansion, planning, applying, REST
npm run typecheck && npm run lint
```

Proves: the shipped layout loads with five forum blocks; an empty in-memory server gets tags, reaction, the @everyone
Send deny and one pinned how-to post per forum; a second run plans nothing; changed tags, reaction or text plan only that
change; an extra tag is reported and kept; another pinned post leaves Neil's unpinned; an archived post is found.

## Manual (test server, TEST-RUN §6y)

1. `npm run server:setup` without Administrator: lists the tag, reaction, permission and post lines for the five forums,
   or the aggregate "can't read the posts" line.
2. Give Neil's role Administrator, `npm run server:setup -- --apply`, run it again: `Nothing to do.`
3. Open each forum: the getting-started checklist has no open step; Neil's how-to post is pinned at the top; the tags
   and the reaction match the layout.
4. As a Member with PvP: create a post in `pvp-tactics` with a tag. As a Member with Events but not Veteran: no
   "New Post" in `guides`.
5. Take Administrator off.
