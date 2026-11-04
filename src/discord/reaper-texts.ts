import { utcDayOf } from "../domain/daily-quota.js";
import type { Exile, ExileRanking, Position } from "../domain/exile.js";
import { escapeText, utcTime } from "./lookup-cards.js";

type LeftOut = ExileRanking["leftOut"];

/** The texts of /reaper: add, closest, list, paging and their refusals and answers. Names and reasons are escaped. */
export const reaperMessages = {
  refused: "Only R5s of Home Kingdom Alliances may change REAPER.",
  invalidReason: "Give a reason of 1 to 200 characters.",
  added: (name: string, kingdom: number, allianceText: string): string =>
    `${escapeText(name)} (Kingdom ${kingdom.toString()}, ${allianceText}) is now an Exile.`,
  alreadyExile: (name: string, reason: string): string => `${escapeText(name)} is already an Exile: ${escapeText(reason)}`,
  addLog: (name: string, uid: string, kingdom: number, adderId: string, reason: string): string =>
    `🔥 ${escapeText(name)} (${uid}, Kingdom ${kingdom.toString()}) added to REAPER by <@${adderId}>: ${escapeText(reason)}`,
  removed: (name: string): string => `${escapeText(name)} is no longer an Exile.`,
  notAnExile: "not an Exile",
  removeLog: (name: string, uid: string, kingdom: number, removerId: string): string =>
    `${escapeText(name)} (${uid}, Kingdom ${kingdom.toString()}) removed from REAPER by <@${removerId}>`,
  /** The label of an Exile in the /reaper remove suggestions: the name and the Kingdom. */
  exileChoice: (name: string, kingdom: number): string => `${name} (Kingdom ${kingdom.toString()})`,
  bothXAndY: "Give both x and y.",
  askXAndY: "Give x and y to measure from. Neil has no position for you.",
  noExilesInKingdom: (kingdom: number): string => `No Exiles in Kingdom ${kingdom.toString()}.`,
  /** Every Exile of the Kingdom was left out, with the count and why. */
  allLeftOut: (leftOut: LeftOut): string => {
    const total = leftOut.shielded + leftOut.unreadable;
    const subject = total === 1 ? "The only Exile was" : `All ${total.toString()} Exiles were`;
    return `${subject} left out: ${leftOutCounts(leftOut)}.`;
  },
  /** The header line that says how many Exiles were left out and why. */
  leftOut: (leftOut: LeftOut): string => `Left out: ${leftOutCounts(leftOut)}.`,
  closestTitle: (kingdom: number): string => `Closest Exiles in Kingdom ${kingdom.toString()}`,
  closestOrigin: (origin: Position): string =>
    `Measured from ${coordinates(origin)}. Neil cannot see shields reliably, so an Exile behind a shield may still show.`,
  fields: {
    coordinates: "Coordinates",
    distance: "Distance",
    reason: "Reason",
    exiledOn: "Exiled on",
  },
  /** Coordinates as "X:3 Y:4"; a stored position also says when it was read. */
  coordinates: (position: Position, positionAt?: Date): string =>
    positionAt === undefined
      ? coordinates(position)
      : `${coordinates(position)} (position as of ${utcDayOf(positionAt)} ${utcTime(positionAt)})`,
  /** A distance rounded to one decimal place, the ".0" dropped. */
  distance: (value: number): string => (Math.round(value * 10) / 10).toString(),
  empty: "REAPER is empty.",
  listTitle: "Exiles in REAPER",
  /** One Exile of the list: name, Kingdom, reason and the day it was added. */
  listLine: (exile: Exile): string =>
    `**${escapeText(exile.name)}** · Kingdom ${exile.kingdom.toString()} · ${escapeText(exile.reason)} · exiled ${utcDayOf(exile.addedAt)}`,
  pageExpired: "This list has expired, run /reaper again.",
  pageNotYours: "Only the Member who ran /reaper can turn its pages.",
  previous: "◀ Previous",
  next: "Next ▶",
  pageLabel: (page: number, pageCount: number): string => `Page ${page.toString()}/${pageCount.toString()}`,
} as const;

/** The counts of the Exiles left out, each named only when there is one. */
function leftOutCounts(leftOut: LeftOut): string {
  const parts: string[] = [];
  if (leftOut.shielded > 0) parts.push(`${leftOut.shielded.toString()} shielded`);
  if (leftOut.unreadable > 0) parts.push(`${leftOut.unreadable.toString()} could not be read`);
  return parts.join(", ");
}

function coordinates(position: Position): string {
  return `X:${position.x.toString()} Y:${position.y.toString()}`;
}
