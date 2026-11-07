import { planRoleStep } from "./link-state-role.js";
/** The name of the Onboarding Role: a role with no permissions, given to a Member who is not Linked. */
export const ONBOARDING_ROLE_NAME = "Onboarding";
/**
 * A Member wants the Onboarding Role when they are not a bot, and either not Linked or still in an open Interview thread: a
 * Link alone does not take it off, the thread closing does.
 */
export function wantsOnboardingRole(member) {
    return !member.bot && (!member.linked || member.threadOpen);
}
/** The step that makes a Member's holding of the Onboarding Role match what they want; the rule is planRoleStep's. */
export function planOnboardingRole(holds, wants) {
    return planRoleStep(holds, wants);
}
//# sourceMappingURL=onboarding-role.js.map