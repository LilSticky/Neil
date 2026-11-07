import { ChannelType } from "discord.js";
import { allianceRoleName } from "../domain/managed-roles.js";
import { listEveryMember } from "./member-listing.js";
/** The most Interested Members Discord gives in one page of fetchSubscribers. */
const SUBSCRIBER_PAGE_SIZE = 100;
/** The channel the Event invitations go to for a Kingdom Event. */
const ANNOUNCEMENTS_CHANNEL = "event-announcements";
/** The channel of an Alliance, in its category, that its Alliance Events go to. */
const ALLIANCE_CHAT_CHANNEL = "alliance-chat";
/** Every Member of the guild, read over REST page by page. */
function listAllMembers(guild) {
    return listEveryMember(async (after, limit) => [
        ...(await guild.members.list(after === undefined ? { limit } : { after, limit })).values(),
    ]);
}
function isPostable(channel) {
    return channel.type === ChannelType.GuildText;
}
/** The first cached channel that is a guild text channel with this name and, when given, this category name. */
function findTextChannel(guild, name, categoryName) {
    return [...guild.channels.cache.values()].find((channel) => channel.type === ChannelType.GuildText &&
        channel.name === name &&
        (categoryName === undefined || channel.parent?.name === categoryName));
}
/**
 * The Discord server as the Event invitations and reminders use it: role holders and roles, the announcement and alliance
 * channels, posts, #neil-log (through `log`, with mentions off), scheduled events, Interested Members and presence on the
 * server. Member lists are read over REST, page by page, and the Interested Members page by 100.
 */
export function eventServerOf(guild, options) {
    return {
        async holdersOf(roleName) {
            const members = await listAllMembers(guild);
            return members
                .filter((member) => [...member.roles.cache.values()].some((role) => role.name === roleName))
                .map((member) => member.id);
        },
        async membersOnServer(memberIds) {
            if (memberIds.length === 0)
                return new Set();
            const present = new Set((await listAllMembers(guild)).map((member) => member.id));
            return new Set(memberIds.filter((memberId) => present.has(memberId)));
        },
        async rolesOf(memberId) {
            const member = await guild.members.fetch(memberId);
            return [...member.roles.cache.values()].map((role) => ({ id: role.id, name: role.name }));
        },
        announcementsChannelId() {
            return findTextChannel(guild, ANNOUNCEMENTS_CHANNEL)?.id;
        },
        allianceChatId(tag) {
            return findTextChannel(guild, ALLIANCE_CHAT_CHANNEL, allianceRoleName(tag))?.id;
        },
        async post(channelId, message) {
            const channel = await guild.channels.fetch(channelId);
            if (channel === null || !isPostable(channel)) {
                throw new Error(`The channel ${channelId} is not a guild text channel.`);
            }
            const sent = await channel.send(message);
            return sent.url;
        },
        // Mentions are off in the log: a line names a Member by id, and must not ping them.
        log: (line) => options.log({ content: line, allowedMentions: { parse: [] } }),
        async scheduledEvents() {
            return [...(await guild.scheduledEvents.fetch()).values()];
        },
        async interestedIn(eventId) {
            const interested = [];
            let after;
            for (;;) {
                const page = await guild.scheduledEvents.fetchSubscribers(eventId, after === undefined ? { limit: SUBSCRIBER_PAGE_SIZE } : { limit: SUBSCRIBER_PAGE_SIZE, after });
                const ids = [...page.keys()];
                interested.push(...ids);
                const last = ids.at(-1);
                if (ids.length < SUBSCRIBER_PAGE_SIZE || last === undefined)
                    return interested;
                after = last;
            }
        },
    };
}
//# sourceMappingURL=event-server.js.map