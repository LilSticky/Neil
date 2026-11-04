/** The name of the Onboarding Role: a role with no permissions, given to a Member who is not Linked. */
export const ONBOARDING_ROLE_NAME = "Onboarding";
/** A Member wants the Onboarding Role when they are not a bot and not Linked. */
export function wantsOnboardingRole(member) {
    return !member.bot && !member.linked;
}
/** The step that makes a Member's holding of the Onboarding Role match what they want. */
export function planOnboardingRole(holds, wants) {
    if (wants && !holds)
        return "give";
    if (holds && !wants)
        return "take-off";
    return "keep";
}
//# sourceMappingURL=onboarding-role.js.map