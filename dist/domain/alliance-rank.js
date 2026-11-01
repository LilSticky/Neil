/** The Alliance Rank of the given Player, read from their own row; unknown unless the label is R1–R5. */
export function rankFromRoster(playerUid, roster) {
    const row = roster.find((entry) => entry.uid === playerUid);
    return row === undefined ? "unknown" : rankFromLabel(row.rankLabel);
}
/** A label that starts with R1–R5, alone or followed by a title ("R4 – Diplomat"), never by another letter or digit. */
const LABEL_PATTERN = /^R([1-5])(?![\p{L}\p{N}])/u;
/** The Alliance Rank for a roster label: R1–R5, also when a title follows it ("R4 – Diplomat"); otherwise unknown. */
export function rankFromLabel(label) {
    const rank = label === null ? undefined : LABEL_PATTERN.exec(label)?.[1];
    switch (rank) {
        case "1":
            return "R1";
        case "2":
            return "R2";
        case "3":
            return "R3";
        case "4":
            return "R4";
        case "5":
            return "R5";
        default:
            return "unknown";
    }
}
/** Highest rank first: R5 before R1, unknown last. */
const RANK_ORDER = { R5: 0, R4: 1, R3: 2, R2: 3, R1: 4, unknown: 5 };
/** Orders a roster by Alliance Rank, then Player Name ignoring case, then uid. Returns a new array. */
export function sortRoster(entries) {
    return [...entries].sort((a, b) => {
        const rankOrder = RANK_ORDER[a.allianceRank] - RANK_ORDER[b.allianceRank];
        if (rankOrder !== 0)
            return rankOrder;
        const nameOrder = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
        if (nameOrder !== 0)
            return nameOrder;
        return a.uid.localeCompare(b.uid, "en");
    });
}
//# sourceMappingURL=alliance-rank.js.map