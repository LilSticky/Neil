import { planRoleStep, type RoleStep } from "./link-state-role.js";

/** The name of the Onboarding Role: a role with no permissions, given to a Member who is not Linked. */
export const ONBOARDING_ROLE_NAME = "Onboarding";

/** What to do with the Onboarding Role for a Member: give it, take it off, or leave it as it is. */
export type OnboardingRoleStep = RoleStep;

/** A Member wants the Onboarding Role when they are not a bot and not Linked. */
export function wantsOnboardingRole(member: { readonly bot: boolean; readonly linked: boolean }): boolean {
  return !member.bot && !member.linked;
}

/** The step that makes a Member's holding of the Onboarding Role match what they want; the rule is planRoleStep's. */
export function planOnboardingRole(holds: boolean, wants: boolean): OnboardingRoleStep {
  return planRoleStep(holds, wants);
}
