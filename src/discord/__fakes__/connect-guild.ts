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
  private readonly fetchFailures = new Map<string, number>();

  readonly channels = this.channelStore.channels;

  readonly members = {
    me: {
      id: BOT_MEMBER_ID,
      permissions: {
        has: (permission: bigint): boolean => this.serverPermissions.includes(permission),
      },
      roles: { highest: { position: 10 } },
    },
    fetch: (memberId: string): Promise<{ readonly id: string; readonly user: { readonly bot: boolean } }> => {
      const code = this.fetchFailures.get(memberId);
      if (code !== undefined) return Promise.reject(Object.assign(new Error("Discord API error"), { code }));
      if (this.joined.has(memberId)) return Promise.resolve({ id: memberId, user: { bot: false } });
      return Promise.reject(Object.assign(new Error("Unknown Member"), { code: UNKNOWN_MEMBER }));
    },
  };

  /** Makes fetching this member fail with Discord's error code, as Discord answers for a user it cannot find. */
  failFetch(memberId: string, code: number): void {
    this.fetchFailures.set(memberId, code);
  }

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
