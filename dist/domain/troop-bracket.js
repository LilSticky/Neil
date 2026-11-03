const TROOP_BRACKETS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10"];
/**
 * The Troop Bracket for a sanctuary level, given the first level of each tier in strictly increasing order
 * (the configured table, FR-006). Undefined below the first level of the table.
 */
export function bracketFor(level, levels) {
    const tiersReached = levels.filter((firstLevel) => level >= firstLevel).length;
    return TROOP_BRACKETS[tiersReached - 1];
}
//# sourceMappingURL=troop-bracket.js.map