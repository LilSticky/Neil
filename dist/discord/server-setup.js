// The setup script's logic: the layout file, the server as read through a port, the writes, and the report (slice 020).
// Talks to Discord only through SetupServer; setup-server-rest.ts is the discord.js adapter behind it.
import { PermissionFlagsBits } from "discord.js";
import { z } from "zod";
import { redact } from "../startup.js";
import { BOT_TARGET, EVERYONE_TARGET, } from "../domain/server-layout.js";
import { planSetup, } from "../domain/setup-plan.js";
const ROLE_OVERWRITE = 0;
const MEMBER_OVERWRITE = 1;
/** The Discord bit of each permission name the layout may use. */
const PERMISSION_BITS = {
    ViewChannel: PermissionFlagsBits.ViewChannel,
    SendMessages: PermissionFlagsBits.SendMessages,
    SendMessagesInThreads: PermissionFlagsBits.SendMessagesInThreads,
    CreatePublicThreads: PermissionFlagsBits.CreatePublicThreads,
    CreatePrivateThreads: PermissionFlagsBits.CreatePrivateThreads,
    ManageThreads: PermissionFlagsBits.ManageThreads,
    ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory,
    EmbedLinks: PermissionFlagsBits.EmbedLinks,
};
const PERMISSIONS = Object.keys(PERMISSION_BITS).filter(isPermission);
const ADMINISTRATOR = PermissionFlagsBits.Administrator;
const LOWERCASE_NO_SPACES = /^[a-z0-9_-]+$/;
const LAST_LINE = "Now take Administrator off Neil's role.";
const BY_HAND = [
    "Still by hand, in Server Settings > Integrations > Neil: allow Moderator and King on /quota, /rank and /link, and limit commands to their channels (SERVER-SETUP.md section 5).",
    "Still by hand, in the Developer Portal > Bot: switch on Server Members Intent and Presence Intent.",
    "Still by hand, if you want real forums and announcement channels: switch on Community in Server Settings, then run this again.",
    "Still by hand, in Server Settings > Roles: Neil's role above every role it gives, and below Moderator and King.",
];
/** The IDs the owner copies into the settings: setting name, and the role or channel it names. */
const ID_SETTINGS = [
    { setting: "DISCORD_MODERATOR_ROLE_ID", kind: "role", name: "Moderator" },
    { setting: "DISCORD_KING_ROLE_ID", kind: "role", name: "King" },
    { setting: "DISCORD_ONBOARDING_CHANNEL_ID", kind: "channel", name: "onboarding" },
    { setting: "DISCORD_LOG_CHANNEL_ID", kind: "channel", name: "neil-log" },
    { setting: "DISCORD_GUIDES_FORUM_ID", kind: "channel", name: "guides" },
];
function isPermission(name) {
    return Object.hasOwn(PERMISSION_BITS, name);
}
// ---- The layout file -------------------------------------------------------------------------------------------------
const overwriteSchema = z.strictObject({
    allow: z.array(z.string()).default([]),
    deny: z.array(z.string()).default([]),
});
const channelSchema = z.strictObject({
    name: z.string(),
    type: z.string(),
    mode: z.string().optional(),
    translated: z.boolean().optional(),
    seenBy: z.array(z.string()).optional(),
    overwrites: z.record(z.string(), overwriteSchema).optional(),
});
const categorySchema = z.strictObject({
    name: z.string(),
    seenBy: z.array(z.string()),
    channels: z.array(channelSchema),
});
const layoutSchema = z.strictObject({
    roles: z.array(z.string()),
    externalRoles: z.array(z.string()),
    languages: z.array(z.string()),
    categories: z.array(categorySchema),
    allianceArea: z.strictObject({ channels: z.array(channelSchema) }),
});
/**
 * Reads the layout file (data-model.md, Rules checked on load). The shape is checked by zod; the values by hand, so each
 * refusal names the category and channel it is about. Throws an Error with that message.
 */
