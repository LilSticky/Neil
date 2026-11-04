import { ONBOARDING_ROLE_NAME, wantsOnboardingRole } from "../domain/onboarding-role.js";
import { createLinkStateRole } from "./link-state-role.js";
import { onboardingRoleSkippedLogLine, onboardingRoleStartupLogLine } from "./onboarding-role-texts.js";
/** Builds the Onboarding Role service. */
export function createOnboardingRole(deps) {
    return createLinkStateRole(deps, {
        name: ONBOARDING_ROLE_NAME,
        wants: wantsOnboardingRole,
        startupLogLine: onboardingRoleStartupLogLine,
        skippedLogLine: onboardingRoleSkippedLogLine,
    });
}
//# sourceMappingURL=onboarding-role.js.map