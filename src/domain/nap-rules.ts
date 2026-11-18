/** The longest text of a NaP Rules Version, in characters: Discord's limit for a form field. */
export const NAP_RULES_MAX_TEXT = 4000;

/** The longest note on what a NaP Rules Version changed, in characters. */
export const NAP_RULES_MAX_CHANGE = 500;

/** The stored state of a NaP Rules Version: proposed until its NaP Motion closes, then approved or rejected. */
export type NapRulesStatus =
  | { readonly kind: "proposed" }
  | { readonly kind: "approved"; readonly decidedAt: Date }
  | { readonly kind: "rejected"; readonly decidedAt: Date };

/** The result of the NaP Motion a NaP Rules Version was put to. */
export type NapRulesOutcome = "approved" | "rejected";

/**
 * A NaP Rules Version: one numbered text of the NaP Rules (1, 2, 3…, one number per proposal, also a rejected one), with
 * its note on what changed, when it was proposed, and its state.
 */
export interface NapRulesVersion {
  readonly number: number;
  readonly text: string;
  readonly change: string;
  readonly proposedAt: Date;
  readonly status: NapRulesStatus;
}

/** How a NaP Rules Version reads: in effect and replaced are worked out from the versions, never stored. */
export type NapRulesState = "proposed" | "in-effect" | "replaced" | "rejected";

/** The moment a version was decided, or undefined while it is proposed. */
function decidedAtOf(version: NapRulesVersion): Date | undefined {
  return version.status.kind === "proposed" ? undefined : version.status.decidedAt;
}

/** The NaP Rules in effect: the approved version decided last; undefined while none was approved. */
export function currentNapRules(versions: readonly NapRulesVersion[]): NapRulesVersion | undefined {
  let current: { readonly version: NapRulesVersion; readonly at: number } | undefined;
  for (const version of versions) {
    const decidedAt = decidedAtOf(version);
    if (version.status.kind !== "approved" || decidedAt === undefined) continue;
    const at = decidedAt.getTime();
    if (current === undefined || at > current.at || (at === current.at && version.number > current.version.number)) {
      current = { version, at };
    }
  }
  return current?.version;
}

/** How `version` reads among `versions`: an approved version other than the current one is replaced. */
export function napRulesStateOf(version: NapRulesVersion, versions: readonly NapRulesVersion[]): NapRulesState {
  switch (version.status.kind) {
    case "proposed":
      return "proposed";
    case "rejected":
      return "rejected";
    case "approved":
      return currentNapRules(versions)?.number === version.number ? "in-effect" : "replaced";
  }
}

/** The number the next proposed version gets: one more than the highest so far, 1 for the first. */
export function nextNapRulesNumber(versions: readonly NapRulesVersion[]): number {
  return versions.reduce((highest, version) => Math.max(highest, version.number), 0) + 1;
}

/** The version that waits for its NaP Motion; undefined when none does. */
export function openNapRulesProposal(versions: readonly NapRulesVersion[]): NapRulesVersion | undefined {
  return versions.find((version) => version.status.kind === "proposed");
}

/** Whether a new version may be proposed: only while no other one waits for its NaP Motion. */
export function mayProposeNapRules(versions: readonly NapRulesVersion[]): boolean {
  return openNapRulesProposal(versions) === undefined;
}

/** The version decided by its NaP Motion's outcome; undefined when it is no longer proposed, so it is decided once. */
export function decideNapRules(
  version: NapRulesVersion,
  outcome: NapRulesOutcome,
  at: Date,
): NapRulesVersion | undefined {
  if (version.status.kind !== "proposed") return undefined;
  return { ...version, status: { kind: outcome, decidedAt: at } };
}

/** Why a proposed text is refused. */
export type NapRulesTextProblem = "blank-text" | "blank-change" | "text-too-long" | "change-too-long" | "unchanged";

/** Checks a trimmed text and change note against the current rules; undefined when they may be proposed. */
export function napRulesTextProblem(
  text: string,
  change: string,
  current: NapRulesVersion | undefined,
): NapRulesTextProblem | undefined {
  if (text === "") return "blank-text";
  if (change === "") return "blank-change";
  if (text.length > NAP_RULES_MAX_TEXT) return "text-too-long";
  if (change.length > NAP_RULES_MAX_CHANGE) return "change-too-long";
  if (current !== undefined && current.text === text) return "unchanged";
  return undefined;
}
