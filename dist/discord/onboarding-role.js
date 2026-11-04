import { ONBOARDING_ROLE_NAME, planOnboardingRole } from "../domain/onboarding-role.js";
import { giveNamedRole, takeOffNamedRole } from "./member-roles.js";
import { onboardingRoleStartupLogLine } from "./onboarding-role-texts.js";
/** Builds the Onboarding Role service. */
export function createOnboardingRole(deps) {
    return {
        give: (memberId) => changeFor(deps, memberId, giveNamedRole),
        takeOff: (memberId) => changeFor(deps, memberId, takeOffNamedRole),
        atStartup: () => sweep(deps),
    };
}
async function changeFor(deps, memberId, change) {
    try {
        const server = await deps.members.memberOf(memberId);
        if (server === undefined)
            return;
        await changeAndLog(deps, memberId, server, change);
    }
    catch (error) {
        deps.logError(`Changing the ${ONBOARDING_ROLE_NAME} Role of ${memberId} failed: ${reasonOf(error)}`);
    }
}
/** Makes the change and logs a skip; returns the skip, or undefined when the change was made. */
async function changeAndLog(deps, memberId, server, change) {
    const skip = await change(server.guild, server.member, ONBOARDING_ROLE_NAME);
    if (skip !== undefined) {
        deps.logError(`Changing the ${ONBOARDING_ROLE_NAME} Role of ${memberId} was skipped: ${skip.reason}`);
    }
    return skip;
}
/**
 * Lists every Member and brings each non-bot one to the state its Link calls for, then logs one line with the counts. A
 * failure to list stops the sweep, logged once; a failure for one Member is logged and the next one follows.
 */
async function sweep(deps) {
    let servers;
    try {
        servers = await deps.members.all();
    }
    catch (error) {
        deps.logError(`Listing the Members for the ${ONBOARDING_ROLE_NAME} Role at startup failed: ${reasonOf(error)}`);
        return;
    }
    const counts = { given: 0, takenOff: 0, skipped: 0 };
    for (const server of servers) {
        if (server.member.bot)
            continue;
        const memberId = server.member.id;
        try {
            const holds = server.member.roles.some((role) => role.name === ONBOARDING_ROLE_NAME);
            const step = planOnboardingRole(holds, deps.links.linkFor(memberId) === undefined);
            if (step === "give") {
                // Checked again just before the give: a Member who Linked after the listing must not be given the role.
                if (deps.links.linkFor(memberId) !== undefined)
                    continue;
                const skip = await changeAndLog(deps, memberId, server, giveNamedRole);
                counts[skip === undefined ? "given" : "skipped"] += 1;
            }
            else if (step === "take-off") {
                const skip = await changeAndLog(deps, memberId, server, takeOffNamedRole);
                counts[skip === undefined ? "takenOff" : "skipped"] += 1;
            }
        }
        catch (error) {
            deps.logError(`Changing the ${ONBOARDING_ROLE_NAME} Role of ${memberId} at startup failed: ${reasonOf(error)}`);
        }
    }
    await logCounts(deps, counts);
}
/** Posts the summary line when anything was given, taken off or skipped. A refused line is logged; the sweep stands. */
async function logCounts(deps, counts) {
    if (counts.given + counts.takenOff + counts.skipped === 0)
        return;
    try {
        await deps.log(onboardingRoleStartupLogLine(counts));
    }
    catch (error) {
        deps.logError(`Logging the ${ONBOARDING_ROLE_NAME} Role changes at startup failed: ${reasonOf(error)}`);
    }
}
function reasonOf(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=onboarding-role.js.map