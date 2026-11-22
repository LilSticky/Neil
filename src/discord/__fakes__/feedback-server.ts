import { ChannelType, MessageType, type BaseMessageOptions } from "discord.js";
import type {
  FeedbackChannelLike,
  FeedbackMessageLike,
  FeedbackOptions,
  FeedbackPinnedLike,
  FeedbackTextChannelLike,
} from "../feedback.js";

export const GUILD_ID = "100000000000000000";
export const NEIL_ID = "400000000000000001";
const MEMBER_ID = "300000000000000001";

/** #feedback in Hangout, as the guild cache holds it. */
export const FEEDBACK_CHANNEL: FeedbackChannelLike = {
  id: "200000000000000001",
  name: "feedback",
  type: ChannelType.GuildText,
  parent: null,
};

/** #suggestions in Hangout, as the guild cache holds it. */
export const SUGGESTIONS_CHANNEL: FeedbackChannelLike = {
  id: "200000000000000002",
  name: "suggestions",
  type: ChannelType.GuildText,
  parent: null,
};

/** A thread that a Member opened under a channel, as a message reports its channel. */
export function threadUnder(parent: FeedbackChannelLike, threadName: string): FeedbackChannelLike {
  return { id: "200000000000000003", name: threadName, type: ChannelType.PublicThread, parent: { name: parent.name } };
}

/** A text channel of the guild: it can be sent to and pinned in, and its pinned messages can be read. */
export class FakeFeedbackChannel implements FeedbackTextChannelLike {
  readonly id: string;
  readonly name: string;
  readonly type = ChannelType.GuildText;
  readonly parent = null;
  readonly sent: BaseMessageOptions[] = [];
  readonly sentIds: string[] = [];
  readonly pinned: string[] = [];
  readonly pinnedMessages = new Map<string, FeedbackPinnedLike>();
  pinRefusal: Error | undefined = undefined;
  readonly messages: FeedbackTextChannelLike["messages"];

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
    this.messages = {
      fetchPinned: () => Promise.resolve(new Map(this.pinnedMessages)),
      pin: (messageId) => {
        if (this.pinRefusal !== undefined) return Promise.reject(this.pinRefusal);
        this.pinned.push(messageId);
        return Promise.resolve();
      },
    };
  }

  send(message: BaseMessageOptions): Promise<{ readonly id: string }> {
    this.sent.push(message);
    const id = `81000000000000000${this.sent.length.toString()}`;
    this.sentIds.push(id);
    return Promise.resolve({ id });
  }
}

/** A Feedback Post as the fake guild reports it, with the reactions Neil added and a refusal to react when set. */
export interface FakePost extends FeedbackMessageLike {
  readonly reactions: string[];
  reactionRefusal: Error | undefined;
}

export interface PostOptions {
  readonly content?: string;
  readonly type?: MessageType;
  readonly bot?: boolean;
  readonly webhookId?: string | null;
  readonly guildId?: string;
  readonly channel?: FeedbackChannelLike;
  readonly member?: { readonly nickname: string | null; readonly displayName: string };
  readonly attachmentUrls?: readonly string[];
}

/** A message a Member posted, by default a plain message in #feedback. Reactions are recorded on `timeline`, if given. */
export function postOf(options: PostOptions = {}, timeline: string[] = []): FakePost {
  const channel = options.channel ?? FEEDBACK_CHANNEL;
  const id = "700000000000000001";
  const post: FakePost = {
    id,
    url: `https://discord.com/channels/${GUILD_ID}/${channel.id}/${id}`,
    guildId: options.guildId ?? GUILD_ID,
    type: options.type ?? MessageType.Default,
    content: options.content ?? "The map freezes when I open it",
    webhookId: options.webhookId ?? null,
    author: { id: MEMBER_ID, bot: options.bot ?? false },
    member: options.member ?? { nickname: "Sir Ann", displayName: "Annabel" },
    channel,
    attachments: new Map((options.attachmentUrls ?? []).map((url, index): [string, { readonly url: string }] => [index.toString(), { url }])),
    stickers: new Map<string, { readonly name: string }>(),
    embeds: [],
    reactions: [],
    reactionRefusal: undefined,
    react: (emoji) => {
      if (post.reactionRefusal !== undefined) return Promise.reject(post.reactionRefusal);
      post.reactions.push(emoji);
      timeline.push(`react ${emoji}`);
      return Promise.resolve();
    },
  };
  return post;
}

/**
 * The server as the Feedback adapter uses it: the guild's text channels by id, the #neil-log lines and the errors
 * logged. Nothing reaches Discord. Every #neil-log line and every reaction is written to `timeline`, in order. A log
 * line that was made to fail with `failNextLog` rejects once, and is not recorded.
 */
export class FakeFeedbackServer {
  readonly timeline: string[] = [];
  readonly logs: BaseMessageOptions[] = [];
  readonly errors: unknown[] = [];
  private readonly channels = new Map<string, FakeFeedbackChannel>();
  private logFailure: Error | undefined = undefined;
  private logFailureRule: { readonly shouldFail: (attempt: number) => boolean; readonly error: Error } | undefined =
    undefined;
  private attempts = 0;

  addChannel(channel: FeedbackChannelLike): FakeFeedbackChannel {
    const added = new FakeFeedbackChannel(channel.id, channel.name);
    this.channels.set(added.id, added);
    return added;
  }

  failNextLog(error: Error): void {
    this.logFailure = error;
  }

  /** Makes every log attempt whose 1-based number (counting from the first attempt) `shouldFail` accepts reject with `error`. */
  failLogAttempts(shouldFail: (attempt: number) => boolean, error: Error): void {
    this.logFailureRule = { shouldFail, error };
  }

  post(options: PostOptions = {}): FakePost {
    return postOf(options, this.timeline);
  }

  get options(): FeedbackOptions {
    return {
      guild: { channels: { cache: this.channels } },
      neilId: NEIL_ID,
      log: (message) => this.log(message),
      logError: (error) => {
        this.errors.push(error);
      },
    };
  }

  /** Settles after a macrotask, so that two entries forwarded at once can interleave unless they are serialized. */
  private log(message: BaseMessageOptions): Promise<void> {
    this.attempts += 1;
    const attempt = this.attempts;
    this.timeline.push("log");
    let failure: Error | undefined;
    if (this.logFailure !== undefined) {
      failure = this.logFailure;
      this.logFailure = undefined;
    } else if (this.logFailureRule?.shouldFail(attempt) === true) {
      failure = this.logFailureRule.error;
    }
    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        if (failure !== undefined) {
          reject(failure);
          return;
        }
        this.logs.push(message);
        resolve();
      }, 0);
    });
  }
}
