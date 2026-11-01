import { BOT_MEMBER_ID, FakeGuild, type FakeChannelOptions } from "./guild.js";

/** Discord's code for a user who is not a member of the guild. */
const UNKNOWN_MEMBER = 10007;

/**
 * The guild connect reads at startup, as a fake: the channels (checked, then written to), the members on the server
 * (only the ids joined count), and the bot's own member with the permissions it holds in the server.
 */
export class FakeConnectGuild {
  readonly id = "123456789012345678";
  readonly ownerId = "900000000000000001";
  private readonly channelStore = new FakeGuild();
  private readonly joined = new Set<string>();

  readonly channels = this.channelStore.channels;

  readonly members = {
    me: {
      id: BOT_MEMBER_ID,
      permissions: { has: (permission: bigint): boolean => this.serverPermissions.includes(permission) },
      roles: { highest: { position: 10 } },
    },
    fetch: (memberId: string): Promise<{ readonly id: string }> => {
      if (this.joined.has(memberId)) return Promise.resolve({ id: memberId });
      return Promise.reject(Object.assign(new Error("Unknown Member"), { code: UNKNOWN_MEMBER }));
    },
  };

  /** @param serverPermissions the permission bits the bot holds in the server */
  constructor(private readonly serverPermissions: readonly bigint[]) {}

  addChannel(id: string, options: FakeChannelOptions): void {
    this.channelStore.addChannel(id, options);
  }

  join(memberId: string): void {
    this.joined.add(memberId);
  }

  /** The text of every message posted to the channel, in order. */
  messagesIn(channelId: string): string[] {
    return this.channelStore.get(channelId).sent.map((message) => message.content);
  }
}
