# Review: slice 029 (T015, bot-reviewer, 2026-11-07)

No must-fix findings. Checked: zod on every REST response, `allowed_mentions` none on post and edit, post → pin → notice
delete, 403 swallowed only in the pin read, the 2000-character refusal before any write, no write on a dry run, a pure
domain, and the layout's permissions (announcements for the Kingdom, copies per Language, off-topic opt-in, Doctor only in
the Guest area, Interaction Bot on translated channels).

| # | Finding | Outcome |
|---|---------|---------|
| 1 | A domain test read `server-layout.json` through the Discord adapter | fixed: moved to `server-setup.test.ts` |
| 2 | "Posts" names Neil and Interaction Bot | kept: it tells Members who writes there (research R5 covers "Seen by" only) |
| 3 | A failed pin left an unpinned message, so the next run posted twice | fixed: the message is deleted and the error rethrown |
| 4 | A failed notice delete failed the step | fixed: the notice stays |
| 5 | A translated copy's longer topic could pass 1024 characters | fixed: refused at load |
| 6 | A description with outer whitespace would never match Discord's trimmed text | fixed: refused at load |
