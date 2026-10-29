---
name: dictionary
description: Add, clarify or rename a domain term in documentation/DICTIONARY.md and carry it through code, tests, UI texts and docs. Use when a needed term is missing, a term is ambiguous, two words name one concept, or the user wants a term renamed. Dictionary changes always need the user's approval first.
---

# Dictionary changes

`documentation/DICTIONARY.md` is the ubiquitous language (constitution; AGENTS.md). Code, tests, UI texts, commits and docs use its terms. It changes only with the user's approval.

## 1. Propose

Hand discovery or review to the `domain-modeler` agent when the term isn't obvious. Then ask the user with an interactive prompt (AskUserQuestion), never only in prose:

- **Add**: name, the bullet-point definition in the dictionary's style, and what it relates to.
- **Clarify**: the current entry and the changed bullets.
- **Rename**: old → new name, why, and a rough count of affected places (`git grep -i -w "<old>"`).

Offer 2–3 alternatives when the name itself is the question. Stop here if the user declines.

## 2. Update the dictionary

Edit `documentation/DICTIONARY.md`: one `## Term` heading per term under the `# Group` of its domain (see the existing groups in the file), short `*` bullets, referencing other terms by their exact names. Keep related terms near each other in their group; a term that fits no group is a domain question for the user. Commit alone: `docs(dictionary): add <Term>` / `clarify <Term>` / `rename <Old> to <New>`.

## 3. Carry a rename through

Find every use, matching the term's forms in code (`Old`, `old`, `OLD`, `old-…` file names) and prose:

```
git grep -n -i -E "<old>|<old-kebab>|<old_snake>"
```

- **Code and tests** (`src/`): types, symbols, files, test names. Delegate to the `implementer` agent with the exact old → new mapping; the existing tests are the safety net, so run `npm run typecheck`, `npm run test` and `npm run lint` and keep them as green as before. A rename changes no behaviour, so no new failing test is needed. The TDD pre-edit guard still requires a changed test file, which a rename always has.
- **Discord texts**: replies, embeds, command names and descriptions in `src/discord/`. Renaming a slash command or option also needs `npm run commands:register`.
- **Docs**: `specs/`, `documentation/` (not accepted ADRs' Context/Decision; ADRs are immutable), `AGENTS.md`, `.specify/memory/constitution.md` (needs an ADR and version bump if its meaning changes).
- **Persisted data**: if the term appears in stored data or cache keys, renaming it needs a storage migration; ask the user before doing that.

Commit the rename separately from any behaviour change: `refactor: rename <Old> to <New>`.

## 4. Add or clarify

A new term needs no sweep, but check the current slice's spec and `src/domain/` for places that used a stand-in word, and replace them.

## Report

The dictionary change, files touched, and anything left (e.g. persisted data, ADR wording).
