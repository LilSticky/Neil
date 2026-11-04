import type { BaseMessageOptions } from "discord.js";
import type { RequestPurpose } from "../domain/daily-quota.js";
import type { AllianceRef } from "../domain/daily-sync.js";
import type { RankOnLink } from "../domain/link.js";
import { nicknameFor } from "../domain/member-name.js";
import type { KingdomNumber, Uid } from "../domain/lookup-input.js";
import { rolesFor } from "../domain/managed-roles.js";
import type { LookupResult, Player } from "../domain/player.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { AppliedStore, AppliedState } from "../storage/applied-store.js";
import type { LinkStore } from "../storage/link-store.js";
import type { PreferenceRoles } from "./preferences.js";
import type { Unlink } from "./unlink.js";
import {
  applyNameAndRoles,
  type ApplyReport,
  type RolesGuild,
  type RolesMember,
  type Skipped,
} from "./member-roles.js";
import {
  nameAndRolesLeftLogLine,
  nameAndRolesLogLine,
  nameAndRolesNotAppliedLogLine,
  nameAndRolesQuotaLogLine,
  RANK_CHECK_NOTE,
} from "./name-and-roles-texts.js";

/** A Member of the server as the apply reaches it: the guild, and the member in it. */
export interface ServerMember {
  readonly guild: RolesGuild;
  readonly member: RolesMember;
}

/** The members of the server; undefined for a Member who is not on it. Rejects when Discord cannot be reached. */
export interface ServerMembers {
  memberOf(memberId: MemberId): Promise<ServerMember | undefined>;
  /** Every Member on the server, bots included. Rejects when Discord cannot be reached. */
  all(): Promise<readonly ServerMember[]>;
}

/** The part of the Game API client the name and roles use. */
export interface NameAndRolesGameApi {
  getPlayer(uid: Uid, purpose: RequestPurpose): Promise<LookupResult<Player>>;
}

/** The name and roles of a Linked Member, as the Interview and the Rank Approvals call them. Both reject on a failure. */
export interface NameAndRoles {
  /** A Link was made: the Member gets the name and roles of the Player and the rank on the Link. */
  onLinked(memberId: MemberId, player: Player, rank: RankOnLink): Promise<void>;
  /** A Rank Approval was given: the Member gets the name and roles again, with the rank approved. */
  onRankApproved(memberId: MemberId): Promise<void>;
  /** At startup: the Linked Members without a complete apply get their name and roles, until the Game API quota stops it. */
  atStartup(): Promise<void>;
}

/** The name and roles of the Daily Sync. */
export interface SyncNameAndRoles {
  /**
   * The Member gets the name and roles of the Player with the rank given, the nickname always restored, and the rank and
   * the Alliance are recorded. Resolves to whether anything changed (a line is logged then); false for a Member not on
   * the server. `server` is the Member as the caller already fetched them, so each is fetched once; else they are fetched
   * here. Never throws: a failure is logged and changes nothing else.
   */
  syncMember(memberId: MemberId, player: Player, rank: RankOnLink, server?: ServerMember): Promise<boolean>;
}

export interface NameAndRolesDeps {
  readonly members: ServerMembers;
  readonly applied: AppliedStore;
  readonly links: LinkStore;
  readonly gameApi: NameAndRolesGameApi;
  readonly unlink: Unlink;
  /** Follows the rank after every apply; a failure is logged and the name and roles stand. */
  readonly preferenceRoles: Pick<PreferenceRoles, "apply">;
  readonly homeKingdom: KingdomNumber;
  readonly troopBracketLevels: readonly number[];
  /** The Moderator and King role IDs from config: Neil never gives or takes these roles as Managed Roles. */
  readonly officerRoleIds: readonly string[];
  readonly log: (message: BaseMessageOptions) => Promise<void>;
  readonly now: () => Date;
  readonly logError: (line: string) => void;
}

/** Builds the name and roles service. Its methods never throw: a failure is logged with the Member and changes nothing else. */
export function createNameAndRoles(deps: NameAndRolesDeps): NameAndRoles & SyncNameAndRoles {
  return {
    onLinked: (memberId, player, rank) => guarded(deps, memberId, () => applyToMember(deps, memberId, player, rank)),
    onRankApproved: (memberId) => guarded(deps, memberId, () => approveRank(deps, memberId)),
    atStartup: () => startUp(deps),
    syncMember: (memberId, player, rank, server) => syncGuarded(deps, memberId, player, rank, server),
  };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function guarded(deps: NameAndRolesDeps, memberId: MemberId, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    deps.logError(`Giving ${memberId} their name and roles failed: ${reasonOf(error)}`);
  }
}

