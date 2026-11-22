import { ChannelType, MessageType } from "discord.js";
import { FEEDBACK_CHANNELS, FEEDBACK_TEMPLATE, feedbackEntry, missingChannelLine, incompleteEntryLine, pinFailedLine, reactionFailedLine, } from "./feedback-texts.js";
/** The reaction that marks a Feedback Post as forwarded to #neil-log. */
const FORWARDED_EMOJI = "📝";
/** Plain messages and replies are Feedback Posts; system messages (joins, thread created, pins) are not. */
const FEEDBACK_MESSAGE_TYPES = [MessageType.Default, MessageType.Reply];
const THREAD_TYPES = [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread];
/** The name of the channel a message is in, or of the channel a thread is under. */
function feedbackChannelNameOf(channel) {
    if (THREAD_TYPES.includes(channel.type))
        return channel.parent?.name;
    if (channel.type === ChannelType.GuildText)
        return channel.name;
    return undefined;
}
/** Whether a message is a Member's post in #feedback or #suggestions, or in a thread under one of them. */
export function isFeedbackPost(message, guildId) {
    if (message.guildId !== guildId || message.author.bot || message.webhookId !== null)
        return false;
    if (!FEEDBACK_MESSAGE_TYPES.includes(message.type))
        return false;
    const channelName = feedbackChannelNameOf(message.channel);
    return FEEDBACK_CHANNELS.some((feedbackName) => feedbackName === channelName);
}
/** The entry's view of a Feedback Post, or nothing when the post is not in a channel Neil can name. */
function feedbackPostView(post) {
    const { channel } = post;
    const channelName = feedbackChannelNameOf(channel);
    if (channelName === undefined)
        return undefined;
    const isThread = THREAD_TYPES.includes(channel.type);
    const memberName = post.member === null ? `<@${post.author.id}>` : (post.member.nickname ?? post.member.displayName);
    return {
        channelName,
        ...(isThread ? { threadName: channel.name } : {}),
        memberName,
        text: post.content,
        attachmentUrls: [...post.attachments.values()].map((attachment) => attachment.url),
        stickerNames: [...post.stickers.values()].map((sticker) => sticker.name),
        hasEmbeds: post.embeds.length > 0,
        jumpLink: post.url,
    };
}
/** One #neil-log line; a failure to write it is reported to the console, not thrown. */
async function logLine(options, content) {
    try {
        await options.log({ content, allowedMentions: { parse: [] } });
    }
    catch (error) {
        options.logError(error);
    }
}
function textChannelNamed(options, name) {
    return [...options.guild.channels.cache.values()].find((channel) => channel.type === ChannelType.GuildText && channel.name === name);
}
/** Posts and pins the template in one channel, unless the template Neil posted is already pinned there. */
async function pinTemplateIn(channel, neilId) {
    const pinned = await channel.messages.fetchPinned();
    const alreadyPinned = [...pinned.values()].some((message) => message.author.id === neilId && message.content === FEEDBACK_TEMPLATE);
    if (alreadyPinned)
        return;
    const sent = await channel.send({ content: FEEDBACK_TEMPLATE, allowedMentions: { parse: [] } });
    await channel.messages.pin(sent.id);
}
/** Logs a post's entry part by part, then reacts; a failure part-way writes one line that the entry is incomplete. */
async function forwardOne(options, post) {
    const view = feedbackPostView(post);
    if (view === undefined)
        return;
    let logged = 0;
    try {
        for (const part of feedbackEntry(view)) {
            await options.log({ content: part, allowedMentions: { parse: [] } });
            logged += 1;
        }
    }
    catch (error) {
        options.logError(error);
        if (logged > 0)
            await logLine(options, incompleteEntryLine(post.url));
        return;
    }
    try {
        await post.react(FORWARDED_EMOJI);
    }
    catch (error) {
        options.logError(error);
        await logLine(options, reactionFailedLine(FORWARDED_EMOJI, post.url));
    }
}
export function createFeedback(options) {
    // Posts are forwarded one at a time, in the order they arrive, so the parts of two entries never interleave.
    let queue = Promise.resolve();
    return {
        forward(post) {
            queue = queue.then(() => forwardOne(options, post));
            return queue;
        },
        async pinTemplates() {
            const problems = [];
            for (const name of FEEDBACK_CHANNELS) {
                const channel = textChannelNamed(options, name);
                if (channel === undefined) {
                    problems.push(missingChannelLine(name));
                    continue;
                }
                try {
                    await pinTemplateIn(channel, options.neilId);
                }
                catch (error) {
                    options.logError(error);
                    problems.push(pinFailedLine(name));
                }
            }
            if (problems.length > 0)
                await logLine(options, problems.join("\n"));
        },
    };
}
//# sourceMappingURL=feedback.js.map