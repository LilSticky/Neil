import { nicknameFor } from "../domain/member-name.js";
import { rolesFor } from "../domain/managed-roles.js";
import { applyNameAndRoles, } from "./member-roles.js";
import { nameAndRolesLeftLogLine, nameAndRolesLogLine, nameAndRolesNotAppliedLogLine, nameAndRolesQuotaLogLine, RANK_CHECK_NOTE, } from "./name-and-roles-texts.js";
/** Builds the name and roles service. Its methods never throw: a failure is logged with the Member and changes nothing else. */
export function createNameAndRoles(deps) {
    return {
        onLinked: (memberId, player, rank) => guarded(deps, memberId, () => applyToMember(deps, memberId, player, rank)),
        onRankApproved: (memberId) => guarded(deps, memberId, () => approveRank(deps, memberId)),
        atStartup: () => startUp(deps),
        syncMember: (memberId, player, rank, server) => syncGuarded(deps, memberId, player, rank, server),
    };
}
function reasonOf(error) {
    return error instanceof Error ? error.message : String(error);
}
async function guarded(deps, memberId, work) {
    try {
        await work();
    }
    catch (error) {
        deps.logError(`Giving ${memberId} their name and roles failed: ${reasonOf(error)}`);
    }
}
async function syncGuarded(deps, memberId, player, rank, server) {
    try {
        return await syncTo(deps, memberId, player, rank, server);
    }
    catch (error) {
        deps.logError(`Syncing ${memberId}'s name and roles failed: ${reasonOf(error)}`);
        return false;
    }
}
/**
 * Looks up each Linked Member without a complete apply, in the order of their Links. A Member not on the server is
 * skipped with no lookup; a failure for one Member is logged and the next one follows; a quota stop ends the run and
 * the rest wait for the next start. Never throws.
 */
async function startUp(deps) {
    try {
        const pending = deps.applied.linkedWithoutCompleteApply();
        for (const [index, link] of pending.entries()) {
            try {
                const server = await deps.members.memberOf(link.memberId);
                if (server === undefined)
                    continue;
                const result = await deps.gameApi.getPlayer(link.uid, "lookup");
                if (result.kind === "quota-spent" || result.kind === "reserve-kept") {
                    // The Member stopped at is still to do, so it counts as left.
                    await deps.log(nameAndRolesLeftLogLine(pending.length - index));
                    return;
                }
                if (result.kind !== "found") {
                    await deps.log(nameAndRolesNotAppliedLogLine(link.memberId));
                    continue;
                }
                await applyTo(deps, link.memberId, server, result.value, link.allianceRank);
            }
            catch (error) {
                deps.logError(`Giving ${link.memberId} their name and roles at startup failed: ${reasonOf(error)}`);
            }
        }
    }
    catch (error) {
        deps.logError(`Giving the Linked Members their name and roles at startup failed: ${reasonOf(error)}`);
    }
}
/** Applies the name and roles to a Member when they are on the server; a Member who is not on it is left alone. */
async function applyToMember(deps, memberId, player, rank) {
    const server = await deps.members.memberOf(memberId);
    if (server === undefined)
        return;
    await applyTo(deps, memberId, server, player, rank);
}
/**
 * Checks the Member is on the server, then looks the Player up with the rank of the Link, then applies the name and
 * roles. A Member not on the server is left alone with no lookup; a quota stop and a missing Player are each logged.
 */
async function approveRank(deps, memberId) {
    const link = deps.links.linkFor(memberId);
    if (link === undefined)
        return;
    const server = await deps.members.memberOf(memberId);
    if (server === undefined)
        return;
    const result = await deps.gameApi.getPlayer(link.uid, "lookup");
    if (result.kind === "quota-spent" || result.kind === "reserve-kept") {
        await deps.log(nameAndRolesQuotaLogLine(memberId));
        return;
    }
    if (result.kind !== "found") {
        await deps.log(nameAndRolesNotAppliedLogLine(memberId));
        return;
    }
    await applyTo(deps, memberId, server, result.value, link.allianceRank);
}
/**
 * The Daily Sync's apply: the nickname is set whatever it was, the Managed Roles are made to match, and the Applied State
 * and the rank are recorded. A change, a restored nickname included, logs one line; false when the Member is not on the
 * server.
 */