export function parseLayout(text) {
    const json = parseJson(text);
    const parsed = layoutSchema.safeParse(json);
    if (!parsed.success) {
        const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
        throw new Error(`server-layout.json: ${problems.join("; ")}`);
    }
    const raw = parsed.data;
    const known = new Set([...raw.roles, ...raw.languages, ...raw.externalRoles, EVERYONE_TARGET, BOT_TARGET]);
    const categoryNames = new Set();
    const channelNames = new Map();
    const categories = raw.categories.map((category) => {
        if (categoryNames.has(category.name))
            throw new Error(`category "${category.name}" is listed twice`);
        categoryNames.add(category.name);
        const container = `category "${category.name}"`;
        for (const target of category.seenBy)
            checkTarget(known, container, target);
        return {
            name: category.name,
            seenBy: [...category.seenBy],
            channels: category.channels.map((channel) => checkChannel(container, channel, known, channelNames)),
        };
    });
    const allianceChannels = raw.allianceArea.channels.map((channel) => checkChannel("allianceArea", channel, known, channelNames));
    return {
        roles: [...raw.roles],
        externalRoles: [...raw.externalRoles],
        languages: [...raw.languages],
        categories,
        allianceArea: { channels: allianceChannels },
    };
}
function parseJson(text) {
    try {
        const value = JSON.parse(text);
        return value;
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`server-layout.json is not JSON: ${detail}`, { cause: error });
    }
}
function checkTarget(known, place, target) {
    if (!known.has(target))
        throw new Error(`${place}: "${target}" is no listed role, external role, @everyone or Neil`);
}
function checkChannel(container, raw, known, names) {
    const place = `${container}, channel "${raw.name}"`;
    const type = channelTypeOf(raw.type);
    if (type === undefined)
        throw new Error(`${place}: type "${raw.type}" is not text, voice, forum or announcement`);
    if (type !== "voice" && !LOWERCASE_NO_SPACES.test(raw.name)) {
        throw new Error(`${place}: the name must be lowercase with no spaces`);
    }
    const mode = raw.mode === undefined ? undefined : modeOf(raw.mode);
    if (raw.mode !== undefined && mode === undefined) {
        throw new Error(`${place}: mode "${raw.mode}" is not read-only or only-king-posts`);
    }
    const earlier = names.get(raw.name);
    if (earlier !== undefined)
        throw new Error(`channel "${raw.name}" is in two places: ${earlier} and ${place}`);
    names.set(raw.name, place);
    for (const target of raw.seenBy ?? [])
        checkTarget(known, place, target);
    const overwrites = raw.overwrites === undefined ? undefined : checkOverwrites(place, raw.overwrites, known);
    const channel = { name: raw.name, type };
    if (mode !== undefined)
        channel.mode = mode;
    if (raw.translated !== undefined)
        channel.translated = raw.translated;
    if (raw.seenBy !== undefined)
        channel.seenBy = [...raw.seenBy];
    if (overwrites !== undefined)
        channel.overwrites = overwrites;
    return channel;
}
function checkOverwrites(place, raw, known) {
    const result = {};
    for (const [target, spec] of Object.entries(raw)) {
        checkTarget(known, place, target);
        result[target] = { allow: permissionsOf(place, target, spec.allow), deny: permissionsOf(place, target, spec.deny) };
    }
    return result;
}
function permissionsOf(place, target, names) {
    return names.map((name) => {
        if (!isPermission(name))
            throw new Error(`${place}, overwrite "${target}": "${name}" is not a known permission`);
        return name;
    });
}
function channelTypeOf(value) {
    if (value === "text" || value === "voice" || value === "forum" || value === "announcement")
        return value;
    return undefined;
}
function modeOf(value) {
    if (value === "read-only" || value === "only-king-posts")
        return value;
    return undefined;
}
// ---- Reading the server ----------------------------------------------------------------------------------------------
/** The server as the plan needs it (data-model.md, Server state). Reads only; the names of permissions come from their bits. */
export async function readServer(port) {
    const [guild, bot, roles, channels] = await readAll(port);
    const everyone = roles.find((role) => role.id === guild.id);
    const botRoles = roles.filter((role) => bot.roleIds.includes(role.id));
    return {
        everyoneId: guild.id,
        botUserId: bot.userId,
        botTopPosition: Math.max(0, ...botRoles.map((role) => role.position)),
        hasCommunity: guild.features.includes("COMMUNITY"),
        botIsAdministrator: [...botRoles, ...(everyone === undefined ? [] : [everyone])].some(hasAdministrator),
        roles: roles.map(toServerRole),
        channels: channels.map((channel) => ({
            id: channel.id,
            name: channel.name,
            kind: channel.kind,
            parentId: channel.parentId,
            overwrites: channel.overwrites.map((overwrite) => ({
                targetId: overwrite.targetId,
                allow: permissionNamesOf(overwrite.allow),
                deny: permissionNamesOf(overwrite.deny),
            })),
        })),
    };
}
function toServerRole(role) {
    return {
        id: role.id,
        name: role.name,
        hasPermissions: role.permissions !== 0n,
        managed: role.managed,
        position: role.position,
    };
}
function hasAdministrator(role) {
    return (role.permissions & ADMINISTRATOR) !== 0n;
}
/** The four reads the setup starts with: the guild, Neil's member, the roles and the channels. */
function readAll(port) {
    return Promise.all([port.readGuild(), port.readBotMember(), port.readRoles(), port.readChannels()]);
}
/** The permission names whose bits are set; bits the domain does not name are left out. */
function permissionNamesOf(bits) {
    return PERMISSIONS.filter((name) => (bits & PERMISSION_BITS[name]) !== 0n);
}
function bitsOf(names) {
    return names.reduce((bits, name) => bits | PERMISSION_BITS[name], 0n);
}
/**
 * Applies a plan: roles, then categories, then channels, then corrected overwrites. A failed write is recorded and the rest
 * go on; a step whose category or role failed is recorded as failed without a write.
 */
