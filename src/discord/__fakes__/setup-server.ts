import type { ChannelType } from "../../domain/server-layout.js";
import type {
  BotMemberInfo,
  ForumPostInfo,
  ForumTag,
  GuildInfo,
  OverwriteEdit,
  SetupChannelInfo,
  SetupPinInfo,
  SetupRoleInfo,
  SetupServer,
} from "../server-setup.js";

/** The bot's name for its own managed role in the fakes. */
const BOT_ROLE_NAME = "Neil";

/** The id of the fake guild unless a test gives another one. */
const DEFAULT_GUILD_ID = "100000000000000000";
/** The user id of Neil in the fakes unless a test gives another one. */
const DEFAULT_BOT_USER_ID = "1000000000000000099";
/** Position of Neil's managed role in the fakes: above every role a test defines by default. */
const BOT_ROLE_POSITION = 10;

/** A write the port received, in the order it was attempted (failed attempts included). */
export type SetupWrite =
  | { readonly op: "create-role"; readonly name: string }
  | { readonly op: "create-category"; readonly name: string; readonly overwrites: readonly OverwriteEdit[] }
  | {
      readonly op: "create-channel";
      readonly name: string;
      readonly type: ChannelType;
      readonly parentId: string;
      readonly overwrites: readonly OverwriteEdit[];
    }
  | { readonly op: "edit-overwrites"; readonly channelId: string; readonly overwrites: readonly OverwriteEdit[] }
  | { readonly op: "edit-role"; readonly roleId: string; readonly permissions: bigint };

export type SetupWriteOp = SetupWrite["op"];

/** A write that sets a topic or a pinned description, in the order it was attempted. */
export type ChannelWrite =
  | { readonly op: "set-topic"; readonly channelId: string; readonly topic: string }
  | { readonly op: "post-pinned-message"; readonly channelId: string; readonly content: string }
  | { readonly op: "post-message"; readonly channelId: string; readonly content: string }
  | { readonly op: "edit-message"; readonly channelId: string; readonly messageId: string; readonly content: string };

/** A role the fake guild holds: the options a test may give when defining it. */
export interface DefineRoleOptions {
  readonly permissions?: bigint;
  readonly position?: number;
  readonly managed?: boolean;
  /** Whether Neil's member holds the role. */
  readonly held?: boolean;
}

/** A channel or category the fake guild holds. `kind` is "category" for a category. */
export interface DefineChannelOptions {
  readonly kind: "category" | ChannelType;
  readonly parentId?: string;
  readonly overwrites?: readonly OverwriteEdit[];
  /** The channel's topic; left out when the channel has none. */
  readonly topic?: string;
  /** A forum's tags, by name; the fake gives each an id. Only a forum has tags. */
  readonly tags?: readonly string[];
  /** A forum's default reaction, by emoji name; left out when it has none. */
  readonly reaction?: string;
}

/** A pinned message a test seeds into a channel: its author and its content. */
export interface DefinePinOptions {
  readonly authorId: string;
  readonly content: string;
}

/** A post a test seeds into a forum: its author, title and starter content, and whether it is archived or pinned. */
export interface DefinePostOptions {
  readonly authorId: string;
  readonly title: string;
  readonly content: string;
  readonly archived?: boolean;
  readonly pinned?: boolean;
}

/** A post of a forum as the fake keeps it. */
interface FakePost {
  readonly threadId: string;
  readonly forumId: string;
  authorId: string;
  title: string;
  content: string;
  archived: boolean;
  pinned: boolean;
}

/**
 * An in-memory Discord server for the setup script. It stores what the port reads and applies what the port writes, and
 * logs every write attempt in `writes`. A write named in `failWrite` throws its error and changes nothing.
 */
export class FakeSetupServer implements SetupServer {
  /** Every write attempt, in order, failed ones included. */
  readonly writes: SetupWrite[] = [];
  /** The topic and pinned-message writes, in order. */
  readonly channelWrites: ChannelWrite[] = [];
  /** Every write attempt of any kind, in order, as `<op> <name>` (the channel's or role's name); failed ones included. */
  readonly sequence: string[] = [];

  readonly guildId: string;
  readonly botUserId: string;

  private readonly guildFeatures: readonly string[];
  private readonly roles: SetupRoleInfo[] = [];
  private readonly channels: SetupChannelInfo[] = [];
  private readonly pins = new Map<string, SetupPinInfo[]>();
  private readonly botRoleIds: string[] = [];
  private readonly failures = new Map<string, Error>();
  private readonly refusedPinReads = new Set<string>();
  private readonly refusedForumReads = new Set<string>();
  private readonly posts: FakePost[] = [];
  private nextNumber = 1;

