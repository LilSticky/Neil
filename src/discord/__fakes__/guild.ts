import type { ChannelType } from "discord.js";

/** The bot's own member id in the fakes: permission checks of a channel are for this member. */
export const BOT_MEMBER_ID = "1000000000000000099";

/** A message in a fake channel or thread: its id and its current text, which an edit replaces in place. */
export class FakeMessage {
  content: string;

  constructor(
    readonly id: string,
    content: string,
  ) {
    this.content = content;
  }

  edit(options: { readonly content: string }): Promise<FakeMessage> {
    this.content = options.content;
    return Promise.resolve(this);
  }
}

/** The options a thread is created with, as the adapter passes them to channel.threads.create. */
export interface FakeThreadOptions {
  readonly name: string;
  readonly type: ChannelType;
  readonly invitable?: boolean;
  readonly autoArchiveDuration?: number;
}

/** A channel of the fake guild: its type and the permission bit flags the bot holds in it. */
export interface FakeChannelOptions {
  readonly type: ChannelType;
  readonly botPermissions?: readonly bigint[];
}

/** A text channel or a thread of the fake guild; it records what the adapter did to it. */
export class FakeChannel {
  /** Messages sent here, in order, with their current text. */
  readonly sent: FakeMessage[] = [];
  /** Ids of the members added to this thread. */
  readonly memberIds = new Set<string>();
  locked = false;
  archived = false;

  /** The channel.threads manager: creating a thread registers it in the guild. */
  readonly threads = {
    create: (options: FakeThreadOptions): Promise<FakeChannel> =>
      Promise.resolve(this.guild.addThread(this.id, options)),
  };

  /** The thread member manager: adding a member records their id. */
  readonly members = {
    add: (memberId: string): Promise<void> => {
      this.memberIds.add(memberId);
      return Promise.resolve();
    },
  };

  /** The message manager: fetching an id that was never sent gives null. */
  readonly messages = {
    fetch: (id: string): Promise<FakeMessage | null> =>
      Promise.resolve(this.sent.find((message) => message.id === id) ?? null),
  };

  constructor(
    private readonly guild: FakeGuild,
    readonly id: string,
    readonly type: ChannelType,
    private readonly botPermissions: readonly bigint[],
    /** Set on threads only: how the thread was created. */
    readonly threadOptions: FakeThreadOptions | undefined,
    /** Set on threads only: the text channel the thread was created in. */
    readonly parentId: string | undefined,
  ) {}

  send(options: { readonly content: string }): Promise<FakeMessage> {
    const message = new FakeMessage(String(this.sent.length + 1), options.content);
    this.sent.push(message);
    return Promise.resolve(message);
  }

  /** The bot's permissions in this channel; null for any other member. */
  permissionsFor(member: { readonly id: string }): { has(permission: bigint): boolean } | null {
    if (member.id !== BOT_MEMBER_ID) return null;
    return { has: (permission: bigint) => this.botPermissions.includes(permission) };
  }

  setLocked(locked: boolean): Promise<FakeChannel> {
    this.locked = locked;
    return Promise.resolve(this);
  }

  setArchived(archived: boolean): Promise<FakeChannel> {
    this.archived = archived;
    return Promise.resolve(this);
  }

  /** Deletes the channel or thread from the guild: fetching its id afterwards gives null. */
  delete(): Promise<FakeChannel> {
    this.guild.remove(this.id);
    return Promise.resolve(this);
  }
}

/** A guild of the fakes: channels by id, the bot's member, and the threads created so far. */
export class FakeGuild {
  readonly members = { me: { id: BOT_MEMBER_ID } };

  private readonly byId = new Map<string, FakeChannel>();
  private threadCount = 0;

  /** The guild channel manager: an unknown id fetches null, a thread fetches like a channel. */
  readonly channels = {
    fetch: (id: string): Promise<FakeChannel | null> => Promise.resolve(this.byId.get(id) ?? null),
  };

  addChannel(id: string, options: FakeChannelOptions): FakeChannel {
    const channel = new FakeChannel(this, id, options.type, options.botPermissions ?? [], undefined, undefined);
    this.byId.set(id, channel);
    return channel;
  }

  /** Registers a thread created under a text channel; used by FakeChannel.threads.create. */
  addThread(parentId: string, options: FakeThreadOptions): FakeChannel {
    this.threadCount += 1;
    const id = `4000000000000${String(this.threadCount).padStart(4, "0")}`;
    const thread = new FakeChannel(this, id, options.type, [], options, parentId);
    this.byId.set(id, thread);
    return thread;
  }

  /** Removes the channel or thread with this id, as a deletion does on Discord. */
  remove(id: string): void {
    this.byId.delete(id);
  }

  /** The channel or thread with this id; throws when the fake does not have it. */
  get(id: string): FakeChannel {
    const channel = this.byId.get(id);
    if (channel === undefined) throw new Error(`the fake guild has no channel ${id}`);
    return channel;
  }

  /** The threads created so far, in creation order. */
  createdThreads(): FakeChannel[] {
    return [...this.byId.values()].filter((channel) => channel.threadOptions !== undefined);
  }
}
