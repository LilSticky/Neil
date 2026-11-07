import { describeChannel } from "./channel-description.js";
import { tagOfAllianceRole } from "./managed-roles.js";
export const EVERYONE_TARGET = "@everyone";
export const BOT_TARGET = "Neil";
const KINGDOM_PLACEHOLDER = "#<Home Kingdom>";
const KING_ROLE = "King";
const TRANSLATION_BOT_ROLE = "Interaction Bot";
const LANGUAGES_CATEGORY = "Languages";
/** The description of a translated copy: the original's text, then the credit to the translation bot (slice 029). */
export function translatedDescription(description, language) {
    return `${description} Translated into ${language} by ${TRANSLATION_BOT_ROLE}.`;
}
const VIEW = "ViewChannel";
const SEND = "SendMessages";
const POSTING = ["SendMessages", "SendMessagesInThreads", "CreatePublicThreads", "CreatePrivateThreads"];
/**
 * The wanted overwrites of a layout, with placeholders replaced, categories and channels expanded (data-model.md, Expansion).
 * A channel's overwrites are its category's, with the channel's own on top, own winning per permission.
 */
export function expandLayout(layout, homeKingdom, allianceRoles) {
    const resolve = (target) => (target === KINGDOM_PLACEHOLDER ? `#${homeKingdom.toString()}` : target);
    const expansion = { resolve, hidden: new Set([BOT_TARGET, ...layout.externalRoles]) };
    const expandWithCopies = (channel, categorySeenBy) => {
        const original = expandChannel(channel, categorySeenBy, expansion);
        if (channel.translated !== true)
            return [original];
        const copies = layout.translations.map((language) => expandChannel({
            ...channel,
            name: `${channel.name}-${language.toLowerCase()}`,
            seenBy: [language],
            description: translatedDescription(channel.description, language),
        }, categorySeenBy, expansion));
        return [original, ...copies];
    };
    const expand = (name, seenBy, channels) => ({
        name,
        overwrites: toOverwrites(categoryGrants(seenBy.map(resolve))),
        channels: channels.flatMap((channel) => expandWithCopies(channel, seenBy.map(resolve))),
    });
    const categories = layout.categories.map((category) => expand(category.name, category.seenBy, category.channels));
    if (layout.languages.length > 0) {
        categories.push(expand(LANGUAGES_CATEGORY, [], layout.languages.map((language) => ({
            name: `${language.toLowerCase()}-chat`,
            type: "text",
            description: `Chat in ${language}.`,
            seenBy: [language],
        }))));
    }
    for (const roleName of allianceRoles) {
        if (tagOfAllianceRole(roleName) === undefined)
            continue;
        categories.push(expand(roleName, [roleName], layout.allianceArea.channels));
    }
    return {
        roles: [...layout.roles.map(resolve), ...layout.languages],
        externalRoles: [...layout.externalRoles],
        categories,
    };
}
function categoryGrants(seenBy) {
    const grants = new Map();
    grant(grants, EVERYONE_TARGET, [VIEW], "deny");
    for (const role of seenBy)
        grant(grants, role, [VIEW], "allow");
    return grants;
}
function expandChannel(channel, categorySeenBy, expansion) {
    const { resolve } = expansion;
    const seenBy = (channel.seenBy ?? categorySeenBy).map(resolve);
    const grants = categoryGrants(seenBy);
    if (channel.mode === "read-only") {
        for (const role of seenBy)
            grant(grants, role, [SEND], "deny");
    }
    if (channel.mode === "only-king-posts") {
        for (const role of seenBy)
            grant(grants, role, POSTING, "deny");
        grant(grants, KING_ROLE, [VIEW, SEND], "allow");
    }
    if (channel.translated === true)
        grant(grants, TRANSLATION_BOT_ROLE, [VIEW, SEND], "allow");
    for (const [target, spec] of Object.entries(channel.overwrites ?? {})) {
        grant(grants, resolve(target), spec.allow, "allow");
        grant(grants, resolve(target), spec.deny, "deny");
    }
    const overwrites = toOverwrites(grants);
    return { name: channel.name, type: channel.type, overwrites, ...describeChannel(channel, overwrites, expansion.hidden) };
}
function grant(grants, target, permissions, how) {
    if (permissions.length === 0)
        return;
    const perTarget = grants.get(target) ?? new Map();
    for (const permission of permissions)
        perTarget.set(permission, how);
    grants.set(target, perTarget);
}
function toOverwrites(grants) {
    return [...grants].map(([target, perPermission]) => ({
        target,
        allow: [...perPermission].filter(([, how]) => how === "allow").map(([permission]) => permission),
        deny: [...perPermission].filter(([, how]) => how === "deny").map(([permission]) => permission),
    }));
}
//# sourceMappingURL=server-layout.js.map