  constructor(
    options: {
      readonly guildId?: string;
      readonly botUserId?: string;
      readonly features?: readonly string[];
      /** The permissions of @everyone. */
      readonly everyonePermissions?: bigint;
      /** The permissions of Neil's managed role, which Neil's member holds. */
      readonly botPermissions?: bigint;
    } = {},
  ) {
    this.guildId = options.guildId ?? DEFAULT_GUILD_ID;
    this.botUserId = options.botUserId ?? DEFAULT_BOT_USER_ID;
    this.guildFeatures = options.features ?? [];
    this.roles.push({
      id: this.guildId,
      name: "@everyone",
      permissions: options.everyonePermissions ?? 0n,
      managed: false,
      position: 0,
    });
    const botRoleId = this.newId();
    this.roles.push({
      id: botRoleId,
      name: BOT_ROLE_NAME,
      permissions: options.botPermissions ?? 0n,
      managed: true,
      position: BOT_ROLE_POSITION,
    });
    this.botRoleIds.push(botRoleId);
  }

  /** Defines a role the server already has, and returns its id. */
  defineRole(name: string, options: DefineRoleOptions = {}): string {
    const id = this.newId();
    this.roles.push({
      id,
      name,
      permissions: options.permissions ?? 0n,
      managed: options.managed ?? false,
      position: options.position ?? 1,
    });
    if (options.held === true) this.botRoleIds.push(id);
    return id;
  }

  /** Defines a channel or category the server already has, and returns its id. */
  defineChannel(name: string, options: DefineChannelOptions): string {
    const id = this.newId();
    this.channels.push({
      id,
      name,
      kind: options.kind,
      parentId: options.parentId,
      overwrites: [...(options.overwrites ?? [])],
      topic: options.topic,
      ...(options.kind === "forum"
        ? {
            tags: (options.tags ?? []).map((tagName) => ({ id: this.newId(), name: tagName, moderated: false, emojiId: null, emojiName: null })),
            reaction: options.reaction,
          }
        : {}),
    });
    return id;
  }

  /** Seeds a pinned message into a channel, as the newest pin so far, and returns its id. Seed the oldest first. */
  definePin(channelId: string, pin: DefinePinOptions): string {
    const messageId = this.newId();
    const pins = this.pins.get(channelId) ?? [];
    pins.push({ messageId, authorId: pin.authorId, content: pin.content });
    this.pins.set(channelId, pins);
    return messageId;
  }

  /** Seeds a post into a forum, and returns its thread id. */
  definePost(forumId: string, post: DefinePostOptions): string {
    const threadId = this.newId();
    this.posts.push({
      threadId,
      forumId,
      authorId: post.authorId,
      title: post.title,
      content: post.content,
      archived: post.archived ?? false,
      pinned: post.pinned ?? false,
    });
    return threadId;
  }

  /** Makes every attempt of this write fail with `error`: `name` is the role, category or channel name (of the channel, for an edit). */
  failWrite(op: SetupWriteOp, name: string, error: Error): void {
    this.failures.set(`${op}:${name}`, error);
  }

  /** Lets every write that failed before succeed again, as after the owner has fixed the cause. */
  clearFailures(): void {
    this.failures.clear();
  }

  findRole(name: string): SetupRoleInfo | undefined {
    return this.roles.find((role) => role.name === name);
  }

  findChannel(name: string): SetupChannelInfo | undefined {
    return this.channels.find((channel) => channel.name === name);
  }

  readGuild(): Promise<GuildInfo> {
    return Promise.resolve({ id: this.guildId, features: [...this.guildFeatures] });
  }

  readBotMember(): Promise<BotMemberInfo> {
    return Promise.resolve({ userId: this.botUserId, roleIds: [...this.botRoleIds] });
  }

  readRoles(): Promise<readonly SetupRoleInfo[]> {
    return Promise.resolve(this.roles.map((role) => ({ ...role })));
  }

  readChannels(): Promise<readonly SetupChannelInfo[]> {
    return Promise.resolve(this.channels.map((channel) => ({ ...channel, overwrites: [...channel.overwrites] })));
  }