async function syncGuarded(
  deps: NameAndRolesDeps,
  memberId: MemberId,
  player: Player,
  rank: RankOnLink,
  server: ServerMember | undefined,
): Promise<boolean> {
  try {
    return await syncTo(deps, memberId, player, rank, server);
  } catch (error) {
    deps.logError(`Syncing ${memberId}'s name and roles failed: ${reasonOf(error)}`);
    return false;
  }
}

/**
 * Looks up each Linked Member without a complete apply, in the order of their Links. A Member not on the server is
 * Unlinked first, so is skipped with no lookup; a failure for one Member is logged and the next one follows; a quota stop
 * ends the run and the rest wait for the next start. Never throws.
 */
async function startUp(deps: NameAndRolesDeps): Promise<void> {
  try {
    await unlinkMissing(deps);
    const pending = deps.applied.linkedWithoutCompleteApply();
    for (const [index, link] of pending.entries()) {
      try {
        const server = await deps.members.memberOf(link.memberId);
        if (server === undefined) continue;
        const result = await deps.gameApi.getPlayer(link.uid, "lookup");
        if (result.kind === "quota-spent" || result.kind === "reserve-kept") {
          // The Member stopped at is still to do, so it counts as left.
          await deps.log(nameAndRolesLeftLogLine(pending.length - index));
          return;
        }
        if (result.kind !== "found") {
          await deps.log(nameAndRolesNotAppliedLogLine(link.memberId));
          continue;
        }
        await applyTo(deps, link.memberId, server, result.value, link.allianceRank);
      } catch (error) {
        deps.logError(`Giving ${link.memberId} their name and roles at startup failed: ${reasonOf(error)}`);
      }
    }
  } catch (error) {
    deps.logError(`Giving the Linked Members their name and roles at startup failed: ${reasonOf(error)}`);
  }
}

/**
 * Unlinks each Linked Member Discord reports as not on the server, as missing. A failure to reach Discord stops the
 * sweep: it is logged once, and the Members not yet checked are left as they are, so the apply that follows still sees
 * them. Repeated failures in an outage would only repeat the same error.
 */
async function unlinkMissing(deps: NameAndRolesDeps): Promise<void> {
  for (const link of deps.links.all()) {
    let server: ServerMember | undefined;
    try {
      server = await deps.members.memberOf(link.memberId);
    } catch (error) {
      deps.logError(`Checking ${link.memberId} is on the server at startup failed: ${reasonOf(error)}`);
      return;
    }
    if (server === undefined) await deps.unlink.unlink({ id: link.memberId }, "missing");
  }
}

/** Applies the name and roles to a Member when they are on the server; a Member who is not on it is left alone. */
async function applyToMember(deps: NameAndRolesDeps, memberId: MemberId, player: Player, rank: RankOnLink): Promise<void> {
  const server = await deps.members.memberOf(memberId);
  if (server === undefined) return;
  await applyTo(deps, memberId, server, player, rank);
}

/**
 * Checks the Member is on the server, then looks the Player up with the rank of the Link, then applies the name and
 * roles. A Member not on the server is left alone with no lookup; a quota stop and a missing Player are each logged.
 */
async function approveRank(deps: NameAndRolesDeps, memberId: MemberId): Promise<void> {
  const link = deps.links.linkFor(memberId);
  if (link === undefined) return;
  const server = await deps.members.memberOf(memberId);
  if (server === undefined) return;
  const result = await deps.gameApi.getPlayer(link.uid, "lookup");
  if (result.kind === "quota-spent" || result.kind === "reserve-kept") {
    await deps.log(nameAndRolesQuotaLogLine(memberId));
    return;
  }
  if (result.kind !== "found") {
    await deps.log(nameAndRolesNotAppliedLogLine(memberId));
    return;
  }
  await applyTo(deps, memberId, server, result.value, link.allianceRank);
}

/**
 * The Daily Sync's apply: the nickname is set whatever it was, the Managed Roles are made to match, and the Applied State
 * and the rank are recorded. A change, a restored nickname included, logs one line; false when the Member is not on the
 * server.
 */
