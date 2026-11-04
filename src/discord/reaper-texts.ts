import { escapeText } from "./lookup-cards.js";

/** The texts of /reaper add: the refusal, the reason, the answers and the log line. Names and reasons are escaped. */
export const reaperMessages = {
  refused: "Only R5s of Home Kingdom Alliances may change REAPER.",
  invalidReason: "Give a reason of 1 to 200 characters.",
  added: (name: string, kingdom: number, allianceText: string): string =>
    `${escapeText(name)} (Kingdom ${kingdom.toString()}, ${allianceText}) is now an Exile.`,
  alreadyExile: (name: string, reason: string): string => `${escapeText(name)} is already an Exile: ${escapeText(reason)}`,
  addLog: (name: string, uid: string, kingdom: number, adderId: string, reason: string): string =>
    `🔥 ${escapeText(name)} (${uid}, Kingdom ${kingdom.toString()}) added to REAPER by <@${adderId}>: ${escapeText(reason)}`,
} as const;
