import { ChannelType, MessageType, type BaseMessageOptions } from "discord.js";
import {
  FEEDBACK_CHANNELS,
  FEEDBACK_TEMPLATE,
  feedbackEntry,
  missingChannelLine,
  incompleteEntryLine,
  pinFailedLine,
  reactionFailedLine,
  type FeedbackPostView,
} from "./feedback-texts.js";

/** The reaction that marks a Feedback Post as forwarded to #neil-log. */
const FORWARDED_EMOJI = "📝";

/** Plain messages and replies are Feedback Posts; system messages (joins, thread created, pins) are not. */
const FEEDBACK_MESSAGE_TYPES: readonly MessageType[] = [MessageType.Default, MessageType.Reply];

const THREAD_TYPES: readonly ChannelType[] = [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread];

/** A channel as a message reports it: a text channel, or a thread whose parent is the channel it is under. */
export interface FeedbackChannelLike {
  readonly id: string;
  readonly name: string;
  readonly type: ChannelType;
  readonly parent: { readonly name: string } | null;
}

/** A message as the Feedback adapter reads it from Discord; only the fields Neil uses. */
export interface FeedbackMessageLike {
  readonly id: string;
  readonly url: string;
  readonly guildId: string | null;
  readonly type: MessageType;
  readonly content: string;
  readonly webhookId: string | null;
  readonly author: { readonly id: string; readonly bot: boolean };
  readonly member: { readonly nickname: string | null; readonly displayName: string } | null;
  readonly channel: FeedbackChannelLike;
  readonly attachments: ReadonlyMap<string, { readonly url: string }>;
  readonly stickers: ReadonlyMap<string, { readonly name: string }>;
  readonly embeds: readonly unknown[];
  react(emoji: string): Promise<unknown>;
}

/** A pinned message, as far as the template check needs it. */
export interface FeedbackPinnedLike {
  readonly content: string;
  readonly author: { readonly id: string };
}

/** A text channel that can receive Neil's template and pin it. */
export interface FeedbackTextChannelLike extends FeedbackChannelLike {
  send(message: BaseMessageOptions): Promise<{ readonly id: string }>;
  readonly messages: {
    fetchPinned(): Promise<ReadonlyMap<string, FeedbackPinnedLike>>;
    pin(messageId: string): Promise<void>;
  };
}

/** The part of a discord.js Guild that the Feedback adapter uses: its text channels, by id. */
export interface FeedbackGuildLike {
  readonly channels: { readonly cache: ReadonlyMap<string, FeedbackTextChannelLike> };
}

export interface FeedbackOptions {
  readonly guild: FeedbackGuildLike;
  readonly neilId: string;
  /** Writes one message to #neil-log. Mentions must be off in every message. */
  readonly log: (message: BaseMessageOptions) => Promise<void>;
  readonly logError: (error: unknown) => void;
}

export interface Feedback {
  /** Logs a Feedback Post to #neil-log, then reacts to it; never throws. */
  forward(post: FeedbackMessageLike): Promise<void>;
  /** Pins the Feedback Template in each feedback channel that does not have it; never throws. */
  pinTemplates(): Promise<void>;
}

/** The name of the channel a message is in, or of the channel a thread is under. */
function feedbackChannelNameOf(channel: FeedbackChannelLike): string | undefined {
  if (THREAD_TYPES.includes(channel.type)) return channel.parent?.name;
  if (channel.type === ChannelType.GuildText) return channel.name;
  return undefined;
}

/** Whether a message is a Member's post in #feedback or #suggestions, or in a thread under one of them. */
export function isFeedbackPost(message: FeedbackMessageLike, guildId: string): boolean {
  if (message.guildId !== guildId || message.author.bot || message.webhookId !== null) return false;
  if (!FEEDBACK_MESSAGE_TYPES.includes(message.type)) return false;
  const channelName = feedbackChannelNameOf(message.channel);
  return FEEDBACK_CHANNELS.some((feedbackName) => feedbackName === channelName);
}

/** The entry's view of a Feedback Post, or nothing when the post is not in a channel Neil can name. */
function feedbackPostView(post: FeedbackMessageLike): FeedbackPostView | undefined {
  const { channel } = post;
  const channelName = feedbackChannelNameOf(channel);
  if (channelName === undefined) return undefined;
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
async function logLine(options: FeedbackOptions, content: string): Promise<void> {
  try {
    await options.log({ content, allowedMentions: { parse: [] } });
  } catch (error) {
    options.logError(error);
  }
}

function textChannelNamed(options: FeedbackOptions, name: string): FeedbackTextChannelLike | undefined {
  return [...options.guild.channels.cache.values()].find(
    (channel) => channel.type === ChannelType.GuildText && channel.name === name,
  );
}

/** Posts and pins the template in one channel, unless the template Neil posted is already pinned there. */
async function pinTemplateIn(channel: FeedbackTextChannelLike, neilId: string): Promise<void> {
  const pinned = await channel.messages.fetchPinned();
  const alreadyPinned = [...pinned.values()].some(
    (message) => message.author.id === neilId && message.content === FEEDBACK_TEMPLATE,
  );
  if (alreadyPinned) return;
  const sent = await channel.send({ content: FEEDBACK_TEMPLATE, allowedMentions: { parse: [] } });
  await channel.messages.pin(sent.id);
}

/** Logs a post's entry part by part, then reacts; a failure part-way writes one line that the entry is incomplete. */
async function forwardOne(options: FeedbackOptions, post: FeedbackMessageLike): Promise<void> {
  const view = feedbackPostView(post);
  if (view === undefined) return;
  let logged = 0;
  try {
    for (const part of feedbackEntry(view)) {
      await options.log({ content: part, allowedMentions: { parse: [] } });
      logged += 1;
    }
  } catch (error) {
    options.logError(error);
    if (logged > 0) await logLine(options, incompleteEntryLine(post.url));
    return;
  }
  try {
    await post.react(FORWARDED_EMOJI);
  } catch (error) {
    options.logError(error);
    await logLine(options, reactionFailedLine(FORWARDED_EMOJI, post.url));
  }
}

export function createFeedback(options: FeedbackOptions): Feedback {
  // Posts are forwarded one at a time, in the order they arrive, so the parts of two entries never interleave.
  let queue: Promise<void> = Promise.resolve();
  return {
    forward(post) {
      queue = queue.then(() => forwardOne(options, post));
      return queue;
    },

    async pinTemplates() {
      const problems: string[] = [];
      for (const name of FEEDBACK_CHANNELS) {
        const channel = textChannelNamed(options, name);
        if (channel === undefined) {
          problems.push(missingChannelLine(name));
          continue;
        }
        try {
          await pinTemplateIn(channel, options.neilId);
        } catch (error) {
          options.logError(error);
          problems.push(pinFailedLine(name));
        }
      }
      if (problems.length > 0) await logLine(options, problems.join("\n"));
    },
  };
}
