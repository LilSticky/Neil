import { ChannelType, RESTJSONErrorCodes } from "discord.js";
import { z } from "zod";
/** Discord's answer when the message to edit is gone. */
const unknownMessage = z.object({ code: z.literal(RESTJSONErrorCodes.UnknownMessage) });
function isMessageChannel(channel) {
    return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
}
/**
 * The Discord server as the King Move uses it: the configured King role (and no other role), its cards in #neil-log, and
 * one line per step there, with mentions off.
 */
export function kingMoveServerOf(guild, options) {
    async function logChannel() {
        const channel = await guild.channels.fetch(options.logChannelId);
        if (channel === null || !isMessageChannel(channel)) {
            throw new Error(`The log channel ${options.logChannelId} is not a text channel.`);
        }
        return channel;
    }
    return {
        async kingHolders() {
            const members = await guild.everyMember();
            return members.filter((member) => member.roleIds.includes(options.kingRoleId)).map((member) => member.id);
        },
        isOnServer: (memberId) => guild.isOnServer(memberId),
        async giveKing(memberId) {
            await guild.addRole(memberId, options.kingRoleId);
        },
        async takeKing(memberId) {
            await guild.removeRole(memberId, options.kingRoleId);
        },
        async postCard(message) {
            const sent = await (await logChannel()).send(message);
            return sent.id;
        },
        async editCard(messageId, message) {
            const channel = await logChannel();
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
        // Mentions are off in the log: a line names a Member by id, and must not ping them.
        log: (line) => options.log({ content: line, allowedMentions: { parse: [] } }),
    };
}
//# sourceMappingURL=king-move-server.js.map