import { ONBOARDING_ROLE_NAME, wantsOnboardingRole } from "../domain/onboarding-role.js";
import { createLinkStateRole, type LinkStateRole, type LinkStateRoleDeps, type LinkStateRoleLinks } from "./link-state-role.js";
import { onboardingRoleSkippedLogLine, onboardingRoleStartupLogLine } from "./onboarding-role-texts.js";

/** The Links the Onboarding Role reads. */
export type OnboardingRoleLinks = LinkStateRoleLinks;

export type OnboardingRoleDeps = LinkStateRoleDeps;

/**
 * The Onboarding Role: given to a Member who is not Linked, taken off a Member who is. Its methods never throw: a failure
 * is logged with the Member and changes nothing else.
 */
export type OnboardingRole = LinkStateRole;

/** Builds the Onboarding Role service. */
export function createOnboardingRole(deps: OnboardingRoleDeps): OnboardingRole {
  return createLinkStateRole(deps, {
    name: ONBOARDING_ROLE_NAME,
    wants: wantsOnboardingRole,
    startupLogLine: onboardingRoleStartupLogLine,
    skippedLogLine: onboardingRoleSkippedLogLine,
  });
}