export async function applySetup(plan, port) {
    const book = await readBook(port);
    const outcomes = [];
    for (const step of inOrder(plan.steps)) {
        try {
            await applyStep(step, port, book);
            outcomes.push({ step, status: "done" });
        }
        catch (error) {
            outcomes.push({ step, status: "failed", reason: error instanceof Error ? error.message : String(error) });
        }
    }
    return outcomes;
}
async function readBook(port) {
    const [guild, bot, roles, channels] = await readAll(port);
    return {
        everyoneId: guild.id,
        botUserId: bot.userId,
        roles: roles.map((role) => ({ id: role.id, name: role.name })),
        categories: channels
            .filter((channel) => channel.kind === "category")
            .map((channel) => ({ id: channel.id, name: channel.name })),
        channels: new Map(channels.map((channel) => [channel.id, channel])),
    };
}
const PHASE = {
    "create-role": 0,
    "create-category": 1,
    "create-channel": 2,
    "correct-overwrites": 3,
};
function inOrder(steps) {
    return [...steps].sort((a, b) => PHASE[a.kind] - PHASE[b.kind]);
}
async function applyStep(step, port, book) {
    switch (step.kind) {
        case "create-role": {
            const id = await port.createRole(step.name);
            book.roles.push({ id, name: step.name });
            return;
        }
        case "create-category": {
            const overwrites = step.overwrites.map((wanted) => editFor(book, wanted));
            const id = await port.createCategory(step.name, overwrites);
            book.categories.push({ id, name: step.name });
            return;
        }
        case "create-channel": {
            const parent = single(book.categories.filter((category) => category.name === step.categoryName), `category "${step.categoryName}" is not there (its step failed)`);
            const overwrites = step.overwrites.map((wanted) => editFor(book, wanted));
            await port.createChannel({ name: step.name, type: step.type, parentId: parent.id, overwrites });
            return;
        }
        case "correct-overwrites": {
            const current = book.channels.get(step.id);
            if (current === undefined)
                throw new Error(`channel "${step.name}" is not there any more`);
            const wanted = step.overwrites.map((overwrite) => editFor(book, overwrite));
            await port.editOverwrites(step.id, mergeOverwrites(current.overwrites, wanted));
            return;
        }
    }
}
function editFor(book, wanted) {
    const targetId = idOfTarget(book, wanted.target);
    const type = targetId === book.botUserId ? MEMBER_OVERWRITE : ROLE_OVERWRITE;
    return { targetId, type, allow: bitsOf(wanted.allow), deny: bitsOf(wanted.deny) };
}
function idOfTarget(book, target) {
    if (target === EVERYONE_TARGET)
        return book.everyoneId;
    if (target === BOT_TARGET)
        return book.botUserId;
    return single(book.roles.filter((role) => role.name === target), `role "${target}"`).id;
}
/** The overwrite list with the wanted allows and denies merged in, keeping every other bit and target (research R4). */
function mergeOverwrites(current, wanted) {
    const merged = [...current];
    for (const want of wanted) {
        const index = merged.findIndex((overwrite) => overwrite.targetId === want.targetId);
        const base = merged[index] ?? { targetId: want.targetId, type: want.type, allow: 0n, deny: 0n };
        const next = {
            targetId: want.targetId,
            type: base.type,
            allow: (base.allow | want.allow) & ~want.deny,
            deny: (base.deny | want.deny) & ~want.allow,
        };
        if (index === -1)
            merged.push(next);
        else
            merged[index] = next;
    }
    return merged;
}
function single(matches, what) {
    if (matches.length === 0)
        throw new Error(`no ${what}`);
    if (matches.length > 1)
        throw new Error(`more than one ${what}`);
    const [only] = matches;
    if (only === undefined)
        throw new Error(`no ${what}`);
    return only;
}
/**
 * Plans the setup, applies it on a real run, and returns the report (contracts/cli.md, in its order) with the exit code. A real
 * run without Administrator on Neil's role writes nothing and exits 1.
 */
