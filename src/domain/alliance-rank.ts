import type { AllianceRank } from "./player.js";

/** One row of an Alliance's roster as the Game lists it; the label is null when the Game has none. */
export interface RosterRow {
  readonly uid: string;
  readonly rankLabel: string | null;
}

/** The Alliance Rank of the given Player, read from their own row; unknown unless the label is R1–R5. */
export function rankFromRoster(playerUid: string, roster: readonly RosterRow[]): AllianceRank {
  const row = roster.find((entry) => entry.uid === playerUid);
  switch (row?.rankLabel) {
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
