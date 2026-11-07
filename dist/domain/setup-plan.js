import { tagOfAllianceRole } from "./managed-roles.js";
import { BOT_TARGET, EVERYONE_TARGET, expandLayout, ROLE_PERMISSION_BITS, } from "./server-layout.js";
/** Roles of the layout that may hold any permission without a finding: Moderator and King. */
const PERMISSION_ROLES = ["Moderator", "King"];
/** The variation selector that turns an emoji into its emoji presentation (U+FE0F). */
const VARIATION_SELECTOR = /\uFE0F/gu;
/** The state of a forum the plan creates: no tags, no reaction and no posts. */
const NO_FORUM_STATE = { tags: [], reaction: undefined, postsReadable: true, howTo: undefined, otherPinned: false };
/**
 * The steps and findings that make a server match the layout (data-model.md, Setup plan). Reads nothing but its arguments
 * and writes nothing. The `[TAG]` roles of the server give the Alliance areas.
 */
export function planSetup(layout, server, homeKingdom) {
    const allianceRoleNames = allianceRoleNamesOf(server);
    const expanded = expandLayout(layout, homeKingdom, allianceRoleNames);
    const plan = {
        server,
        missingExternalRoles: new Set(),
        roleSteps: [],
        categorySteps: [],
        channelSteps: [],
        topicSteps: [],
        descriptionSteps: [],
        forumSteps: [],
        findings: [],
        rolePermissions: layout.rolePermissions ?? {},
        claimed: new Set(),
    };
    planRoles(plan, expanded);
    planRolePermissions(plan, layout.rolePermissions ?? {});
    planCategories(plan, expanded, allianceRoleNames);
    for (const channel of server.channels) {
        if (!plan.claimed.has(channel.id))
            plan.findings.push({ kind: "outside-layout", name: channel.name });
    }
    return {
        steps: [
            ...plan.roleSteps,
            ...plan.categorySteps,
            ...plan.channelSteps,
            ...plan.topicSteps,
            ...plan.descriptionSteps,
            ...plan.forumSteps,
        ],
        findings: plan.findings,
    };
}
/** The names of the server's `[TAG]` roles, which give the Alliance areas. */
export function allianceRoleNamesOf(server) {
    return [...new Set(server.roles.map((role) => role.name).filter((name) => tagOfAllianceRole(name) !== undefined))];
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
/**
 * Each role permission a listed role lacks. Only missing ones are planned: nothing is removed, and a role not there yet lacks all.
 * A role at or above Neil's top role can't be edited by Neil, even as Administrator, so its missing permissions are left by hand.
 */
function planRolePermissions(plan, rolePermissions) {
    for (const [name, permissions] of Object.entries(rolePermissions)) {
        const found = lookup(plan.server.roles.filter((role) => role.name === name));
        if (found.kind === "many")
            continue;
        const held = found.kind === "one" ? (found.item.rolePermissions ?? []) : [];
        for (const permission of new Set(permissions)) {
            if (held.includes(permission))
                continue;
            if (found.kind === "one" && found.item.position >= plan.server.botTopPosition) {
                plan.findings.push({ kind: "permission-by-hand", name, permission });
            }
            else {
                plan.roleSteps.push({ kind: "allow-permission", name, permission });
            }
        }
    }
}
/** A listed role may hold the bits its rolePermissions grant; any other bit it holds is a finding, unless Moderator or King. */
function reviewRole(plan, role) {
    const granted = grantedBitsOf(plan.rolePermissions[role.name] ?? []);
    const beyond = role.permissions & ~granted;
    const exempt = PERMISSION_ROLES.includes(role.name);
    if (beyond !== 0n && !exempt)
        plan.findings.push({ kind: "role-has-permissions", name: role.name });
    if (role.position >= plan.server.botTopPosition)
        plan.findings.push({ kind: "role-above-neil", name: role.name });
}
function grantedBitsOf(permissions) {
    return permissions.reduce((bits, name) => bits | ROLE_PERMISSION_BITS[name], 0n);
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
    checkText(plan, existing, channel, categoryName);
    if (channel.forum !== undefined)
        planForumState(plan, channel.forum, channel.name, categoryName, existing.id, existing.forum);
}
/** The topic of a channel that exists, and Neil's description: posted when missing, edited when its text differs. */
function checkText(plan, existing, channel, categoryName) {
    if (channel.topic !== undefined && channel.topic !== existing.topic) {
        plan.topicSteps.push({ kind: "set-topic", id: existing.id, name: channel.name, topic: channel.topic });
    }
    if (channel.message === undefined)
        return;
    if (!existing.pinsReadable) {
        plan.findings.push({ kind: "descriptions-unread", name: channel.name });
        return;
    }
    if (existing.description === undefined) {
        plan.descriptionSteps.push({
            kind: "post-description",
            name: channel.name,
            categoryName,
            id: existing.id,
            content: channel.message,
            pinned: channel.type !== "voice",
        });
    }
    else if (existing.description.text !== channel.message) {
        plan.descriptionSteps.push({
            kind: "edit-description",
            id: existing.id,
            name: channel.name,
            messageId: existing.description.messageId,
            content: channel.message,
        });
    }
}
function createChannel(plan, channel, categoryName) {
    const overwrites = usable(plan, channel.overwrites);
    if (!plan.server.hasCommunity && channel.type === "announcement") {
        plan.channelSteps.push({
            kind: "create-channel",
            name: channel.name,
            categoryName,
            type: "text",
            overwrites,
            fallbackFrom: channel.type,
            topic: channel.topic,
        });
        plan.findings.push({ kind: "fallback-to-text", name: channel.name, from: channel.type });
    }
    else {
        plan.channelSteps.push({ kind: "create-channel", name: channel.name, categoryName, type: channel.type, overwrites, topic: channel.topic });
    }
    if (channel.message !== undefined) {
        plan.descriptionSteps.push({
            kind: "post-description",
            name: channel.name,
            categoryName,
            id: undefined,
            content: channel.message,
            pinned: channel.type !== "voice",
        });
    }
    if (channel.forum !== undefined)
        planForumState(plan, channel.forum, channel.name, categoryName, undefined, NO_FORUM_STATE);
}
/**
 * The steps that bring a forum's tags, reaction and how-to post in step with the layout (data-model.md, Steps). `id` is
 * undefined for a forum the plan creates. A forum whose state was not read gets no steps.
 */
function planForumState(plan, wanted, name, categoryName, id, state) {
    if (state === undefined)
        return;
    planForumTags(plan, wanted, name, categoryName, id, state);
    if (bareEmoji(state.reaction) !== bareEmoji(wanted.reaction)) {
        plan.forumSteps.push({ kind: "set-forum-reaction", id, name, categoryName, reaction: wanted.reaction });
    }
    planHowTo(plan, wanted, name, categoryName, id, state);
}
/** An emoji without its variation selector: the layout and Discord may each include U+FE0F or leave it out. */
function bareEmoji(emoji) {
    return emoji?.replace(VARIATION_SELECTOR, "");
}
/** Tag names are the same tag when they differ only in case (slice 030). */
function sameTagName(a, b) {
    return a.toLowerCase() === b.toLowerCase();
}
/**
 * Missing tags, and kept tags whose case differs from the layout's, give one step with the whole list: the layout's tags in
 * its order, with a kept tag taking the layout's spelling, then the new ones, then the extras, which stay.
 */
function planForumTags(plan, wanted, name, categoryName, id, state) {
    const missing = wanted.tags.filter((tag) => !state.tags.some((existing) => sameTagName(existing.name, tag)));
    const present = wanted.tags.flatMap((tag) => state.tags.filter((existing) => sameTagName(existing.name, tag)).map((existing) => ({ ...existing, name: tag })));
    const extras = state.tags.filter((existing) => !wanted.tags.some((tag) => sameTagName(existing.name, tag)));
    for (const extra of extras)
        plan.findings.push({ kind: "extra-tag", name, tag: extra.name });
    const renamed = present.some((kept) => state.tags.some((existing) => existing.id === kept.id && existing.name !== kept.name));
    if (missing.length === 0 && !renamed)
        return;
    const tags = [...present, ...missing.map((tag) => ({ name: tag })), ...extras];
    plan.forumSteps.push({ kind: "set-forum-tags", id, name, categoryName, tags });
}
/** Neil's how-to post: opened when missing, edited when its text differs, pinned when unpinned and no other post is. */
function planHowTo(plan, wanted, name, categoryName, id, state) {
    if (!state.postsReadable) {
        plan.findings.push({ kind: "forum-posts-unread", name });
        return;
    }
    const { title, content } = wanted.howTo;
    const howTo = state.howTo;
    if (state.otherPinned && (howTo === undefined || !howTo.pinned))
        plan.findings.push({ kind: "other-post-pinned", name });
    if (howTo === undefined) {
        plan.forumSteps.push({ kind: "open-how-to", id, name, categoryName, title, content, pin: !state.otherPinned });
        return;
    }
    if (howTo.title !== title || howTo.content !== content) {
        plan.forumSteps.push({ kind: "edit-how-to", threadId: howTo.threadId, name, title, content, unarchive: howTo.archived });
    }
    if (!howTo.pinned && !state.otherPinned)
        plan.forumSteps.push({ kind: "pin-how-to", threadId: howTo.threadId, name, unarchive: howTo.archived });
}
/** Without Community an announcement channel is planned as text, so an existing text channel stands for it. Forums need no Community. */
function typeMatches(actual, expected, hasCommunity) {
    if (actual === expected)
        return true;
    return !hasCommunity && actual === "text" && expected === "announcement";
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