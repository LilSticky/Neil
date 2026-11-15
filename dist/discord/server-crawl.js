// Neil Police's read of one server (ADR 15, documentation/NEIL-POLICE.md): REST calls only, changes nothing. crawlServer
// reads the server into a snapshot; summarizeCrawl writes it as Markdown, never with a Member's name. Every reply is
// checked with zod before it is kept.
import { ChannelType, Routes } from "discord.js";
import { z } from "zod";
// ---------------------------------------------------------------------------------------------------------------------
// Replies, checked at the boundary
// ---------------------------------------------------------------------------------------------------------------------
/** A decimal number kept as text: permissions and snowflakes. */
const decimal = z.string().regex(/^\d+$/);
const guildRead = z.looseObject({ id: z.string(), name: z.string() });
const overwriteRead = z.object({ id: z.string(), type: z.number().int(), allow: decimal, deny: decimal });
const channelRead = z.looseObject({
    id: z.string(),
    name: z.string().nullish(),
    type: z.number().int(),
    parent_id: z.string().nullish(),
    position: z.number().int().default(0),
    last_message_id: decimal.nullish(),
    permission_overwrites: z.array(overwriteRead).default([]),
});
const roleRead = z.looseObject({
    id: z.string(),
    name: z.string(),
    position: z.number().int(),
    permissions: decimal,
    managed: z.boolean().default(false),
});
/** One member as Discord sends it. The fields the snapshot drops (avatar, flags, and the like) are left out by zod. */
const memberRead = z.object({
    user: z.object({
        id: z.string(),
        username: z.string(),
        global_name: z.string().nullish(),
        bot: z.boolean().default(false),
    }),
    nick: z.string().nullish(),
    roles: z.array(z.string()),
    joined_at: z.string().nullish(),
    premium_since: z.string().nullish(),
    communication_disabled_until: z.string().nullish(),
    pending: z.boolean().default(false),
});
/**
 * A list of Discord objects: each must have the given fields. The dropped fields (personal or secret ones) are removed,
 * and the rest of each object is kept as Discord sent it.
 */
function listOf(shape, ...dropped) {
    return z.array(z.looseObject(shape)).transform((items) => items.map((item) => without(item, dropped)));
}
function without(item, dropped) {
    return Object.fromEntries(Object.entries(item).filter(([key]) => !dropped.includes(key)));
}
const activeThreadsRead = z.object({ threads: listOf({ id: z.string() }) }).transform((reply) => reply.threads);
const archivedThreadsRead = z
    .object({ threads: listOf({ id: z.string() }), has_more: z.boolean() })
    .transform((reply) => ({ threads: reply.threads, hasMore: reply.has_more }));
const auditLogRead = z
    .object({ audit_log_entries: listOf({ id: z.string(), action_type: z.number().int() }) })
    .transform((reply) => reply.audit_log_entries);
