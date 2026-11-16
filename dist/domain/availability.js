import { tierOf } from "./troop-bracket.js";
/** Every Fighter Class, strongest first. */
export const FIGHTER_CLASSES = ["whale", "dolphin", "seal", "small-fry"];
/** The Availability Poll opens this many hours before the Raid start (Wednesday at the start time, for a Saturday Raid). */
export const AVAILABILITY_POLL_LEAD_HOURS = 72;
const HOUR_MS = 3_600_000;
/**
 * Neil's suggested Fighter Class: the highest class whose Troop Bracket or Might the Player reaches; at exactly a
 * threshold the class is reached. An unknown Troop Bracket or Might counts as below every threshold.
 */
export function suggestFighterClass(bracket, might, thresholds) {
    const reaches = (threshold) => (bracket !== undefined && tierOf(bracket) >= tierOf(threshold.bracket)) || (might !== undefined && might >= threshold.might);
    if (reaches(thresholds.whale))
        return "whale";
    if (reaches(thresholds.dolphin))
        return "dolphin";
    if (reaches(thresholds.seal))
        return "seal";
    return "small-fry";
}
/** When the Raid's Availability Poll opens: 72 hours before its start. */
export function pollOpensAt(raid) {
    return new Date(raid.start.getTime() - AVAILABILITY_POLL_LEAD_HOURS * HOUR_MS);
}
/**
 * The clock's step for a poll. A poll opens once, from 72 hours before the start until the start, unless the Raid is
 * cancelled (a Raid cancelled before then gets none). An open poll closes as cancelled when the Raid is cancelled, and as
 * started at the start. A closed poll stays closed.
 */
export function pollStep(raid, poll, now) {
    const cancelled = raid.state.kind === "cancelled";
    const started = now.getTime() >= raid.start.getTime();
    if (poll.kind === "not-opened") {
        if (cancelled || started || now.getTime() < pollOpensAt(raid).getTime())
            return { kind: "none" };
        return { kind: "open" };
    }
    if (poll.kind === "closed")
        return { kind: "none" };
    if (cancelled)
        return { kind: "close", reason: "cancelled" };
    if (started)
        return { kind: "close", reason: "started" };
    return { kind: "none" };
}
/** Whether the poll takes an answer now: it must be open, the Raid not cancelled and not started. */
export function answerRefusal(raid, poll, now) {
    if (raid.state.kind === "cancelled" || (poll.kind === "closed" && poll.reason === "cancelled"))
        return "cancelled";
    if (poll.kind === "not-opened")
        return "not-opened";
    if (poll.kind === "closed" || now.getTime() >= raid.start.getTime())
        return "closed";
    return undefined;
}
const ZERO = { whale: 0, dolphin: 0, seal: 0, strategy: 0, smallFry: 0, notAvailable: 0 };
function counted(counts, availability) {
    if (availability.kind === "not-available")
        return { ...counts, notAvailable: counts.notAvailable + 1 };
    switch (availability.fighterClass) {
        case "whale":
            return { ...counts, whale: counts.whale + 1, strategy: counts.strategy + 1 };
        case "dolphin":
            return { ...counts, dolphin: counts.dolphin + 1, strategy: counts.strategy + 1 };
        case "seal":
            return { ...counts, seal: counts.seal + 1, strategy: counts.strategy + 1 };
        case "small-fry":
            return { ...counts, smallFry: counts.smallFry + 1 };
    }
}
/** The counts per Alliance (the tags given, and any other tag answered for) and for the Kingdom. Counts only, no names. */
export function availabilityTotals(answers, tags) {
    const allTags = [...new Set([...tags, ...answers.map((answer) => answer.tag)])].sort((a, b) => a.localeCompare(b));
    const alliances = allTags.map((tag) => ({
        tag,
        counts: answers.filter((answer) => answer.tag === tag).reduce((sum, answer) => counted(sum, answer.availability), ZERO),
    }));
    const kingdom = answers.reduce((sum, answer) => counted(sum, answer.availability), ZERO);
    return { alliances, kingdom };
}
/** The counts of one Alliance; zeros when it has no answers. */
export function countsOf(totals, tag) {
    return totals.alliances.find((alliance) => alliance.tag === tag)?.counts ?? ZERO;
}
//# sourceMappingURL=availability.js.map