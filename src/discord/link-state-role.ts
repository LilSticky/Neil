import type { BaseMessageOptions } from "discord.js";
import type { Link } from "../domain/link.js";
import { planRoleStep } from "../domain/link-state-role.js";
import type { MemberId } from "../domain/rank-approval.js";
import { giveNamedRole, takeOffNamedRole, type RolesGuild, type RolesMember, type Skipped } from "./member-roles.js";
import type { ServerMember, ServerMembers } from "./name-and-roles.js";

/** The Links the service reads: a Member is Linked when a Link is recorded for them. */
export interface LinkStateRoleLinks {
  linkFor(memberId: MemberId): Link | undefined;
}

export interface LinkStateRoleDeps {
  readonly members: ServerMembers;
  readonly links: LinkStateRoleLinks;
  readonly logError: (line: string) => void;
  /** The log channel: receives the one summary line of the startup sweep. */
  readonly log: (message: BaseMessageOptions) => Promise<void>;
  /** The Officer roles of the server: Neil never gives or takes one, even one named like the role. */
  readonly officerRoleIds: readonly string[];
}

/** What a role that follows the Link needs to know of a Member: whether a bot, and whether Linked. */
export interface LinkStateMember {
  readonly bot: boolean;
  readonly linked: boolean;
}

/** The counts of one startup sweep: roles given, taken off, and changes refused (skipped). */
export interface RoleCounts {
  readonly given: number;
  readonly takenOff: number;
  readonly skipped: number;
}

/** What tells one role of the Link state from another: its name, who wants it, and the line its startup sweep logs. */
export interface LinkStateRoleSpec {
  readonly name: string;
  readonly wants: (member: LinkStateMember) => boolean;
  readonly startupLogLine: (counts: RoleCounts) => BaseMessageOptions;
}

/**
 * A role held or not held according to the Link: given to the Members who want it, taken off the ones who do not. Its
 * methods never throw: a failure is logged with the Member and changes nothing else.
 */
export interface LinkStateRole {
  /** Gives the Member the role; a Member not on the server is left alone. */
  give(memberId: MemberId): Promise<void>;
  /** Takes the role off the Member; a Member not on the server is left alone. */
  takeOff(memberId: MemberId): Promise<void>;
  /**
   * At startup: every non-bot Member on the server is brought to the state the Link records call for. One line with the
   * counts is logged when anything was given, taken off or skipped.
   */
  atStartup(): Promise<void>;
}

/** Builds the service of one role that follows the Link. */
export function createLinkStateRole(deps: LinkStateRoleDeps, spec: LinkStateRoleSpec): LinkStateRole {
  return {
    give: (memberId) => changeFor(deps, spec, memberId, giveNamedRole),
    takeOff: (memberId) => changeFor(deps, spec, memberId, takeOffNamedRole),
    atStartup: () => sweep(deps, spec),
  };
}

/** The change of one Member's role: a Member is looked up, the change made, and a skip logged. */
type Change = (
  guild: RolesGuild,
  member: RolesMember,
  name: string,
  officerRoleIds: readonly string[],
) => Promise<Skipped | undefined>;

async function changeFor(deps: LinkStateRoleDeps, spec: LinkStateRoleSpec, memberId: MemberId, change: Change): Promise<void> {
  try {
    const server = await deps.members.memberOf(memberId);
    if (server === undefined) return;
    await changeAndLog(deps, spec, memberId, server, change);
  } catch (error) {
    deps.logError(`Changing the ${spec.name} Role of ${memberId} failed: ${reasonOf(error)}`);
  }
}

/** Makes the change and logs a skip; returns the skip, or undefined when the change was made. */
async function changeAndLog(
  deps: LinkStateRoleDeps,
  spec: LinkStateRoleSpec,
  memberId: MemberId,
  server: ServerMember,
  change: Change,
): Promise<Skipped | undefined> {
  const skip = await change(server.guild, server.member, spec.name, deps.officerRoleIds);
  if (skip !== undefined) {
    deps.logError(`Changing the ${spec.name} Role of ${memberId} was skipped: ${skip.reason}`);
  }
  return skip;
}

/**
 * Lists every Member and brings each non-bot one to the state its Link calls for, then logs one line with the counts. A
 * failure to list stops the sweep, logged once; a failure for one Member is logged and the next one follows.
 */
async function sweep(deps: LinkStateRoleDeps, spec: LinkStateRoleSpec): Promise<void> {
  let servers: readonly ServerMember[];
  try {
    servers = await deps.members.all();
  } catch (error) {
    deps.logError(`Listing the Members for the ${spec.name} Role at startup failed: ${reasonOf(error)}`);
    return;
  }
  const counts = { given: 0, takenOff: 0, skipped: 0 };
  for (const server of servers) {
    if (server.member.bot) continue;
    const memberId = server.member.id;
    try {
      const holds = server.member.roles.some((role) => role.name === spec.name);
      const step = planRoleStep(holds, spec.wants({ bot: false, linked: deps.links.linkFor(memberId) !== undefined }));
      if (step === "give") {
        // Checked again just before the give: a Member whose Link changed after the listing must not get the role it no
        // longer wants.
        if (!spec.wants({ bot: false, linked: deps.links.linkFor(memberId) !== undefined })) continue;
        const skip = await changeAndLog(deps, spec, memberId, server, giveNamedRole);
        counts[skip === undefined ? "given" : "skipped"] += 1;
      } else if (step === "take-off") {
        const skip = await changeAndLog(deps, spec, memberId, server, takeOffNamedRole);
        counts[skip === undefined ? "takenOff" : "skipped"] += 1;
      }
    } catch (error) {
      deps.logError(`Changing the ${spec.name} Role of ${memberId} at startup failed: ${reasonOf(error)}`);
    }
  }
  await logCounts(deps, spec, counts);
}

/** Posts the summary line when anything was given, taken off or skipped. A refused line is logged; the sweep stands. */
async function logCounts(deps: LinkStateRoleDeps, spec: LinkStateRoleSpec, counts: RoleCounts): Promise<void> {
  if (counts.given + counts.takenOff + counts.skipped === 0) return;
  try {
    await deps.log(spec.startupLogLine(counts));
  } catch (error) {
    deps.logError(`Logging the ${spec.name} Role changes at startup failed: ${reasonOf(error)}`);
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