const scheduledEventsRead = listOf({ id: z.string() }, "creator");
const emojisRead = listOf({ id: z.string() }, "user");
const stickersRead = listOf({ id: z.string() }, "user");
const autoModerationRulesRead = listOf({ id: z.string() });
const invitesRead = listOf({ code: z.string() }, "inviter", "target_user");
const webhooksRead = listOf({ id: z.string() }, "token", "url", "user");
const integrationsRead = listOf({ id: z.string() }, "user");
const welcomeScreenRead = z.looseObject({});
const onboardingRead = z.looseObject({});
// ---------------------------------------------------------------------------------------------------------------------
// Reading one route
// ---------------------------------------------------------------------------------------------------------------------
/** An HTTP refusal (discord.js's DiscordAPIError and HTTPError carry a numeric status and a message) as its reason. */
function refusalOf(error) {
    const refusal = z.object({ status: z.number(), message: z.string() }).safeParse(error);
    return refusal.success ? `${String(refusal.data.status)} ${refusal.data.message}` : undefined;
}
/** Asks one route, with its query string when it has one. A refusal with an HTTP status is an answer; any other error is rethrown. */
async function askRoute(rest, route, params) {
    try {
        const response = await rest.get(route, params === undefined ? undefined : { query: new URLSearchParams(params) });
        return { refused: false, response };
    }
    catch (error) {
        const reason = refusalOf(error);
        if (reason === undefined)
            throw error;
        return { refused: true, reason };
    }
}
/** A section the crawl cannot do without: a refusal or a reply that is not as expected throws, naming the section. */
async function readRequired(rest, section, route, schema, params) {
    const asked = await askRoute(rest, route, params);
    if (asked.refused)
        throw new Error(`cannot read ${section}: ${asked.reason}`);
    return schema.parse(asked.response);
}
/** An optional section: a refusal is recorded as its reason, and a reply that is not as expected as "unexpected response". */
async function readOptional(rest, route, schema, params) {
    const asked = await askRoute(rest, route, params);
    if (asked.refused)
        return { readable: false, reason: asked.reason };
    const parsed = schema.safeParse(asked.response);
    return parsed.success ? { readable: true, data: parsed.data } : { readable: false, reason: "unexpected response" };
}
/** The Members, in pages of 1000: each page after the first asks for the members after the last id of the page before. */
const MEMBER_PAGE = 1000;
async function readMembers(rest, guildId) {
    const members = [];
    let after = "0";
    for (;;) {
        const page = await readOptional(rest, Routes.guildMembers(guildId), z.array(memberRead), {
            limit: String(MEMBER_PAGE),
            after,
        });
        if (!page.readable)
            return page;
        members.push(...page.data);
        const last = page.data.at(-1);
        if (page.data.length < MEMBER_PAGE || last === undefined)
            break;
        after = last.user.id;
    }
    return { readable: true, data: members.map(memberOf) };
}
function memberOf(member) {
    return {
        id: member.user.id,
        username: member.user.username,
        displayName: member.user.global_name ?? null,
        nickname: member.nick ?? null,
        roleIds: member.roles,
        joinedAt: member.joined_at ?? null,
        boostingSince: member.premium_since ?? null,
        timeoutUntil: member.communication_disabled_until ?? null,
        bot: member.user.bot,
        pending: member.pending,
    };
}
function channelOf(channel) {
    return {
        id: channel.id,
        name: channel.name ?? "",
        type: channel.type,
        parentId: channel.parent_id ?? null,
        position: channel.position,
        lastMessageId: channel.last_message_id ?? null,
        overwrites: channel.permission_overwrites,
        raw: channel,
    };
}
function roleOf(role) {
    return {
        id: role.id,
        name: role.name,
        position: role.position,
        permissions: role.permissions,
        managed: role.managed,
        raw: role,
    };
}
/** A category's channel type as a plain number, so the comparisons with the channel types read Discord's numbers. */
const CATEGORY_TYPE = ChannelType.GuildCategory;
/** The channel kinds whose public archived threads the crawl reads: text, announcement, forum and media. */
const ARCHIVABLE_TYPES = new Set([
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildMedia,
]);
/** Reads one server with REST calls only, and returns what the summary and the snapshot need. */
export async function crawlServer(rest, guildId, now) {
    const guild = await readRequired(rest, "guild", Routes.guild(guildId), guildRead, { with_counts: "true" });
    const channels = await readRequired(rest, "channels", Routes.guildChannels(guildId), z.array(channelRead));
    const roles = await readRequired(rest, "roles", Routes.guildRoles(guildId), z.array(roleRead));
    const archivedThreads = {};
    for (const channel of channels) {
        if (!ARCHIVABLE_TYPES.has(channel.type))
            continue;
        archivedThreads[channel.id] = await readOptional(rest, Routes.channelThreads(channel.id, "public"), archivedThreadsRead, { limit: "100" });
    }
    return {
        guildId,
        crawledAt: now.toISOString(),
        guild: { id: guild.id, name: guild.name, raw: guild },
        channels: channels.map(channelOf),
        roles: roles.map(roleOf),
        members: await readMembers(rest, guildId),
        activeThreads: await readOptional(rest, Routes.guildActiveThreads(guildId), activeThreadsRead),
        archivedThreads,
        scheduledEvents: await readOptional(rest, Routes.guildScheduledEvents(guildId), scheduledEventsRead, {
            with_user_count: "true",
        }),
        emojis: await readOptional(rest, Routes.guildEmojis(guildId), emojisRead),
        stickers: await readOptional(rest, Routes.guildStickers(guildId), stickersRead),
        autoModerationRules: await readOptional(rest, Routes.guildAutoModerationRules(guildId), autoModerationRulesRead),
        invites: await readOptional(rest, Routes.guildInvites(guildId), invitesRead),
        webhooks: await readOptional(rest, Routes.guildWebhooks(guildId), webhooksRead),
        integrations: await readOptional(rest, Routes.guildIntegrations(guildId), integrationsRead),
        auditLog: await readOptional(rest, Routes.guildAuditLog(guildId), auditLogRead, { limit: "100" }),
        welcomeScreen: await readOptional(rest, Routes.guildWelcomeScreen(guildId), welcomeScreenRead),
        onboarding: await readOptional(rest, Routes.guildOnboarding(guildId), onboardingRead),
    };
}
// ---------------------------------------------------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------------------------------------------------
const DISCORD_EPOCH = 1420070400000n;
const CHANNEL_TYPE_NAMES = new Map([
    [ChannelType.GuildText, "text"],
    [ChannelType.GuildVoice, "voice"],
    [ChannelType.GuildCategory, "category"],
    [ChannelType.GuildAnnouncement, "announcement"],
    [ChannelType.GuildStageVoice, "stage"],
    [ChannelType.GuildForum, "forum"],
    [ChannelType.GuildMedia, "media"],
]);
/** The permissions the roles table names, by Discord's permission bit. */
const KEY_PERMISSIONS = [
    { name: "Administrator", bit: 3 },
    { name: "Manage Server", bit: 5 },
    { name: "Manage Channels", bit: 4 },
    { name: "Manage Roles", bit: 28 },
    { name: "Manage Nicknames", bit: 27 },
    { name: "Kick Members", bit: 1 },
    { name: "Ban Members", bit: 2 },
    { name: "Mention Everyone", bit: 17 },
    { name: "Manage Messages", bit: 13 },
    { name: "View Audit Log", bit: 7 },
    { name: "Create Events", bit: 44 },
    { name: "Manage Events", bit: 33 },
];
/** The guild settings the summary shows, when the guild carries them. */
const SETTING_KEYS = [
    "verification_level",
    "mfa_level",
    "explicit_content_filter",
    "default_message_notifications",
    "preferred_locale",
    "premium_tier",
    "premium_subscription_count",
    "features",
];
const settingValue = z.union([z.string(), z.number(), z.array(z.string())]);
/** Markdown of a snapshot: the server's settings, what could not be read, roles, channels, Members, threads and counts. */
export function summarizeCrawl(snapshot) {
    const lines = [
        `# ${snapshot.guild.name}`,
        "",
        crawlLine(snapshot),
        "",
        "## Server settings",
        ...settingsLines(snapshot.guild.raw),
        "",
        "## Not readable",
        ...notReadableLines(snapshot),
        "",
        "## Roles",
        ...rolesLines(snapshot),
        "",
        "## Channels",
        ...channelLines(snapshot),
        "",
        "## Members",
        ...membersLines(snapshot),
        "",
        "## Threads",
        ...threadLines(snapshot),
        "",
        "## Other",
        ...otherLines(snapshot),
    ];
    return `${lines.join("\n")}\n`;
}
function crawlLine(snapshot) {
    const parts = [`Crawled ${snapshot.crawledAt}`, `guild ${snapshot.guildId}`];
    const count = snapshot.guild.raw.approximate_member_count;
    if (typeof count === "number")
        parts.push(`about ${String(count)} members`);
    return parts.join(" · ");
}
function settingsLines(raw) {
    return SETTING_KEYS.flatMap((key) => {
        const value = settingValue.safeParse(raw[key]);
        if (!value.success)
            return [];
        const text = Array.isArray(value.data) ? value.data.join(", ") : String(value.data);
        return text === "" ? [] : [`- ${key.replaceAll("_", " ")}: ${text}`];
    });
}
/** Every part of the snapshot that could not be read, with its reason; the archived threads by channel. */
function sectionsOf(snapshot) {
    const named = [
        ["members", snapshot.members],
        ["activeThreads", snapshot.activeThreads],
        ["scheduledEvents", snapshot.scheduledEvents],
        ["emojis", snapshot.emojis],
        ["stickers", snapshot.stickers],
        ["autoModerationRules", snapshot.autoModerationRules],
        ["invites", snapshot.invites],
        ["webhooks", snapshot.webhooks],
        ["integrations", snapshot.integrations],
        ["auditLog", snapshot.auditLog],
        ["welcomeScreen", snapshot.welcomeScreen],
        ["onboarding", snapshot.onboarding],
    ];
    for (const [channelId, section] of Object.entries(snapshot.archivedThreads)) {
        named.push([`archivedThreads ${channelHeadingOf(snapshot, channelId)}`, section]);
    }
    return named;
}
function notReadableLines(snapshot) {
    const failures = sectionsOf(snapshot).flatMap(([name, section]) => section.readable ? [] : [`- ${name}: ${section.reason}`]);
    return failures.length === 0 ? ["Everything was readable."] : failures;
}
function rolesLines(snapshot) {
    const rows = [...snapshot.roles]
        .sort((a, b) => b.position - a.position)
        .map((role) => [
        String(role.position),
        role.name.replaceAll("|", "\\|"),
        membersWithRole(snapshot, role),
        role.managed ? "yes" : "no",
        keyPermissionsOf(role.permissions),
    ]);
    return [
        "| Position | Role | Members | Managed | Key permissions |",
        "| --- | --- | --- | --- | --- |",
        ...rows.map((cells) => `| ${cells.join(" | ")} |`),
    ];
}
/** The Members who have the role; @everyone (the role whose id is the guild's) is every Member. "?" when the Members are unreadable. */
function membersWithRole(snapshot, role) {
    const members = snapshot.members;
    if (!members.readable)
        return "?";
    if (role.id === snapshot.guildId)
        return String(members.data.length);
    return String(members.data.filter((member) => member.roleIds.includes(role.id)).length);
}
function keyPermissionsOf(permissions) {
    const bits = BigInt(permissions);
    const names = KEY_PERMISSIONS.filter(({ bit }) => (bits & (1n << BigInt(bit))) !== 0n).map(({ name }) => name);
    return names.length === 0 ? "–" : names.join(", ");
}
function byPosition(a, b) {
    return a.position - b.position;
}
/** Channels outside any category first, then each category with its channels; each group by position. */
function channelLines(snapshot) {
    const channels = snapshot.channels;
    const categories = channels.filter((channel) => channel.type === CATEGORY_TYPE).sort(byPosition);
    const categoryIds = new Set(categories.map((category) => category.id));
    const outside = channels
        .filter((channel) => channel.type !== CATEGORY_TYPE &&
        (channel.parentId === null || !categoryIds.has(channel.parentId)))
        .sort(byPosition);
    const lines = outside.map(channelLine);
    for (const category of categories) {
        if (lines.length > 0)
            lines.push("");
        lines.push(`### ${nameOrHidden(category.name)}`);
        const inside = channels.filter((channel) => channel.parentId === category.id).sort(byPosition);
        lines.push(...inside.map(channelLine));
    }
    return lines;
}
function channelLine(channel) {
    const kind = CHANNEL_TYPE_NAMES.get(channel.type) ?? `type ${String(channel.type)}`;
    const activity = channel.lastMessageId === null ? "never" : dayOfSnowflake(channel.lastMessageId);
    return `- ${channelHeading(channel)} (${kind}) · overwrites: ${String(channel.overwrites.length)} · last activity: ${activity}`;
}
/** The day of a snowflake's timestamp: the bits above the worker, process and increment ones. */
function dayOfSnowflake(id) {
    const millis = Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
    return new Date(millis).toISOString().slice(0, 10);
}
function nameOrHidden(name) {
    return name === "" ? "(hidden)" : name;
}
function channelHeading(channel) {
    return channel.name === "" ? "(hidden)" : `#${channel.name}`;
}
function channelHeadingOf(snapshot, channelId) {
    const channel = snapshot.channels.find((candidate) => candidate.id === channelId);
    return channel === undefined ? channelId : channelHeading(channel);
}
function membersLines(snapshot) {
    const members = snapshot.members;
    if (!members.readable)
        return ["Not readable."];
    const list = members.data;
    const crawledAt = Date.parse(snapshot.crawledAt);
    const figures = [
        ["Total", list.length],
        ["Humans", list.filter((member) => !member.bot).length],
        ["Bots", list.filter((member) => member.bot).length],
        ["Pending", list.filter((member) => member.pending).length],
        ["With a nickname", list.filter((member) => member.nickname !== null).length],
        [
            "With no role besides @everyone",
            list.filter((member) => member.roleIds.every((id) => id === snapshot.guildId)).length,
        ],
        ["Boosting", list.filter((member) => member.boostingSince !== null).length],
        [
            "Timed out",
            list.filter((member) => member.timeoutUntil !== null && Date.parse(member.timeoutUntil) > crawledAt).length,
        ],
    ];
    const joins = new Map();
    for (const member of list) {
        if (member.joinedAt === null)
            continue;
        const month = member.joinedAt.slice(0, 7);
        joins.set(month, (joins.get(month) ?? 0) + 1);
    }
    const monthLines = [...joins]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => `- ${month}: ${String(count)}`);
    return [
        ...figures.map(([label, figure]) => `- ${label}: ${String(figure)}`),
        "Joins per month:",
        ...monthLines,
    ];
}
function threadLines(snapshot) {
    const active = snapshot.activeThreads;
    const lines = [
        active.readable
            ? `- Active threads: ${String(active.data.length)}`
            : `- Active threads: not readable (${active.reason})`,
    ];
    const archived = Object.entries(snapshot.archivedThreads).flatMap(([channelId, section]) => {
        if (!section.readable || section.data.threads.length === 0)
            return [];
        const more = section.data.hasMore ? ", + more" : "";
        return [`  - ${channelHeadingOf(snapshot, channelId)}: ${String(section.data.threads.length)}${more}`];
    });
    return archived.length === 0 ? lines : [...lines, "- Archived threads (first page):", ...archived];
}
function otherLines(snapshot) {
    return [
        countLine("Scheduled events", snapshot.scheduledEvents),
        countLine("Emojis", snapshot.emojis),
        countLine("Stickers", snapshot.stickers),
        ...listLines("Auto moderation rules", snapshot.autoModerationRules, (rule) => textOf(fieldOf(rule, "name"))),
        ...listLines("Invites", snapshot.invites, (invite) => {
            const channel = channelHeadingOf(snapshot, textOf(fieldOf(invite, "channel_id")));
            return `${textOf(fieldOf(invite, "code"))}: ${channel}, uses ${textOf(fieldOf(invite, "uses"))}`;
        }),
        ...listLines("Webhooks", snapshot.webhooks, (webhook) => {
            const channel = channelHeadingOf(snapshot, textOf(fieldOf(webhook, "channel_id")));
            return `${textOf(fieldOf(webhook, "name"))}: ${channel}`;
        }),
        ...listLines("Integrations", snapshot.integrations, (integration) => `${textOf(fieldOf(integration, "name"))} (${textOf(fieldOf(integration, "type"))})`),
        ...auditLogLines(snapshot.auditLog),
    ];
}
function countLine(label, section) {
    return section.readable
        ? `- ${label}: ${String(section.data.length)}`
        : `- ${label}: not readable (${section.reason})`;
}
/** A count and one indented line per item; a section that cannot be read is one line saying so. */
function listLines(label, section, describe) {
    if (!section.readable)
        return [`- ${label}: not readable (${section.reason})`];
    return [`- ${label}: ${String(section.data.length)}`, ...section.data.map((item) => `  - ${describe(item)}`)];
}
function auditLogLines(section) {
    if (!section.readable)
        return [`- Audit log: not readable (${section.reason})`];
    const kinds = new Map();
    for (const entry of section.data) {
        const kind = textOf(fieldOf(entry, "action_type"));
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    }
    const perKind = [...kinds]
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([kind, count]) => `  - action type ${kind}: ${String(count)}`);
    return [`- Audit log: ${String(section.data.length)} entries`, ...perKind];
}
/** A field of one of the snapshot's Discord objects, which the snapshot keeps as unknown; undefined when it is absent. */
function fieldOf(item, key) {
    const record = z.looseObject({}).safeParse(item);
    return record.success ? record.data[key] : undefined;
}
/** A value as text for the summary; "?" when it is not a string or a number. */
function textOf(value) {
    return typeof value === "string" || typeof value === "number" ? String(value) : "?";
}
//# sourceMappingURL=server-crawl.js.map