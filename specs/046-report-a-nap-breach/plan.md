# Implementation Plan: Report a NaP breach

**Spec**: [spec.md](spec.md) · **ADR**: [28](../../documentation/adr/0028-nap-breach-reports.md)

## Design

- **Domain** `src/domain/nap-report.ts`: `NapReport`, `NapReportOutcome` (five values), `NapReportProposal` with a
  `status` union; `mayReport` (council member, accused in the NaP, not their own), `napReportTextProblem`,
  `decidedOutcomeOf`, `waitingProposalOf`, `mayProposeOutcome`. Pure.
- **Storage** migration 29 (`nap_reports`, `nap_report_proposals`) and `NapReportStore` (`reports`, `proposals`, `file`,
  `setThread`, `remove`, `propose`, `setMotion`, `removeProposal`, `decide`), rows validated with zod. `decide` changes only
  a proposed row, so a result is applied once.
- **Server** `openPrivateThread(parentId, name, memberIds)` on the City Rotation's server (`city-rotation-server.ts`):
  a private, non-invitable thread under a text channel, returning its id and the Members who could not be added; `post`
  also takes a thread.
- **NaP register** `expel(tag, by, motionId)` in `src/discord/nap.ts`: a leave by the proposer, the leaders notice, the
  announcement and the list refresh, as a leave, naming no Member.
- **Adapter** `src/discord/nap-reports.ts` and `nap-report-texts.ts`: `report`, `proposeOutcome`, `settle`, and a `tick`
  run right after the NaP Rules'. An Exile is read with `gameApi.getPlayer(uid, "lookup", "copy")` and stored with
  `recordFoundExile`.
- **Wiring** `commands.ts`, `client.ts` (routing, the tick), `startup.ts`, `main.ts`; `server-layout.json` for the
  thread permissions in `#nap-leaders`.

No new dependencies.
