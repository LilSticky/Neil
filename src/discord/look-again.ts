import { parseAllianceKey, parseKingdom, parseUid, type AllianceKey, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Position } from "../domain/exile.js";

/**
 * What a Look again button repeats: a Player card, an Alliance card, an Alliance Overview, or /reaper closest (measured
 * from `origin` when the command gave one).
 */
export type LookAgainTarget =
  | { readonly kind: "player"; readonly uid: Uid }
  | { readonly kind: "alliance"; readonly kingdom: KingdomNumber; readonly tag: AllianceKey }
  | { readonly kind: "overview"; readonly kingdom: KingdomNumber; readonly tag: AllianceKey }
  | { readonly kind: "reaper"; readonly origin?: Position };

/** A Look again button read back from its custom id: the Member who may press it, and what it repeats. */
export interface LookAgainPress {
  readonly ownerId: string;
  readonly target: LookAgainTarget;
}

const PREFIX = "again";
/** `again:{owner}:p:{uid}`: a Player card. The uid's digits are checked by parseUid. */
const PLAYER_ID = /^again:(\d+):p:(\d+)$/;
/** `again:{owner}:a:{kingdom}:{tag}`: an Alliance card. The tag is the rest of the id, checked by parseAllianceKey. */
const ALLIANCE_ID = /^again:(\d+):a:(\d+):(.+)$/;
/** `again:{owner}:o:{kingdom}:{tag}`: an Alliance Overview. */
const OVERVIEW_ID = /^again:(\d+):o:(\d+):(.+)$/;
/** `again:{owner}:r` or `again:{owner}:r:{x}:{y}`: /reaper closest, with or without an origin. */
const REAPER_ID = /^again:(\d+):r(?::(-?\d+):(-?\d+))?$/;

/** The custom id of a Look again button: `again:<ownerId>:<kind>...`, short enough for Discord's 100 characters. */
export function lookAgainCustomId(ownerId: string, target: LookAgainTarget): string {
  switch (target.kind) {
    case "player":
      return `${PREFIX}:${ownerId}:p:${target.uid}`;
    case "alliance":
      return `${PREFIX}:${ownerId}:a:${target.kingdom.toString()}:${target.tag}`;
    case "overview":
      return `${PREFIX}:${ownerId}:o:${target.kingdom.toString()}:${target.tag}`;
    case "reaper":
      return target.origin === undefined
        ? `${PREFIX}:${ownerId}:r`
        : `${PREFIX}:${ownerId}:r:${target.origin.x.toString()}:${target.origin.y.toString()}`;
  }
}

/** Reads a Look again button's custom id back; undefined for any other id, or one whose parts are not valid. */
export function parseLookAgainCustomId(customId: string): LookAgainPress | undefined {
  const player = PLAYER_ID.exec(customId);
  if (player !== null) return playerPressOf(player[1], player[2]);
  const alliance = ALLIANCE_ID.exec(customId);
  if (alliance !== null) return alliancePressOf("alliance", alliance[1], alliance[2], alliance[3]);
  const overview = OVERVIEW_ID.exec(customId);
  if (overview !== null) return alliancePressOf("overview", overview[1], overview[2], overview[3]);
  const reaper = REAPER_ID.exec(customId);
  if (reaper !== null) return reaperPressOf(reaper[1], reaper[2], reaper[3]);
  return undefined;
}

function playerPressOf(ownerId: string | undefined, uidText: string | undefined): LookAgainPress | undefined {
  const uid = uidText === undefined ? undefined : parseUid(uidText);
  if (ownerId === undefined || uid === undefined || !uid.ok) return undefined;
  return { ownerId, target: { kind: "player", uid: uid.value } };
}

function alliancePressOf(
  kind: "alliance" | "overview",
  ownerId: string | undefined,
  kingdomText: string | undefined,
  tagText: string | undefined,
): LookAgainPress | undefined {
  const kingdom = kingdomText === undefined ? undefined : parseKingdom(Number(kingdomText));
  const tag = tagText === undefined ? undefined : parseAllianceKey(tagText);
  if (ownerId === undefined || kingdom === undefined || tag === undefined || !kingdom.ok || !tag.ok) return undefined;
  return { ownerId, target: { kind, kingdom: kingdom.value, tag: tag.value } };
}

function reaperPressOf(
  ownerId: string | undefined,
  xText: string | undefined,
  yText: string | undefined,
): LookAgainPress | undefined {
  if (ownerId === undefined) return undefined;
  if (xText === undefined || yText === undefined) return { ownerId, target: { kind: "reaper" } };
  const x = Number(xText);
  const y = Number(yText);
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return undefined;
  return { ownerId, target: { kind: "reaper", origin: { x, y } } };
}
