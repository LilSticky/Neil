# Bot review: slice 006 (T012, 2026-11-02)

Diff `7302e75..HEAD -- src/`.

| Level | Where | Finding | Fix |
|-------|-------|---------|-----|
| must | `member-roles.ts` in-flight map, `client.ts` `rolesGuildOf` | dedup keyed by a per-call guild object → concurrent Links can create duplicate roles | key by guild ID |
| must | `member-roles.ts` `removeRoles` | removes convention-named roles that grant permissions (not Managed Roles per ADR 8) | held Managed Roles = no permissions only |
| must | `member-roles.ts` `addRole` | an Alliance tag may equal Officer roles, `@everyone` or integration roles | never use configured Officer roles, `@everyone`, `managed` roles |
| should | `name-and-roles.ts` | owner/lasting skips leave `complete=false` → lookup and log on every start | owner nickname skip counts as complete |
| should | `name-and-roles.ts` `atStartup` | one error aborts the run | try/catch per Member |
| should | `name-and-roles.ts` `onRankApproved` | lookup before the on-server check; quota stop logged as "no Player" | check Member first; own quota line |
| should | `client.ts` `fetchMember` | only 10007 = not on server | also 10013 |
| could | `database.ts` foreign_keys | cascade risk on future table rebuilds | comment in migrations |
| could | `member-name.ts` | tag > ~26 chars overflows 32 | cut the tag too |
| could | `name-and-roles-texts.ts` | role names not escaped | escapeMarkdown |
| could | `member-roles.ts` | duplicate names: prefer one without permissions; removal stops mid-loop | prefer permission-free; continue loop |
