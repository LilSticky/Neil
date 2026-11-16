import { ChannelType, RESTJSONErrorCodes } from "discord.js";
import { z } from "zod";
/** The channel the City Rotation card is pinned in: the original, not a translated copy. */
const ANNOUNCEMENTS_CHANNEL = "nap-announcements";
/** The R5s' and the King's room, where Neil asks for the Handover after the Royal City siege. */
const LEADERS_CHANNEL = "nap-leaders";
/** Discord's answer when the message to edit is gone. */
const unknownMessage = z.object({ code: z.literal(RESTJSONErrorCodes.UnknownMessage) });
function isMessageChannel(channel) {
    return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
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
 * The Discord server as the City Rotation uses it: #nap-announcements and #nap-leaders by name, Neil's own posts, edits
 * and pins there, and #neil-log (through `log`, with mentions off).
 */
export function cityRotationServerOf(guild, options) {
    return {
        announcementsChannelId: () => channelNamed(guild, ANNOUNCEMENTS_CHANNEL),
        leadersChannelId: () => channelNamed(guild, LEADERS_CHANNEL),
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
        // Mentions are off in the log: a line names a Member by id, and must not ping them.
        log: (line) => options.log({ content: line, allowedMentions: { parse: [] } }),
    };
}
//# sourceMappingURL=city-rotation-server.js.map