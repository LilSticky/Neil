import { planRoleStep } from "../domain/link-state-role.js";
import { giveNamedRole, takeOffNamedRole, } from "./member-roles.js";
/** Builds the service of one role that follows the Link. */
export function createLinkStateRole(deps, spec) {
    return {
        give: (memberId) => changeFor(deps, spec, memberId, giveNamedRole),
        takeOff: (memberId) => changeFor(deps, spec, memberId, takeOffNamedRole),
        atStartup: () => sweep(deps, spec),
    };
}
async function changeFor(deps, spec, memberId, change) {
    try {
        const server = await deps.members.memberOf(memberId);
        if (server === undefined)
            return;
        const skip = await changeAndLog(deps, spec, memberId, server, change);
        if (skip !== undefined)
            await postSkip(deps, spec, memberId, skip);
    }
    catch (error) {
        deps.logError(`Changing the ${spec.name} Role of ${memberId} failed: ${reasonOf(error)}`);
    }
}
/** Posts the skip of a change made outside the startup sweep. A refused line is logged; the change stands. */
async function postSkip(deps, spec, memberId, skip) {
    try {
        await deps.log(spec.skippedLogLine(memberId, skip.reason));
    }
    catch (error) {
        deps.logError(`Logging the ${spec.name} Role skip of ${memberId} failed: ${reasonOf(error)}`);
    }
}
/** Makes the change and logs a skip; returns the skip, or undefined when the change was made. */
async function changeAndLog(deps, spec, memberId, server, change) {
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
async function sweep(deps, spec) {
    let servers;
    try {
        servers = await deps.members.all();
    }
    catch (error) {
        deps.logError(`Listing the Members for the ${spec.name} Role at startup failed: ${reasonOf(error)}`);
        return;
    }
    const counts = { given: 0, takenOff: 0, skipped: 0 };
    for (const server of servers) {
        if (server.member.bot)
            continue;
        const memberId = server.member.id;
        try {
            const holds = server.member.roles.some((role) => role.name === spec.name && !deps.officerRoleIds.includes(role.id));
            const step = planRoleStep(holds, spec.wants({ bot: false, linked: deps.links.linkFor(memberId) !== undefined }));
            if (step === "give") {
                // Checked again just before the give: a Member whose Link changed after the listing must not get the role it no
                // longer wants.
                if (!spec.wants({ bot: false, linked: deps.links.linkFor(memberId) !== undefined }))
                    continue;
                const skip = await changeAndLog(deps, spec, memberId, server, giveNamedRole);
                counts[skip === undefined ? "given" : "skipped"] += 1;
            }
            else if (step === "take-off") {
                const skip = await changeAndLog(deps, spec, memberId, server, takeOffNamedRole);
                counts[skip === undefined ? "takenOff" : "skipped"] += 1;
            }
        }
        catch (error) {
            deps.logError(`Changing the ${spec.name} Role of ${memberId} at startup failed: ${reasonOf(error)}`);
        }
    }
    await logCounts(deps, spec, counts);
}
/** Posts the summary line when anything was given, taken off or skipped. A refused line is logged; the sweep stands. */
async function logCounts(deps, spec, counts) {
    if (counts.given + counts.takenOff + counts.skipped === 0)
        return;
    try {
        await deps.log(spec.startupLogLine(counts));
    }
    catch (error) {
        deps.logError(`Logging the ${spec.name} Role changes at startup failed: ${reasonOf(error)}`);
    }
}
function reasonOf(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=link-state-role.js.map