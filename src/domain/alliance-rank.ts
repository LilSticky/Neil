import type { AllianceRank, RosterEntry } from "./player.js";

/** One row of an Alliance's roster as the Game lists it; the label is null when the Game has none. */
export interface RosterRow {
  readonly uid: string;
  readonly rankLabel: string | null;
}

/** The Alliance Rank of the given Player, read from their own row; unknown unless the label is R1–R5. */
export function rankFromRoster(playerUid: string, roster: readonly RosterRow[]): AllianceRank {
  const row = roster.find((entry) => entry.uid === playerUid);
  return row === undefined ? "unknown" : rankFromLabel(row.rankLabel);
}

/** The Alliance Rank for a roster label: R1–R5, otherwise unknown. */
export function rankFromLabel(label: string | null): AllianceRank {
  switch (label) {
    case "R1":
      return "R1";
    case "R2":
      return "R2";
    case "R3":
      return "R3";
    case "R4":
      return "R4";
    case "R5":
      return "R5";
    default:
      return "unknown";
  }
}

/** Highest rank first: R5 before R1, unknown last. */
const RANK_ORDER: Record<AllianceRank, number> = { R5: 0, R4: 1, R3: 2, R2: 3, R1: 4, unknown: 5 };

/** Orders a roster by Alliance Rank, then Player Name ignoring case, then uid. Returns a new array. */
export function sortRoster(entries: readonly RosterEntry[]): RosterEntry[] {
  return [...entries].sort((a, b) => {
    const rankOrder = RANK_ORDER[a.allianceRank] - RANK_ORDER[b.allianceRank];
    if (rankOrder !== 0) return rankOrder;
    const nameOrder = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    if (nameOrder !== 0) return nameOrder;
    return a.uid.localeCompare(b.uid, "en");
  });
}