  createRole(name: string): Promise<string> {
    this.writes.push({ op: "create-role", name });
    this.sequence.push(`create-role ${name}`);
    const failure = this.failures.get(`create-role:${name}`);
    if (failure !== undefined) return Promise.reject(failure);
    const id = this.newId();
    this.roles.push({ id, name, permissions: 0n, managed: false, position: 1 });
    return Promise.resolve(id);
  }

  createCategory(name: string, overwrites: readonly OverwriteEdit[]): Promise<string> {
    this.writes.push({ op: "create-category", name, overwrites: [...overwrites] });
    this.sequence.push(`create-category ${name}`);
    const failure = this.failures.get(`create-category:${name}`);
    if (failure !== undefined) return Promise.reject(failure);
    const id = this.newId();
    this.channels.push({ id, name, kind: "category", parentId: undefined, overwrites: [...overwrites], topic: undefined });
    return Promise.resolve(id);
  }

  createChannel(channel: {
    readonly name: string;
    readonly type: ChannelType;
    readonly parentId: string;
    readonly overwrites: readonly OverwriteEdit[];
    readonly topic: string | undefined;
  }): Promise<string> {
    this.writes.push({
      op: "create-channel",
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId,
      overwrites: [...channel.overwrites],
    });
    this.sequence.push(`create-channel ${channel.name}`);
    const failure = this.failures.get(`create-channel:${channel.name}`);
    if (failure !== undefined) return Promise.reject(failure);
    const id = this.newId();
    this.channels.push({
      id,
      name: channel.name,
      kind: channel.type,
      parentId: channel.parentId,
      overwrites: [...channel.overwrites],
      topic: channel.topic,
      ...(channel.type === "forum" ? { tags: [], reaction: undefined } : {}),
    });
    return Promise.resolve(id);
  }

  editOverwrites(channelId: string, overwrites: readonly OverwriteEdit[]): Promise<void> {
    this.writes.push({ op: "edit-overwrites", channelId, overwrites: [...overwrites] });
    const name = this.nameOf(channelId);
    this.sequence.push(`edit-overwrites ${name}`);
    const failure = this.failures.get(`edit-overwrites:${name}`);
    if (failure !== undefined) return Promise.reject(failure);
    const channel = this.channels.find((candidate) => candidate.id === channelId);
    if (channel !== undefined) channel.overwrites = [...overwrites];
    return Promise.resolve();
  }

  /** Sets a role's whole permission bit field, as Discord's role edit does; a failure is keyed by the role's name. */
  editRolePermissions(roleId: string, permissions: bigint): Promise<void> {
    const role = this.roles.find((candidate) => candidate.id === roleId);
    const name = role?.name ?? roleId;
    this.writes.push({ op: "edit-role", roleId, permissions });
    this.sequence.push(`edit-role ${name}`);
    const failure = this.failures.get(`edit-role:${name}`);
    if (failure !== undefined) return Promise.reject(failure);
    if (role !== undefined) role.permissions = permissions;
    return Promise.resolve();
  }

  setTopic(channelId: string, topic: string): Promise<void> {
    this.channelWrites.push({ op: "set-topic", channelId, topic });
    this.sequence.push(`set-topic ${this.nameOf(channelId)}`);
    const channel = this.channels.find((candidate) => candidate.id === channelId);
    if (channel !== undefined) channel.topic = topic;
    return Promise.resolve();
  }

  /** Makes the pin read of this channel answer undefined, as Discord's 403 does for a channel Neil cannot see. */
  refusePinReads(name: string): void {
    this.refusedPinReads.add(name);
  }

  /** The pins newest first, as Discord lists them; undefined for a channel whose pin read is refused. */
  readPins(channelId: string): Promise<readonly SetupPinInfo[] | undefined> {
    if (this.refusedPinReads.has(this.nameOf(channelId))) return Promise.resolve(undefined);
    return Promise.resolve((this.pins.get(channelId) ?? []).map((pin) => ({ ...pin })).reverse());
  }

  postPinnedMessage(channelId: string, content: string): Promise<string> {
    this.channelWrites.push({ op: "post-pinned-message", channelId, content });
    this.sequence.push(`post-pinned-message ${this.nameOf(channelId)}`);
    if (this.channels.find((channel) => channel.id === channelId)?.kind === "voice") {
      return Promise.reject(new Error("This message cannot be pinned in this channel"));
    }
    const messageId = this.newId();
    const pins = this.pins.get(channelId) ?? [];
    pins.push({ messageId, authorId: this.botUserId, content });
    this.pins.set(channelId, pins);
    return Promise.resolve(messageId);
  }

