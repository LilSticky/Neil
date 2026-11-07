import { ONBOARDING_ROLE_NAME, wantsOnboardingRole } from "../domain/onboarding-role.js";
import type { MemberId, RankApproval } from "../domain/rank-approval.js";
import type { PreferenceStore } from "../storage/preference-store.js";
import { createLinkStateRole, type LinkStateRole, type LinkStateRoleDeps, type LinkStateRoleLinks } from "./link-state-role.js";
import { onboardingRoleSkippedLogLine, onboardingRoleStartupLogLine } from "./onboarding-role-texts.js";

/** The Links the Onboarding Role reads: a Linked Member, and a pending Rank Approval, which keeps their thread open. */
export interface OnboardingRoleLinks extends LinkStateRoleLinks {
  pendingFor(memberId: MemberId): Pick<RankApproval, "state"> | undefined;
}

/** What the Onboarding Role needs: the Links, the Preferences messages that keep a thread open, and the link-state deps. */
export interface OnboardingRoleDeps extends Omit<LinkStateRoleDeps, "links"> {
  readonly links: OnboardingRoleLinks;
  /** Read only: an open Preferences message keeps the Member's Interview thread open. */
  readonly preferences: Pick<PreferenceStore, "prompt">;
}

/**
 * The Onboarding Role: given to a Member who is not Linked, kept on a Linked Member while their Interview thread is open,
 * and taken off the rest. Its methods never throw: a failure is logged with the Member and changes nothing else.
 */
export type OnboardingRole = LinkStateRole;

/** Builds the Onboarding Role service. */
export function createOnboardingRole(deps: OnboardingRoleDeps): OnboardingRole {
  return createLinkStateRole(deps, {
    name: ONBOARDING_ROLE_NAME,
    wants: wantsOnboardingRole,
    threadOpen: (memberId) =>
      deps.preferences.prompt(memberId) !== undefined || deps.links.pendingFor(memberId) !== undefined,
    startupLogLine: onboardingRoleStartupLogLine,
    skippedLogLine: onboardingRoleSkippedLogLine,
  });
}
