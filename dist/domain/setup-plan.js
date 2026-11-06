import { tagOfAllianceRole } from "./managed-roles.js";
import { BOT_TARGET, EVERYONE_TARGET, expandLayout, } from "./server-layout.js";
/** Roles of the layout that may hold permissions without a finding: Moderator and King. */
const PERMISSION_ROLES = ["Moderator", "King"];
/**
 * The steps and findings that make a server match the layout (data-model.md, Setup plan). Reads nothing but its arguments
 * and writes nothing. The `[TAG]` roles of the server give the Alliance areas.
 */
export function planSetup(layout, server, homeKingdom) {
    const allianceRoleNames = [...new Set(server.roles.map((role) => role.name).filter((name) => tagOfAllianceRole(name) !== undefined))];
    const expanded = expandLayout(layout, homeKingdom, allianceRoleNames);
    const plan = {
        server,
        missingExternalRoles: new Set(),
        roleSteps: [],
        categorySteps: [],
        channelSteps: [],
        findings: [],
        claimed: new Set(),
    };
    planRoles(plan, expanded);
    planCategories(plan, expanded, allianceRoleNames);
    for (const channel of server.channels) {
        if (!plan.claimed.has(channel.id))
            plan.findings.push({ kind: "outside-layout", name: channel.name });
    }
    return {
        steps: [...plan.roleSteps, ...plan.categorySteps, ...plan.channelSteps],
        findings: plan.findings,
    };
}
function lookup(items) {
    const [first, second] = items;
    if (first === undefined)
        return { kind: "none" };
    if (second !== undefined)
        return { kind: "many", items };
    return { kind: "one", item: first };
}
function planRoles(plan, layout) {
    for (const name of layout.roles) {
        const found = lookup(plan.server.roles.filter((role) => role.name === name));
        if (found.kind === "none")
            plan.roleSteps.push({ kind: "create-role", name });
        else if (found.kind === "many")
            plan.findings.push({ kind: "duplicate-name", name });
        else
            reviewRole(plan, found.item);
    }
    for (const name of layout.externalRoles) {
        const found = lookup(plan.server.roles.filter((role) => role.name === name));
        if (found.kind === "none") {
            plan.missingExternalRoles.add(name);
            plan.findings.push({ kind: "external-role-missing", name });
        }
        else if (found.kind === "many")
            plan.findings.push({ kind: "duplicate-name", name });
    }
}
function reviewRole(plan, role) {
    if (role.hasPermissions && !PERMISSION_ROLES.includes(role.name))
        plan.findings.push({ kind: "role-has-permissions", name: role.name });
    if (role.position >= plan.server.botTopPosition)
        plan.findings.push({ kind: "role-above-neil", name: role.name });
}
function planCategories(plan, layout, allianceRoleNames) {
    for (const category of layout.categories) {
        const isAlliance = allianceRoleNames.includes(category.name);
        const found = lookup(plan.server.channels.filter((channel) => channel.kind === "category" && channel.name === category.name));
        if (found.kind === "none") {
            plan.categorySteps.push({ kind: "create-category", name: category.name, overwrites: usable(plan, category.overwrites) });
            for (const channel of category.channels)
                planChannel(plan, channel, category.name, undefined, isAlliance);
        }
        else if (found.kind === "many") {
            plan.findings.push({ kind: "duplicate-name", name: category.name });
            claimWithChildren(plan, found.items);
        }
        else {
            plan.claimed.add(found.item.id);
            checkOverwrites(plan, found.item, usable(plan, category.overwrites), plan.categorySteps);
            for (const channel of category.channels)
                planChannel(plan, channel, category.name, found.item.id, isAlliance);
        }
    }
}
/** Duplicated categories are left alone: they and their channels count as in the layout, but nothing is planned for them. */
function claimWithChildren(plan, categories) {
    for (const category of categories) {
        plan.claimed.add(category.id);
        for (const child of plan.server.channels) {
            if (child.parentId === category.id)
                plan.claimed.add(child.id);
        }
    }
}
function planChannel(plan, channel, categoryName, categoryId, isAlliance) {
    const named = plan.server.channels.filter((candidate) => candidate.kind !== "category" && candidate.name === channel.name);
    const inCategory = categoryId === undefined ? [] : named.filter((candidate) => candidate.parentId === categoryId);
    const elsewhere = inCategory.length === 0;
    const found = !elsewhere ? lookup(inCategory) : isAlliance ? { kind: "none" } : lookup(named);
    if (found.kind === "none") {
        createChannel(plan, channel, categoryName);
        return;
    }
    if (found.kind === "many") {
        plan.findings.push({ kind: "duplicate-name", name: channel.name });
        for (const candidate of found.items)
            plan.claimed.add(candidate.id);
        return;
    }
    const existing = found.item;
    plan.claimed.add(existing.id);
    if (elsewhere) {
        plan.findings.push({ kind: "other-category", name: channel.name, categoryName: categoryNameOf(plan.server, existing.parentId) });
    }
    if (!typeMatches(existing.kind, channel.type, plan.server.hasCommunity)) {
        plan.findings.push({ kind: "wrong-type", name: channel.name, expected: channel.type, actual: existing.kind });
        return;
    }
    checkOverwrites(plan, existing, usable(plan, channel.overwrites), plan.channelSteps);
}
function createChannel(plan, channel, categoryName) {
    const overwrites = usable(plan, channel.overwrites);
    if (!plan.server.hasCommunity && (channel.type === "forum" || channel.type === "announcement")) {
        plan.channelSteps.push({
            kind: "create-channel",
            name: channel.name,
            categoryName,
            type: "text",
            overwrites,
            fallbackFrom: channel.type,
        });
        plan.findings.push({ kind: "fallback-to-text", name: channel.name, from: channel.type });
        return;
    }
    plan.channelSteps.push({ kind: "create-channel", name: channel.name, categoryName, type: channel.type, overwrites });
}
/** Without Community a forum or an announcement channel is planned as text, so an existing text channel stands for it. */
function typeMatches(actual, expected, hasCommunity) {
    if (actual === expected)
        return true;
    return !hasCommunity && actual === "text" && (expected === "forum" || expected === "announcement");
}
/**
 * Compares the wanted overwrites with those of an existing channel or category. Named permissions missing from the
 * server give a correction listing the whole wanted overwrite of each such target; other permissions and extra
 * overwrites are only reported.
 */
