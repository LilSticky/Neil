import {
  ChannelType,
  PermissionFlagsBits,
  ThreadAutoArchiveDuration,
  type BaseMessageOptions,
} from "discord.js";

/** The longest thread name Discord accepts. */
const THREAD_NAME_LIMIT = 100;

/** A Member as the onboarding channels need them: the id to add to a thread, the name for its title. */
export interface ThreadMember {
  readonly id: string;
  readonly username: string;
}

/** The ids of the two channels Neil posts to, from configuration. */
export interface OnboardingChannelIds {
  readonly onboardingChannelId: string;
  readonly logChannelId: string;
}

/** What the Onboarding Interview needs from Discord: threads in the onboarding channel and posts to the log. */
export interface OnboardingChannels {
  openThread(member: ThreadMember): Promise<string>;
  post(threadId: string, message: BaseMessageOptions): Promise<string>;
  edit(threadId: string, messageId: string, message: BaseMessageOptions): Promise<void>;
  addToThread(threadId: string, memberId: string): Promise<void>;
  lockAndArchive(threadId: string): Promise<void>;
  archive(threadId: string): Promise<void>;
  /** Deletes the thread; a thread that is already gone is not an error. */
  deleteThread(threadId: string): Promise<void>;
  log(message: BaseMessageOptions): Promise<void>;
}

/** The part of a discord.js Guild that the onboarding channels use. Methods, not properties, keep it bivariant. */
export interface GuildLike {
  readonly members: { readonly me: { readonly id: string } | null };
  readonly channels: { fetch(id: string): Promise<ChannelLike | null> };
}

interface ChannelLike {
  readonly id: string;
  readonly type: ChannelType;
  permissionsFor(member: { readonly id: string }): { has(permission: bigint): boolean } | null;
}

interface MessageLike {
  readonly id: string;
}

interface EditableMessageLike extends MessageLike {
  edit(options: BaseMessageOptions): Promise<unknown>;
}

/** A channel or thread that can hold messages. */
interface PostableLike extends ChannelLike {
  send(options: BaseMessageOptions): Promise<MessageLike>;
  readonly messages: { fetch(id: string): Promise<EditableMessageLike | null> };
}

interface TextChannelLike extends PostableLike {
  readonly threads: { create(options: ThreadOptions): Promise<ThreadLike> };
}

interface ThreadLike extends PostableLike {
  readonly members: { add(memberId: string): Promise<unknown> };
  setLocked(locked: boolean): Promise<unknown>;
  setArchived(archived: boolean): Promise<unknown>;
  delete(): Promise<unknown>;
}

interface ThreadOptions {
  readonly name: string;
  readonly type: ChannelType;
  readonly invitable: boolean;
  readonly autoArchiveDuration: ThreadAutoArchiveDuration;
}

type ChannelName = "onboarding" | "log";

type PermissionName = "ViewChannel" | "SendMessagesInThreads" | "CreatePrivateThreads" | "ManageThreads" | "SendMessages";

/** A problem with the onboarding or log channel, reported at ready (FR-018). */
export type ChannelProblem =
  | { readonly kind: "missing-channel"; readonly channel: ChannelName }
  | { readonly kind: "not-text-channel"; readonly channel: ChannelName }
  | { readonly kind: "missing-permission"; readonly channel: ChannelName; readonly permission: PermissionName };

/** The bot permissions the onboarding channel needs (research R2). */
const ONBOARDING_PERMISSIONS: readonly PermissionName[] = [
  "ViewChannel",
  "SendMessagesInThreads",
  "CreatePrivateThreads",
  "ManageThreads",
];

/** The bot permissions the log channel needs (research R2). */
const LOG_PERMISSIONS: readonly PermissionName[] = ["ViewChannel", "SendMessages"];

const THREAD_TYPES: readonly ChannelType[] = [
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
];

function isTextChannel(channel: ChannelLike): channel is TextChannelLike {
  return channel.type === ChannelType.GuildText;
}

function isThread(channel: ChannelLike): channel is ThreadLike {
  return THREAD_TYPES.includes(channel.type);
}

async function fetchTextChannel(guild: GuildLike, id: string, channel: ChannelName): Promise<TextChannelLike> {
  const found = await guild.channels.fetch(id);
  if (found === null || !isTextChannel(found)) {
    throw new Error(`The ${channel} channel is missing or is not a text channel.`);
  }
  return found;
}

async function fetchThread(guild: GuildLike, threadId: string): Promise<ThreadLike> {
  const found = await guild.channels.fetch(threadId);
  if (found === null || !isThread(found)) {
    throw new Error("The Interview thread is missing.");
  }
  return found;
}

/** The onboarding channels as the Onboarding Interview uses them, built from a discord.js guild. */
export function createOnboardingChannels(guild: GuildLike, ids: OnboardingChannelIds): OnboardingChannels {
  return {
    async openThread(member) {
      const onboarding = await fetchTextChannel(guild, ids.onboardingChannelId, "onboarding");
      const thread = await onboarding.threads.create({
        name: `Interview – ${member.username}`.slice(0, THREAD_NAME_LIMIT),
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
      if (target === null) throw new Error("The Interview message is missing.");
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
      if (found === null) return;
      if (!isThread(found)) throw new Error("The Interview thread is not a thread.");
      await found.delete();
    },

    async log(message) {
      const log = await fetchTextChannel(guild, ids.logChannelId, "log");
      await log.send(message);
    },
  };
}

async function checkChannel(
  guild: GuildLike,
  channel: ChannelName,
  id: string,
  permissions: readonly PermissionName[],
): Promise<ChannelProblem[]> {
  const found = await guild.channels.fetch(id);
  if (found === null) return [{ kind: "missing-channel", channel }];
  if (!isTextChannel(found)) return [{ kind: "not-text-channel", channel }];
  const me = guild.members.me;
  const granted = me === null ? null : found.permissionsFor(me);
  return permissions
    .filter((permission) => granted?.has(PermissionFlagsBits[permission]) !== true)
    .map((permission): ChannelProblem => ({ kind: "missing-permission", channel, permission }));
}

/** Every problem with the two channels: missing, not a text channel, or a permission the bot lacks. */
export async function checkChannels(guild: GuildLike, ids: OnboardingChannelIds): Promise<ChannelProblem[]> {
  return [
    ...(await checkChannel(guild, "onboarding", ids.onboardingChannelId, ONBOARDING_PERMISSIONS)),
    ...(await checkChannel(guild, "log", ids.logChannelId, LOG_PERMISSIONS)),
  ];
}