export async function runSetup(options) {
    const { layout, homeKingdom, apply, port, secrets } = options;
    const before = await readServer(port);
    const plan = planSetup(layout, before, homeKingdom);
    const blocked = apply && !before.botIsAdministrator;
    const real = apply && !blocked;
    const outcomes = real ? await applySetup(plan, port) : [];
    const failures = outcomes.filter((outcome) => outcome.status === "failed");
    // The read after the writes may fail too; the outcomes are still reported, and the ID lines are left out.
    const after = real ? await readAfterWrites(port) : before;
    const changed = plan.steps.filter((step) => !failures.some((failure) => failure.step === step));
    const outside = plan.findings.filter((finding) => finding.kind === "outside-layout");
    const warnings = plan.findings.filter((finding) => finding.kind !== "outside-layout");
    const tense = (step) => (real ? describeStep(step) : `would ${describeStep(step)}`);
    const lines = [
        ...administratorNote(before.botIsAdministrator, apply),
        ...changed.map(tense),
        ...warnings.sort((a, b) => warningRank(a) - warningRank(b)).map((finding) => describeFinding(finding, real)),
        ...outside.map((finding) => describeFinding(finding, real)),
        ...failures.map((failure) => `failed: ${describeStep(failure.step)}: ${failure.reason}`),
        ...(plan.steps.length === 0 ? ["Nothing to do."] : []),
        ...(after === undefined ? ["Could not read the IDs after the writes; run this again to see them."] : idLines(after)),
        ...BY_HAND,
        ...(real ? [LAST_LINE] : []),
    ];
    return {
        report: redact(lines.join("\n"), secrets),
        exitCode: blocked || failures.length > 0 ? 1 : 0,
    };
}
/** The server as it is after a real run's writes; undefined when the read fails. */
async function readAfterWrites(port) {
    try {
        return await readServer(port);
    }
    catch {
        return undefined;
    }
}
function administratorNote(isAdministrator, apply) {
    if (isAdministrator)
        return [];
    return apply
        ? ["A real run needs Administrator on Neil's role. Nothing was written."]
        : ["Neil's role has no Administrator: a dry run works without it, a real run needs it."];
}
function describeStep(step) {
    switch (step.kind) {
        case "create-role":
            return `create role ${step.name}`;
        case "create-category":
            return `create category ${step.name}`;
        case "create-channel":
            return `create ${step.type} channel ${step.name} in ${step.categoryName}`;
        case "correct-overwrites":
            return `correct permissions of ${step.name}`;
    }
}
/** Warnings: hides-from-everyone first, the other findings after, each group in the order of the plan. */
function warningRank(finding) {
    return finding.kind === "hides-from-everyone" ? 0 : 1;
}
/** A finding as a line; `real` is whether the run writes, which decides the tense of what it will do. */
function describeFinding(finding, real) {
    switch (finding.kind) {
        case "hides-from-everyone":
            return real ? `${finding.name} is hidden from @everyone` : `${finding.name} would be hidden from @everyone`;
        case "outside-layout":
            return `${finding.name} is outside the layout`;
        case "extra-overwrite":
            return `${finding.name} has an overwrite for ${finding.target} that the layout does not name; kept`;
        case "wrong-type":
            return `${finding.name} is a ${finding.actual}, the layout wants a ${finding.expected}; kept`;
        case "other-category":
            return `${finding.name} is in ${finding.categoryName ?? "no category"}, not where the layout puts it; kept`;
        case "duplicate-name":
            return `${finding.name} exists more than once; Neil doesn't choose between them`;
        case "external-role-missing":
            return `${finding.name} (external role) is missing; its overwrites are left out`;
        case "role-has-permissions":
            return `${finding.name} holds permissions; Neil doesn't give or take it`;
        case "role-above-neil":
            return `${finding.name} is above Neil's role; Neil can't give it`;
        case "fallback-to-text":
            return `${finding.name}: without Community it is created as text instead of ${finding.from}`;
    }
}
/** The IDs as SETTING=value lines, from the server as it is now; a role or channel missing or doubled gives no line. */
function idLines(state) {
    const lines = [`DISCORD_GUILD_ID=${state.everyoneId}`];
    for (const setting of ID_SETTINGS) {
        const matches = setting.kind === "role"
            ? state.roles.filter((role) => role.name === setting.name)
            : state.channels.filter((channel) => channel.kind !== "category" && channel.name === setting.name);
        const [only] = matches;
        if (matches.length === 1 && only !== undefined)
            lines.push(`${setting.setting}=${only.id}`);
    }
    return lines;
}
//# sourceMappingURL=server-setup.js.map