# 28. NaP breach reports

Date: 2026-11-19

## Status

Accepted. Builds on [ADR 25](0025-nap-motions-and-decision-log.md) (the decision) and
[ADR 20](0020-personal-data-of-the-nap-register.md) (the register); carries out outcomes through
[ADR 24](0024-reaper-is-kept-by-the-nap-council.md) (REAPER).

## Context

Slice 046 ("Report a NaP breach", issue #122) gives accusations of a NaP breach an evidence trail and a record of what was
decided, instead of an argument in chat. It is the most political part of the NaP. The owner settled the open questions:
only the R5 of an Alliance in the NaP files a report; the NaP Council decides by NaP Motion; Neil only records the
decision and never decides itself; the evidence stays private to the council, the reporter and the accused Alliance's
R5, and is kept forever; the public log shows only the outcome and the accused Alliance; an approved outcome is carried
out (an Exile through REAPER, or removal from the NaP register). Handling false reports comes later.

## Decision

**Who files and who decides.** A Member Linked to the R5 of an Alliance in the NaP (a member of the NaP Council) files a
**NaP Report** with `/nap report` against another Alliance in the NaP, optionally naming the accused Player by uid. Any
member of the NaP Council proposes a **Report Outcome** with `/nap report-outcome`: dismissed, warning, compensation,
expelled from the NaP, or Exile. Each proposal is put to a NaP Motion (ADR 25, default 48 hours), one at a time per
report; the motion's result decides it. A rejected outcome leaves the report open; an approved one decides it, once.
Neil never chooses an outcome. The accused Alliance votes like any Alliance in the NaP, because NaP Motions are unchanged.

**Where the evidence lives.** Each report gets a private thread under `#nap-leaders`, which only Neil can invite to. Neil
adds the Linked R5s of the Alliances in the NaP (the NaP Council, so also the accused Alliance's R5) and the reporter.
The evidence (screenshots, battle reports, coordinates) and the discussion are posted there. Neil copies nothing out of
the thread, and **never deletes, archives or locks it**; Discord keeps it.

**What is stored.** In `neil.db` (migration 29), `nap_reports` keeps per report: its number, the accused Alliance's tag,
the accused Player's uid when given, the text of what happened, the **Discord user id of the reporter** and their
Alliance's tag, when, and the thread's id. `nap_report_proposals` keeps per proposed outcome: the report, the outcome,
the optional note, the **Discord user id of the proposer**, when, its state (proposed, approved or rejected), when it was
decided, and the NaP Motion's id. Screenshots are not copied into `neil.db`. Rows are **kept forever and not deleted at
Unlink**: they are the record of what the NaP decided. The exceptions are a report whose thread could not be opened and
a proposal whose NaP Motion could not be opened; both are removed at once.

**Who sees what.**

- The thread: the NaP Council and the reporter, with the report, the evidence, each proposed outcome with its note, and
  each result.
- The NaP Motion in `#nap-leaders` and its entry in the public decision log (ADR 25): only the report's number, the
  accused Alliance and the proposed outcome; never the note, the evidence, the reporter or any Member.
- `#nap-announcements`: one post per approved outcome with only the report's number, the accused Alliance, the outcome
  and the date.
- `#neil-log` and `neil.db`: the only places that name the reporter and the proposer, one line per report, proposal and
  result. Every message Neil sends about reports has mentions off.

**Carrying out an outcome.** An approved expulsion takes the accused Alliance out of the NaP register as a leave recorded
with the proposer (so `nap_history` keeps its shape), announced as removed by the NaP Motion and naming no Member; no NaP
Cooldown applies. An approved Exile reads the accused Player through the rate-limited, caching Game API client and adds
them to REAPER as `/reaper add` does, with the report as the reason; an existing Exile stays as it was. When the Player
cannot be read, Neil says so in the thread and `#neil-log`, and the council adds the Exile by hand. The other outcomes
are only recorded.

## Consequences

- Accusations get one private place with their evidence, and every decision is on record, publicly as outcome only.
- The reporter and the proposer can be reconstructed from `neil.db` and `#neil-log` forever, also after Unlinks. A Member
  who wants their id removed needs an operator to edit `neil.db` by hand.
- The evidence lives in Discord, not in Neil: if someone with Manage Threads deletes a thread, it is gone.
- A false report cannot be marked yet; that comes with a later slice.
- Changing what is stored, how long it is kept, or who sees it needs a new ADR.
