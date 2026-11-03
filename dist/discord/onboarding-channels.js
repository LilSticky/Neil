import { ChannelType, PermissionFlagsBits, ThreadAutoArchiveDuration, } from "discord.js";
import { interviewThreadName } from "./interview-texts.js";
/** The bot permissions the onboarding channel needs (research R2). */
const ONBOARDING_PERMISSIONS = [
    "ViewChannel",
    "SendMessagesInThreads",
    "CreatePrivateThreads",
    "ManageThreads",
];
/** The bot permissions the log channel needs (research R2). */
const LOG_PERMISSIONS = ["ViewChannel", "SendMessages"];
const THREAD_TYPES = [
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
];
function isTextChannel(channel) {
    return channel.type === ChannelType.GuildText;
}
function isThread(channel) {
    return THREAD_TYPES.includes(channel.type);
}
async function fetchTextChannel(guild, id, channel) {
    const found = await guild.channels.fetch(id);
    if (found === null || !isTextChannel(found)) {
        throw new Error(`The ${channel} channel is missing or is not a text channel.`);
    }
    return found;
}
async function fetchThread(guild, threadId) {
    const found = await guild.channels.fetch(threadId);
    if (found === null || !isThread(found)) {
        throw new Error("The Interview thread is missing.");
    }
    return found;
}
/** The onboarding channels as the Onboarding Interview uses them, built from a discord.js guild. */
export function createOnboardingChannels(guild, ids) {
    return {
        async openThread(member) {
            const onboarding = await fetchTextChannel(guild, ids.onboardingChannelId, "onboarding");
            const thread = await onboarding.threads.create({
                name: interviewThreadName(member.username),
                type: ChannelType.PrivateThread,
                invitable: false,
                autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            });
            await thread.members.add(member.id);
            return thread.id;
        },
        async post(threadId, message) {
            const thread = await fetchThread(guild, threadId);
            const sent = await thread.send(message);
            return sent.id;
        },
        async edit(threadId, messageId, message) {
            const thread = await fetchThread(guild, threadId);
            const target = await thread.messages.fetch(messageId);
            if (target === null)
                throw new Error("The Interview message is missing.");
            await target.edit(message);
        },
        async addToThread(threadId, memberId) {
            const thread = await fetchThread(guild, threadId);
            await thread.members.add(memberId);
        },
        async lockAndArchive(threadId) {
            const thread = await fetchThread(guild, threadId);
            await thread.setLocked(true);
            await thread.setArchived(true);
        },
        async archive(threadId) {
            const thread = await fetchThread(guild, threadId);
            await thread.setArchived(true);
        },
        async deleteThread(threadId) {
            const found = await guild.channels.fetch(threadId);
            if (found === null)
                return;
            if (!isThread(found))
                throw new Error("The Interview thread is not a thread.");
            await found.delete();
        },
        async log(message) {
            const log = await fetchTextChannel(guild, ids.logChannelId, "log");
            await log.send(message);
        },
    };
}
async function checkChannel(guild, channel, id, permissions) {
    const found = await guild.channels.fetch(id);
    if (found === null)
        return [{ kind: "missing-channel", channel }];
    if (!isTextChannel(found))
        return [{ kind: "not-text-channel", channel }];
    const me = guild.members.me;
    const granted = me === null ? null : found.permissionsFor(me);
    return permissions
        .filter((permission) => granted?.has(PermissionFlagsBits[permission]) !== true)
        .map((permission) => ({ kind: "missing-permission", channel, permission }));
}
/** Every problem with the two channels: missing, not a text channel, or a permission the bot lacks. */
export async function checkChannels(guild, ids) {
    return [
        ...(await checkChannel(guild, "onboarding", ids.onboardingChannelId, ONBOARDING_PERMISSIONS)),
        ...(await checkChannel(guild, "log", ids.logChannelId, LOG_PERMISSIONS)),
    ];
}
//# sourceMappingURL=onboarding-channels.js.map