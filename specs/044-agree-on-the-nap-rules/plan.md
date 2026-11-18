# Implementation Plan: Agree on the NaP Rules

**Spec**: [spec.md](spec.md) · **ADR**: [26](../../documentation/adr/0026-nap-rules-and-their-versions.md)

## Design

- **Domain** `src/domain/nap-rules.ts`: `NapRulesVersion` with a `status` union (`proposed`, `approved` and `rejected`
  with `decidedAt`); `currentNapRules`, `napRulesStateOf` (in effect and replaced worked out), `nextNapRulesNumber`,
  `openNapRulesProposal`, `mayProposeNapRules`, `decideNapRules`, `napRulesTextProblem`. Pure.
- **Storage** migration 27 (`nap_rules_versions`) and `NapRulesStore` (`versions`, `propose`, `setMotion`, `remove`,
  `decide`), rows validated with zod. `decide` changes only a proposed row, so a repeated outcome changes nothing.
- **NaP Motions** (`src/discord/nap-motions.ts`): `mayOpen(memberId)` (the rule of `/nap motion`) and
  `openFor(memberId, text)`, which opens a motion of the default length and returns the result instead of answering.
- **Adapter** `src/discord/nap-rules.ts` and `nap-rules-texts.ts`: the three subcommands, the form (`nap-rules:propose`),
  `settle(motionId, outcome)` and a `tick` that settles every proposed version whose NaP Motion has closed, run right
  after the NaP Motions' tick. The announcement reuses `splitBetweenLines` and `publicText` of the motion texts.
- **Wiring** `commands.ts`, `client.ts` (routing of the subcommands and the form, the tick), `startup.ts`, `main.ts`.

No Game API requests, no new dependencies.