async function syncTo(deps, memberId, player, rank, fetched) {
    const server = fetched ?? (await deps.members.memberOf(memberId));
    if (server === undefined)
        return false;
    const previous = deps.applied.get(memberId);
    const nickname = nicknameFor(player, rank, deps.homeKingdom);
    const roles = rolesFor(player, rank, deps.homeKingdom, deps.troopBracketLevels);
    // The nickname on the server before the apply: the Member may have changed it by hand since the last apply.
    const currentNickname = server.member.nickname;
    const report = await applyNameAndRoles(server.guild, server.member, {
        nickname,
        roles,
        managedTags: [...(previous?.roles ?? []), ...roles],
        officerRoleIds: deps.officerRoleIds,
    });
    deps.applied.record(appliedStateOf(memberId, nickname, previous, roles, report, deps.now(), allianceRefOf(player)));
    deps.links.updateRank(memberId, rank);
    const nicknameChanged = report.nickname === "set" && currentNickname !== nickname;
    // The owner's nickname skip is the same on every run and never a change, so it is not logged.
    const otherSkips = report.skipped.filter((skip) => !isOwnerNicknameSkip(skip));
    if (!nicknameChanged && !rolesChanged(report) && otherSkips.length === 0)
        return false;
    const note = rank.source === "unknown" && player.alliance !== undefined ? RANK_CHECK_NOTE : undefined;
    await deps.log(nameAndRolesLogLine(memberId, report, nickname ?? "", note));
    return true;
}
/** Makes the Member match the Player: records the applied state, and logs one line when anything changed. */
async function applyTo(deps, memberId, server, player, rank) {
    const previous = deps.applied.get(memberId);
    const nickname = nicknameFor(player, rank, deps.homeKingdom);
    const roles = rolesFor(player, rank, deps.homeKingdom, deps.troopBracketLevels);
    // Alliance tags Neil applied before are managed too, so an Alliance or rank it no longer gives is taken off.
    const managedTags = [...(previous?.roles ?? []), ...roles];
    const report = await applyNameAndRoles(server.guild, server.member, {
        nickname,
        roles,
        managedTags,
        officerRoleIds: deps.officerRoleIds,
    });
    deps.applied.record(appliedStateOf(memberId, nickname, previous, roles, report, deps.now(), allianceRefOf(player)));
    if (!hasChange(report, previous, nickname))
        return;
    await deps.log(nameAndRolesLogLine(memberId, report, nickname ?? ""));
}
function appliedStateOf(memberId, nickname, previous, roles, report, appliedAt, alliance) {
    return {
        memberId,
        // An untouched nickname stays as it was on the server: the one applied before, if any.
        nickname: nickname ?? previous?.nickname ?? "",
        roles,
        appliedAt,
        complete: report.skipped.every(isOwnerNicknameSkip),
        alliance,
    };
}
/** The Alliance the Player is in, by Kingdom and tag; undefined in no Alliance. */
function allianceRefOf(player) {
    return player.alliance === undefined ? undefined : { kingdom: player.kingdom, tag: player.alliance.tag };
}
/** Whether the apply created, added or removed a role. */
function rolesChanged(report) {
    return report.added.length + report.removed.length + report.created.length > 0;
}
/** The owner's nickname can never be set by Neil, so its skip is final: the apply is complete without it. */
function isOwnerNicknameSkip(skip) {
    return skip.what === "nickname" && skip.reason === "owner";
}
/** Whether the apply changed anything worth a log line: a new nickname, a role changed or created, or a skipped step. */
function hasChange(report, previous, nickname) {
    const nicknameChanged = report.nickname === "set" && previous?.nickname !== nickname;
    return nicknameChanged || rolesChanged(report) || report.skipped.length > 0;
}
//# sourceMappingURL=name-and-roles.js.map