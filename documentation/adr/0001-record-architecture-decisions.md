# 1. Record architecture decisions

Date: 2026-10-29

## Status

Accepted

## Context

Neil is worked on in bursts, by a human and by autonomous agents. Every restart needs to recover
what was decided and why, from the repository alone.

## Decision

We record significant architecture decisions as Architecture Decision Records in
`documentation/adr/`, using Michael Nygard's format: title, date, status, context, decision,
consequences. Files are numbered `NNNN-kebab-title.md` and listed in `README.md` in this folder.
An ADR is never deleted or rewritten after acceptance; a new ADR supersedes it, and both are
marked accordingly.

## Consequences

- Every slice that makes a significant decision adds an ADR in the same change.
- Amendments to the constitution require an ADR.
- The index must be kept in sync; the `adr` skill does this.
