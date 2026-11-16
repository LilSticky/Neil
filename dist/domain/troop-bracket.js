const TROOP_BRACKETS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10"];
/**
 * The Troop Bracket for a sanctuary level, given the first level of each tier in strictly increasing order
 * (the configured table, FR-006). Undefined below the first level of the table.
 */
export function bracketFor(level, levels) {
    const tiersReached = levels.filter((firstLevel) => level >= firstLevel).length;
    return TROOP_BRACKETS[tiersReached - 1];
}
/** Whether a text names a Troop Bracket, T1 to T10. */
export function isTroopBracket(text) {
    return TROOP_BRACKETS.includes(text);
}
/** A Troop Bracket's tier: 1 for T1 up to 10 for T10, so brackets compare by number (T10 above T9). */
export function tierOf(bracket) {
    return TROOP_BRACKETS.indexOf(bracket) + 1;
}
//# sourceMappingURL=troop-bracket.js.map