  /** A voice channel's messages, oldest first: Neil's unpinned descriptions, kept with the pins. */
  readOldestMessages(channelId: string): Promise<readonly SetupPinInfo[] | undefined> {
    if (this.refusedPinReads.has(this.nameOf(channelId))) return Promise.resolve(undefined);
    return Promise.resolve((this.pins.get(channelId) ?? []).map((pin) => ({ ...pin })));
  }

  postMessage(channelId: string, content: string): Promise<string> {
    this.channelWrites.push({ op: "post-message", channelId, content });
    this.sequence.push(`post-message ${this.nameOf(channelId)}`);
    const messageId = this.newId();
    const messages = this.pins.get(channelId) ?? [];
    messages.push({ messageId, authorId: this.botUserId, content });
    this.pins.set(channelId, messages);
    return Promise.resolve(messageId);
  }

  editMessage(channelId: string, messageId: string, content: string): Promise<void> {
    this.channelWrites.push({ op: "edit-message", channelId, messageId, content });
    this.sequence.push(`edit-message ${this.nameOf(channelId)}`);
    const pin = (this.pins.get(channelId) ?? []).find((candidate) => candidate.messageId === messageId);
    if (pin !== undefined) pin.content = content;
    return Promise.resolve();
  }

  setForumTags(channelId: string, tags: readonly ForumTag[]): Promise<void> {
    this.sequence.push(`set-forum-tags ${this.nameOf(channelId)}`);
    const channel = this.channels.find((candidate) => candidate.id === channelId);
    if (channel !== undefined) {
      channel.tags = tags.map((tag) => ({
        id: tag.id ?? this.newId(),
        name: tag.name,
        moderated: tag.moderated ?? false,
        emojiId: tag.emojiId ?? null,
        emojiName: tag.emojiName ?? null,
      }));
    }
    return Promise.resolve();
  }

  setForumReaction(channelId: string, emojiName: string): Promise<void> {
    this.sequence.push(`set-forum-reaction ${this.nameOf(channelId)}`);
    const channel = this.channels.find((candidate) => candidate.id === channelId);
    if (channel !== undefined) channel.reaction = emojiName;
    return Promise.resolve();
  }

  /** Makes the post reads of this forum answer undefined, as Discord's 403 does for the archived posts Neil cannot see. */
  refuseForumPostReads(name: string): void {
    this.refusedForumReads.add(name);
  }

  /** The posts of a forum, active and archived; undefined for a forum whose post reads are refused. */
  readForumPosts(forumId: string): Promise<readonly ForumPostInfo[] | undefined> {
    if (this.refusedForumReads.has(this.nameOf(forumId))) return Promise.resolve(undefined);
    const posts = this.posts
      .filter((post) => post.forumId === forumId)
      .map((post) => ({
        threadId: post.threadId,
        ownerId: post.authorId,
        title: post.title,
        content: post.content,
        archived: post.archived,
        pinned: post.pinned,
      }));
    return Promise.resolve(posts);
  }

  openForumPost(forumId: string, title: string, content: string): Promise<string> {
    this.sequence.push(`open-forum-post ${this.nameOf(forumId)}`);
    return Promise.resolve(this.definePost(forumId, { authorId: this.botUserId, title, content }));
  }

  pinForumPost(threadId: string, unarchive: boolean): Promise<void> {
    const post = this.postOf(threadId);
    this.sequence.push(`pin-forum-post ${this.nameOf(post?.forumId ?? threadId)}`);
    if (post === undefined) return Promise.resolve();
    if (unarchive) post.archived = false;
    post.pinned = true;
    return Promise.resolve();
  }

  editForumPost(threadId: string, title: string, content: string, unarchive: boolean): Promise<void> {
    const post = this.postOf(threadId);
    this.sequence.push(`edit-forum-post ${this.nameOf(post?.forumId ?? threadId)}`);
    if (post === undefined) return Promise.resolve();
    post.title = title;
    post.content = content;
    if (unarchive) post.archived = false;
    return Promise.resolve();
  }

  private postOf(threadId: string): FakePost | undefined {
    return this.posts.find((post) => post.threadId === threadId);
  }

  private nameOf(channelId: string): string {
    return this.channels.find((channel) => channel.id === channelId)?.name ?? channelId;
  }

  private newId(): string {
    const id = (100000000000000000n + BigInt(this.nextNumber)).toString();
    this.nextNumber += 1;
    return id;
  }
}
