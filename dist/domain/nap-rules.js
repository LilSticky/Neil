/** The longest text of a NaP Rules Version, in characters: Discord's limit for a form field. */
export const NAP_RULES_MAX_TEXT = 4000;
/** The longest note on what a NaP Rules Version changed, in characters. */
export const NAP_RULES_MAX_CHANGE = 500;
/** The moment a version was decided, or undefined while it is proposed. */
function decidedAtOf(version) {
    return version.status.kind === "proposed" ? undefined : version.status.decidedAt;
}
/** The NaP Rules in effect: the approved version decided last; undefined while none was approved. */
export function currentNapRules(versions) {
    let current;
    for (const version of versions) {
        const decidedAt = decidedAtOf(version);
        if (version.status.kind !== "approved" || decidedAt === undefined)
            continue;
        const at = decidedAt.getTime();
        if (current === undefined || at > current.at || (at === current.at && version.number > current.version.number)) {
            current = { version, at };
        }
    }
    return current?.version;
}
/** How `version` reads among `versions`: an approved version other than the current one is replaced. */
export function napRulesStateOf(version, versions) {
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
export function nextNapRulesNumber(versions) {
    return versions.reduce((highest, version) => Math.max(highest, version.number), 0) + 1;
}
/** The version that waits for its NaP Motion; undefined when none does. */
export function openNapRulesProposal(versions) {
    return versions.find((version) => version.status.kind === "proposed");
}
/** Whether a new version may be proposed: only while no other one waits for its NaP Motion. */
export function mayProposeNapRules(versions) {
    return openNapRulesProposal(versions) === undefined;
}
/** The version decided by its NaP Motion's outcome; undefined when it is no longer proposed, so it is decided once. */
export function decideNapRules(version, outcome, at) {
    if (version.status.kind !== "proposed")
        return undefined;
    return { ...version, status: { kind: outcome, decidedAt: at } };
}
/** Checks a trimmed text and change note against the current rules; undefined when they may be proposed. */
export function napRulesTextProblem(text, change, current) {
    if (text === "")
        return "blank-text";
    if (change === "")
        return "blank-change";
    if (text.length > NAP_RULES_MAX_TEXT)
        return "text-too-long";
    if (change.length > NAP_RULES_MAX_CHANGE)
        return "change-too-long";
    if (current !== undefined && current.text === text)
        return "unchanged";
    return undefined;
}
//# sourceMappingURL=nap-rules.js.map