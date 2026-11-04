import { utcDayOf } from "../domain/daily-quota.js";
import type { Position } from "../domain/exile.js";
import { escapeText, utcTime } from "./lookup-cards.js";

/** The texts of /reaper: add, closest and their refusals and answers. Names and reasons are escaped. */
export const reaperMessages = {
  refused: "Only R5s of Home Kingdom Alliances may change REAPER.",
  invalidReason: "Give a reason of 1 to 200 characters.",
  added: (name: string, kingdom: number, allianceText: string): string =>
    `${escapeText(name)} (Kingdom ${kingdom.toString()}, ${allianceText}) is now an Exile.`,
  alreadyExile: (name: string, reason: string): string => `${escapeText(name)} is already an Exile: ${escapeText(reason)}`,
  addLog: (name: string, uid: string, kingdom: number, adderId: string, reason: string): string =>
    `🔥 ${escapeText(name)} (${uid}, Kingdom ${kingdom.toString()}) added to REAPER by <@${adderId}>: ${escapeText(reason)}`,
  bothXAndY: "Give both x and y.",
  askXAndY: "Give x and y to measure from. Neil has no position for you.",
  noExilesInKingdom: (kingdom: number): string => `No Exiles in Kingdom ${kingdom.toString()}.`,
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
} as const;

function coordinates(position: Position): string {
  return `X:${position.x.toString()} Y:${position.y.toString()}`;
}