function checkOverwrites(plan, existing, wanted, steps) {
    const { server } = plan;
    const wantedIds = new Set(wanted.map((overwrite) => targetIdOf(server, overwrite.target)));
    for (const overwrite of existing.overwrites) {
        if (!wantedIds.has(overwrite.targetId)) {
            plan.findings.push({ kind: "extra-overwrite", name: existing.name, target: describeTarget(server, overwrite.targetId) });
        }
    }
    const hidesFromEveryone = wantsHiddenFromEveryone(wanted) && !isHiddenFromEveryone(server, existing);
    if (hidesFromEveryone)
        plan.findings.push({ kind: "hides-from-everyone", name: existing.name });
    const missing = wanted.filter((overwrite) => isMissing(server, existing, overwrite));
    if (missing.length > 0) {
        steps.push({ kind: "correct-overwrites", id: existing.id, name: existing.name, hidesFromEveryone, overwrites: missing });
    }
}
function isMissing(server, existing, wanted) {
    const id = targetIdOf(server, wanted.target);
    const current = existing.overwrites.find((overwrite) => overwrite.targetId === id);
    return (wanted.allow.some((permission) => !(current?.allow.includes(permission) ?? false)) ||
        wanted.deny.some((permission) => !(current?.deny.includes(permission) ?? false)));
}
function wantsHiddenFromEveryone(wanted) {
    return wanted.some((overwrite) => overwrite.target === EVERYONE_TARGET && overwrite.deny.includes("ViewChannel"));
}
function isHiddenFromEveryone(server, existing) {
    return existing.overwrites.some((overwrite) => overwrite.targetId === server.everyoneId && overwrite.deny.includes("ViewChannel"));
}
/** Drops the wanted overwrites of external roles the server lacks: they cannot be written, and the finding says so. */
function usable(plan, overwrites) {
    return overwrites.filter((overwrite) => !plan.missingExternalRoles.has(overwrite.target));
}
/** The server id of a wanted target; undefined when no single role of that name exists (yet). */
function targetIdOf(server, target) {
    if (target === EVERYONE_TARGET)
        return server.everyoneId;
    if (target === BOT_TARGET)
        return server.botUserId;
    const found = lookup(server.roles.filter((role) => role.name === target));
    return found.kind === "one" ? found.item.id : undefined;
}
function describeTarget(server, id) {
    if (id === server.everyoneId)
        return EVERYONE_TARGET;
    if (id === server.botUserId)
        return BOT_TARGET;
    return server.roles.find((role) => role.id === id)?.name ?? id;
}
function categoryNameOf(server, parentId) {
    if (parentId === undefined)
        return undefined;
    return server.channels.find((channel) => channel.id === parentId)?.name;
}
//# sourceMappingURL=setup-plan.js.map