async function syncTo(
  deps: NameAndRolesDeps,
  memberId: MemberId,
  player: Player,
  rank: RankOnLink,
  fetched: ServerMember | undefined,
): Promise<boolean> {
  const server = fetched ?? (await deps.members.memberOf(memberId));
  if (server === undefined) return false;
  const previous = deps.applied.get(memberId);
  const nickname = nicknameFor(player, rank, deps.homeKingdom);
  const roles = rolesFor(player, rank, deps.homeKingdom, deps.troopBracketLevels);
  // An Unlink may have ended the Link while the Member was fetched: nothing is given then, and nothing is recorded.
  if (deps.links.linkFor(memberId) === undefined) return false;
  // The nickname on the server before the apply: the Member may have changed it by hand since the last apply.
  const currentNickname = server.member.nickname;
  const report = await applyNameAndRoles(server.guild, server.member, {
    nickname,
    roles,
    managedTags: [...(previous?.roles ?? []), ...roles],
    officerRoleIds: deps.officerRoleIds,
  });
  deps.applied.record(appliedStateOf(memberId, nickname, previous, roles, report, deps.now(), allianceRefOf(player)));
  deps.links.updateRank(memberId, rank);
  await givePreferenceRoles(deps, memberId, rank);
  const nicknameChanged = report.nickname === "set" && currentNickname !== nickname;
  // The owner's nickname skip is the same on every run and never a change, so it is not logged.
  const otherSkips = report.skipped.filter((skip) => !isOwnerNicknameSkip(skip));
  if (!nicknameChanged && !rolesChanged(report) && otherSkips.length === 0) return false;
  const note = rank.source === "unknown" && player.alliance !== undefined ? RANK_CHECK_NOTE : undefined;
  await deps.log(nameAndRolesLogLine(memberId, report, nickname ?? "", note));
  return true;
}

/** Makes the Member match the Player: records the applied state, and logs one line when anything changed. */
async function applyTo(
  deps: NameAndRolesDeps,
  memberId: MemberId,
  server: ServerMember,
  player: Player,
  rank: RankOnLink,
): Promise<void> {
  const previous = deps.applied.get(memberId);
  const nickname = nicknameFor(player, rank, deps.homeKingdom);
  const roles = rolesFor(player, rank, deps.homeKingdom, deps.troopBracketLevels);
  // Alliance tags Neil applied before are managed too, so an Alliance or rank it no longer gives is taken off.
  const managedTags = [...(previous?.roles ?? []), ...roles];
  // An Unlink may have ended the Link while the Member was fetched or the Player looked up: nothing is given then.
  if (deps.links.linkFor(memberId) === undefined) return;
  const report = await applyNameAndRoles(server.guild, server.member, {
    nickname,
    roles,
    managedTags,
    officerRoleIds: deps.officerRoleIds,
  });
  // An Unlink may still end the Link during the apply: the foreign key then rejects this record, and the caller logs it.
  deps.applied.record(appliedStateOf(memberId, nickname, previous, roles, report, deps.now(), allianceRefOf(player)));
  await givePreferenceRoles(deps, memberId, rank);
  if (!hasChange(report, previous, nickname)) return;
  await deps.log(nameAndRolesLogLine(memberId, report, nickname ?? ""));
}

/** Gives the Preference Roles of the rank; a failure is logged with the Member, and the name and roles stand. */
async function givePreferenceRoles(deps: NameAndRolesDeps, memberId: MemberId, rank: RankOnLink): Promise<void> {
  try {
    await deps.preferenceRoles.apply(memberId, rank);
  } catch (error) {
    deps.logError(`Giving ${memberId} their Preference Roles failed: ${reasonOf(error)}`);
  }
}

function appliedStateOf(
  memberId: MemberId,
  nickname: string | undefined,
  previous: AppliedState | undefined,
  roles: readonly string[],
  report: ApplyReport,
  appliedAt: Date,
  alliance: AllianceRef | undefined,
): AppliedState {
  return {
    memberId,
    // An untouched nickname stays as it was on the server: the one applied before, if any.
    nickname: nickname ?? previous?.nickname ?? "",
    roles,
    appliedAt,
    complete: report.skipped.every(isOwnerNicknameSkip),
    alliance,
  };
}

/** The Alliance the Player is in, by Kingdom and tag; undefined in no Alliance. */
function allianceRefOf(player: Player): AllianceRef | undefined {
  return player.alliance === undefined ? undefined : { kingdom: player.kingdom, tag: player.alliance.tag };
}

/** Whether the apply created, added or removed a role. */
function rolesChanged(report: ApplyReport): boolean {
  return report.added.length + report.removed.length + report.created.length > 0;
}

/** The owner's nickname can never be set by Neil, so its skip is final: the apply is complete without it. */
function isOwnerNicknameSkip(skip: Skipped): boolean {
  return skip.what === "nickname" && skip.reason === "owner";
}

/** Whether the apply changed anything worth a log line: a new nickname, a role changed or created, or a skipped step. */
function hasChange(report: ApplyReport, previous: AppliedState | undefined, nickname: string | undefined): boolean {
  const nicknameChanged = report.nickname === "set" && previous?.nickname !== nickname;
  return nicknameChanged || rolesChanged(report) || report.skipped.length > 0;
}
