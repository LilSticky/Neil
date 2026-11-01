import type { BaseMessageOptions } from "discord.js";
import type { RequestPurpose } from "../domain/daily-quota.js";
import type { RankOnLink } from "../domain/link.js";
import { nicknameFor } from "../domain/member-name.js";
import type { KingdomNumber, Uid } from "../domain/lookup-input.js";
import { rolesFor } from "../domain/managed-roles.js";
import type { LookupResult, Player } from "../domain/player.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { AppliedStore, AppliedState } from "../storage/applied-store.js";
import type { LinkStore } from "../storage/link-store.js";
import { applyNameAndRoles, type ApplyReport, type RolesGuild, type RolesMember } from "./member-roles.js";
import { nameAndRolesLeftLogLine, nameAndRolesLogLine, nameAndRolesNotAppliedLogLine } from "./name-and-roles-texts.js";

/** A Member of the server as the apply reaches it: the guild, and the member in it. */
export interface ServerMember {
  readonly guild: RolesGuild;
  readonly member: RolesMember;
}

/** The members of the server; undefined for a Member who is not on it. Rejects when Discord cannot be reached. */
export interface ServerMembers {
  memberOf(memberId: MemberId): Promise<ServerMember | undefined>;
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

export interface NameAndRolesDeps {
  readonly members: ServerMembers;
  readonly applied: AppliedStore;
  readonly links: LinkStore;
  readonly gameApi: NameAndRolesGameApi;
  readonly homeKingdom: KingdomNumber;
  readonly troopBracketLevels: readonly number[];
  readonly log: (message: BaseMessageOptions) => Promise<void>;
  readonly now: () => Date;
  readonly logError: (line: string) => void;
}

/** Builds the name and roles service. Its methods never throw: a failure is logged with the Member and changes nothing else. */
export function createNameAndRoles(deps: NameAndRolesDeps): NameAndRoles {
  return {
    onLinked: (memberId, player, rank) => guarded(deps, memberId, () => applyToMember(deps, memberId, player, rank)),
    onRankApproved: (memberId) => guarded(deps, memberId, () => approveRank(deps, memberId)),
    atStartup: () => startUp(deps),
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

/**
 * Looks up each Linked Member without a complete apply, in the order of their Links. A Member not on the server is
 * skipped with no lookup; a quota stop ends the run and the rest wait for the next start. Never throws.
 */
async function startUp(deps: NameAndRolesDeps): Promise<void> {
  try {
    const pending = deps.applied.linkedWithoutCompleteApply();
    for (const [index, link] of pending.entries()) {
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
    }
  } catch (error) {
    deps.logError(`Giving the Linked Members their name and roles at startup failed: ${reasonOf(error)}`);
  }
}

/** Applies the name and roles to a Member when they are on the server; a Member who is not on it is left alone. */
async function applyToMember(deps: NameAndRolesDeps, memberId: MemberId, player: Player, rank: RankOnLink): Promise<void> {
  const server = await deps.members.memberOf(memberId);
  if (server === undefined) return;
  await applyTo(deps, memberId, server, player, rank);
}

/** Looks the Player up with the rank of the Link, then applies the name and roles. Logs nothing when no Player came back. */
async function approveRank(deps: NameAndRolesDeps, memberId: MemberId): Promise<void> {
  const link = deps.links.linkFor(memberId);
  if (link === undefined) return;
  const result = await deps.gameApi.getPlayer(link.uid, "lookup");
  if (result.kind !== "found") {
    await deps.log(nameAndRolesNotAppliedLogLine(memberId));
    return;
  }
  const server = await deps.members.memberOf(memberId);
  if (server === undefined) return;
  await applyTo(deps, memberId, server, result.value, link.allianceRank);
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
  const report = await applyNameAndRoles(server.guild, server.member, { nickname, roles, managedTags });
  deps.applied.record(appliedStateOf(memberId, nickname, previous, roles, report, deps.now()));
  if (!hasChange(report, previous, nickname)) return;
  await deps.log(nameAndRolesLogLine(memberId, report, nickname ?? ""));
}

function appliedStateOf(
  memberId: MemberId,
  nickname: string | undefined,
  previous: AppliedState | undefined,
  roles: readonly string[],
  report: ApplyReport,
  appliedAt: Date,
): AppliedState {
  return {
    memberId,
    // An untouched nickname stays as it was on the server: the one applied before, if any.
    nickname: nickname ?? previous?.nickname ?? "",
    roles,
    appliedAt,
    complete: report.skipped.length === 0,
  };
}

/** Whether the apply changed anything worth a log line: a new nickname, a role changed or created, or a skipped step. */
function hasChange(report: ApplyReport, previous: AppliedState | undefined, nickname: string | undefined): boolean {
  const nicknameChanged = report.nickname === "set" && previous?.nickname !== nickname;
  const rolesChanged = report.added.length + report.removed.length + report.created.length > 0;
  return nicknameChanged || rolesChanged || report.skipped.length > 0;
}
