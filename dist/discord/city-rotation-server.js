import { ChannelType, RESTJSONErrorCodes, ThreadAutoArchiveDuration } from "discord.js";
import { z } from "zod";
/** The channel the City Rotation card is pinned in: the original, not a translated copy. */
const ANNOUNCEMENTS_CHANNEL = "nap-announcements";
/** The R5s' and the King's room, where Neil asks for the Handover after the Royal City siege. */
const LEADERS_CHANNEL = "nap-leaders";
/** The Home Kingdom's news, where every change of the City Rotation is announced. */
const KINGDOM_ANNOUNCEMENTS_CHANNEL = "home-kingdom-announcements";
/** Discord's answer when the message to edit is gone. */
const unknownMessage = z.object({ code: z.literal(RESTJSONErrorCodes.UnknownMessage) });
/** A text or announcement channel, or a thread in one (a NaP Report's thread), can hold Neil's posts. */
function isMessageChannel(channel) {
    return (channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildAnnouncement ||
        channel.type === ChannelType.PrivateThread ||
        channel.type === ChannelType.PublicThread ||
        channel.type === ChannelType.AnnouncementThread);
}
function isThreadParent(channel) {
    return channel.type === ChannelType.GuildText;
}
/** The first cached text or announcement channel with this name. */
function channelNamed(guild, name) {
    return [...guild.channels.cache.values()].find((channel) => (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) && channel.name === name)?.id;
}
async function messageChannel(guild, channelId) {
    const channel = await guild.channels.fetch(channelId);
    if (channel === null || !isMessageChannel(channel)) {
        throw new Error(`The channel ${channelId} is not a text or announcement channel.`);
    }
    return channel;
}
/**
 * The Discord server as the City Rotation uses it: #nap-announcements, #nap-leaders and #home-kingdom-announcements by name, Neil's own posts, edits
 * and pins there, private threads under #nap-leaders for the NaP Reports, and #neil-log (through `log`, with mentions off).
 */
export function cityRotationServerOf(guild, options) {
    return {
        announcementsChannelId: () => channelNamed(guild, ANNOUNCEMENTS_CHANNEL),
        leadersChannelId: () => channelNamed(guild, LEADERS_CHANNEL),
        kingdomAnnouncementsChannelId: () => channelNamed(guild, KINGDOM_ANNOUNCEMENTS_CHANNEL),
        async post(channelId, message) {
            const sent = await (await messageChannel(guild, channelId)).send(message);
            return sent.id;
        },
        async edit(channelId, messageId, message) {
            const channel = await messageChannel(guild, channelId);
            try {
                await channel.messages.edit(messageId, message);
                return true;
            }
            catch (error) {
                if (unknownMessage.safeParse(error).success)
                    return false;
                throw error;
            }
        },
        async pin(channelId, messageId) {
            await (await messageChannel(guild, channelId)).messages.pin(messageId);
        },
        async openPrivateThread(parentId, name, memberIds) {
            const parent = await guild.channels.fetch(parentId);
            if (parent === null || !isThreadParent(parent))
                throw new Error(`The channel ${parentId} is not a text channel.`);
            const thread = await parent.threads.create({
                name,
                type: ChannelType.PrivateThread,
                invitable: false,
                autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            });
            const notAdded = [];
            for (const memberId of memberIds) {
                try {
                    await thread.members.add(memberId);
                }
                catch {
                    notAdded.push(memberId);
                }
            }
            return { threadId: thread.id, notAdded };
        },
        // Mentions are off in the log: a line names a Member by id, and must not ping them.
        log: (line) => options.log({ content: line, allowedMentions: { parse: [] } }),
    };
}
//# sourceMappingURL=city-rotation-server.js.map