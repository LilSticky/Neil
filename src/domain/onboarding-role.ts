/** The name of the Onboarding Role: a role with no permissions, given to a Member who is not Linked. */
export const ONBOARDING_ROLE_NAME = "Onboarding";

/** What to do with the Onboarding Role for a Member: give it, take it off, or leave it as it is. */
export type OnboardingRoleStep = "give" | "take-off" | "keep";

/** A Member wants the Onboarding Role when they are not a bot and not Linked. */
export function wantsOnboardingRole(member: { readonly bot: boolean; readonly linked: boolean }): boolean {
  return !member.bot && !member.linked;
}

/** The step that makes a Member's holding of the Onboarding Role match what they want. */
export function planOnboardingRole(holds: boolean, wants: boolean): OnboardingRoleStep {
  if (wants && !holds) return "give";
  if (holds && !wants) return "take-off";
  return "keep";
}
