---
name: adr
description: Create, supersede or deprecate an Architecture Decision Record in documentation/adr/ (Nygard format) and keep its index in sync. Use whenever a significant architecture or process decision is made — in /speckit-plan, during implementation, or for constitution amendments — and when asked to list or look up past decisions.
---

# Architecture Decision Records

ADRs live in `documentation/adr/`, numbered `NNNN-kebab-title.md`, indexed in `documentation/adr/README.md`. Format and rules: [ADR 1](../../../documentation/adr/0001-record-architecture-decisions.md).

## When to write one

Write an ADR when a decision is hard to reverse or would puzzle someone resuming after months: domain boundaries, persistence/IPC shape, libraries, file formats, process rules, constitution amendments. Don't write one for choices fully determined by the constitution or an existing ADR — reference that instead.

## Create

1. Read `documentation/adr/README.md`; the next number is the highest existing number + 1, zero-padded to 4 digits.
2. Create `documentation/adr/NNNN-kebab-title.md`:

   ```markdown
   # N. Title in sentence case

   Date: YYYY-MM-DD

   ## Status

   Accepted

   ## Context

   The forces at play: what problem, which constraints, what was tried. Neutral, factual.

   ## Decision

   "We will …" — the decision in active voice.

   ## Consequences

   - What becomes easier or harder, follow-up work, risks. Include the negative ones.
   ```

   Use terms from `documentation/DICTIONARY.md`. Status is `Proposed` if the user still has to confirm it, otherwise `Accepted`.
3. Append a row to the index table: `| N | [Title](NNNN-kebab-title.md) | Status |`.
4. If the decision changes the constitution, also bump its version (MAJOR/MINOR/PATCH) and reference the ADR.
5. Commit the ADR together with the change it explains (one small commit, e.g. `docs(adr): record <decision>`), or alone if it's a pure decision.

## Supersede / deprecate

Never edit the Context/Decision of an accepted ADR. Instead:

1. Create the new ADR as above; in its Context, link the ADR it replaces.
2. In the old ADR, change only the Status to `Superseded by [N. Title](NNNN-….md)` (or `Deprecated` with a one-line reason).
3. Update both rows in the index.

Typos and broken links may be fixed in place.

## Look up

To answer "why is X like this?", grep `documentation/adr/` and read the index first; cite ADRs as `ADR N`.
