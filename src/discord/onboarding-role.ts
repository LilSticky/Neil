import type { Link } from "../domain/link.js";
import { ONBOARDING_ROLE_NAME, planOnboardingRole, wantsOnboardingRole } from "../domain/onboarding-role.js";
import type { MemberId } from "../domain/rank-approval.js";
import { giveNamedRole, takeOffNamedRole, type RolesGuild, type RolesMember, type Skipped } from "./member-roles.js";
import type { ServerMember, ServerMembers } from "./name-and-roles.js";

/** The Links the service reads: a Member is Linked when a Link is recorded for them. */
export interface OnboardingRoleLinks {
  linkFor(memberId: MemberId): Link | undefined;
}

export interface OnboardingRoleDeps {
  readonly members: ServerMembers;
  readonly links: OnboardingRoleLinks;
  readonly logError: (line: string) => void;
}

/**
 * The Onboarding Role: given to a Member who is not Linked, taken off a Member who is. Its methods never throw: a failure
 * is logged with the Member and changes nothing else.
 */
export interface OnboardingRole {
  /** Gives the Member the Onboarding Role; a Member not on the server is left alone. */
  give(memberId: MemberId): Promise<void>;
  /** Takes the Onboarding Role off the Member; a Member not on the server is left alone. */
  takeOff(memberId: MemberId): Promise<void>;
  /** At startup: every non-bot Member on the server is brought to the state the Link records call for. */
  atStartup(): Promise<void>;
}

/** Builds the Onboarding Role service. */
export function createOnboardingRole(deps: OnboardingRoleDeps): OnboardingRole {
  return {
    give: (memberId) => changeFor(deps, memberId, giveNamedRole),
    takeOff: (memberId) => changeFor(deps, memberId, takeOffNamedRole),
    atStartup: () => sweep(deps),
  };
}

/** The change of one Member's Onboarding Role: a Member is looked up, the change made, and a skip logged. */
type Change = (guild: RolesGuild, member: RolesMember, name: string) => Promise<Skipped | undefined>;

async function changeFor(deps: OnboardingRoleDeps, memberId: MemberId, change: Change): Promise<void> {
  try {
    const server = await deps.members.memberOf(memberId);
    if (server === undefined) return;
    await changeAndLog(deps, memberId, server, change);
  } catch (error) {
    deps.logError(`Changing the ${ONBOARDING_ROLE_NAME} Role of ${memberId} failed: ${reasonOf(error)}`);
  }
}

async function changeAndLog(deps: OnboardingRoleDeps, memberId: MemberId, server: ServerMember, change: Change): Promise<void> {
  const skip = await change(server.guild, server.member, ONBOARDING_ROLE_NAME);
  if (skip !== undefined) {
    deps.logError(`Changing the ${ONBOARDING_ROLE_NAME} Role of ${memberId} was skipped: ${skip.reason}`);
  }
}

/**
 * Lists every Member and brings each non-bot one to the state its Link calls for. A failure to list stops the sweep,
 * logged once; a failure for one Member is logged and the next one follows.
 */
async function sweep(deps: OnboardingRoleDeps): Promise<void> {
  let servers: readonly ServerMember[];
  try {
    servers = await deps.members.all();
  } catch (error) {
    deps.logError(`Listing the Members for the ${ONBOARDING_ROLE_NAME} Role at startup failed: ${reasonOf(error)}`);
    return;
  }
  for (const server of servers) {
    const memberId = server.member.id;
    if (server.member.bot) continue;
    try {
      const holds = server.member.roles.some((role) => role.name === ONBOARDING_ROLE_NAME);
      const linked = deps.links.linkFor(memberId) !== undefined;
      const wants = wantsOnboardingRole({ bot: server.member.bot, linked });
      const step = planOnboardingRole(holds, wants);
      if (step === "give") await changeAndLog(deps, memberId, server, giveNamedRole);
      if (step === "take-off") await changeAndLog(deps, memberId, server, takeOffNamedRole);
    } catch (error) {
      deps.logError(`Changing the ${ONBOARDING_ROLE_NAME} Role of ${memberId} at startup failed: ${reasonOf(error)}`);
    }
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
