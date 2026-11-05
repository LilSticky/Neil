import { BOT_MEMBER_ID, FakeGuild, type FakeChannelOptions } from "./guild.js";

/** Discord's code for a user who is not a member of the guild. */
const UNKNOWN_MEMBER = 10007;

/** A role of the guild as discord.js exposes it to the name and roles: id, name, managed flag, permissions and position. */
export interface ConnectRole {
  readonly id: string;
  readonly name: string;
  readonly managed: boolean;
  readonly permissions: { readonly bitfield: bigint };
  readonly position: number;
}

/** A Member of the guild as discord.js exposes it: the bot flag, the nickname, and the roles held (by id, as the cache). */
export class FakeConnectMember {
  nickname: string | null = null;
  readonly user: { readonly bot: boolean };
  readonly roles: {
    readonly cache: Map<string, ConnectRole>;
    add(roleId: string): Promise<void>;
    remove(roleId: string): Promise<void>;
  };

  constructor(
    readonly id: string,
    bot: boolean,
    guildRoles: ReadonlyMap<string, ConnectRole>,
  ) {
    this.user = { bot };
    const held = new Map<string, ConnectRole>();
    this.roles = {
      cache: held,
      add: (roleId) => {
        const role = guildRoles.get(roleId);
        if (role === undefined) return Promise.reject(new Error(`the fake guild has no role ${roleId}`));
        held.set(roleId, role);
        return Promise.resolve();
      },
      remove: (roleId) => {
        held.delete(roleId);
        return Promise.resolve();
      },
    };
  }
}

/**
 * The guild connect reads at startup, as a fake: the channels (checked, then written to), the Members on the server (only
 * the ids joined count, with the roles they hold), the roles of the guild, and the bot's own member with the permissions it
 * holds in the server.
 */
export class FakeConnectGuild {
  readonly id = "123456789012345678";
  readonly ownerId = "900000000000000001";
  private readonly channelStore = new FakeGuild();
  private readonly joined = new Map<string, FakeConnectMember>();
  private readonly guildRoles = new Map<string, ConnectRole>();
  private readonly fetchFailures = new Map<string, number>();
  private nextRoleId = 1;

  readonly channels = this.channelStore.channels;

  /** The roles of the guild: the cache, and creation as the name and roles asks for it. */
  readonly roles = {
    cache: this.guildRoles,
    create: (options: { readonly name: string; readonly permissions?: bigint | undefined }): Promise<ConnectRole> =>
      Promise.resolve(this.addRole(options.name, { permissions: options.permissions ?? 0n, managed: false, position: 1 })),
  };

  readonly members = {
    me: {
      id: BOT_MEMBER_ID,
      permissions: {
        has: (permission: bigint): boolean => this.serverPermissions.includes(permission),
      },
      roles: { highest: { position: 10 } },
    },
    /** One page of the Members over REST, in id order, after the given id. */
    list: (options: { readonly after?: string; readonly limit: number }): Promise<Map<string, FakeConnectMember>> => {
      const after = options.after ?? "";
      const ids = [...this.joined.keys()].filter((id) => id > after).sort().slice(0, options.limit);
      return Promise.resolve(new Map(ids.flatMap((id) => {
        const member = this.joined.get(id);
        return member === undefined ? [] : [[id, member] as const];
      })));
    },
    /**
     * The one Member, or Discord's refusal for a user it cannot find. With no id this is Request Guild Members (opcode 8):
     * always rate limited here, as Discord refused it at startup (#53), so a listing that goes back to it fails the tests.
     */
    fetch: (memberId?: string): Promise<FakeConnectMember> => {
      if (memberId === undefined) return Promise.reject(new Error("Request with opcode 8 was rate limited."));
      const code = this.fetchFailures.get(memberId);
      if (code !== undefined) return Promise.reject(Object.assign(new Error("Discord API error"), { code }));
      const member = this.joined.get(memberId);
      if (member !== undefined) return Promise.resolve(member);
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

  /** Defines a role of the guild, as an earlier apply or an Officer left it: not managed, no permissions. */
  defineRole(name: string): ConnectRole {
    return this.addRole(name, { permissions: 0n, managed: false, position: 1 });
  }

  /** Puts a Member on the server, holding the roles with these names, which must be defined before. */
  join(memberId: string, roleNames: readonly string[] = [], bot = false): void {
    const member = new FakeConnectMember(memberId, bot, this.guildRoles);
    for (const name of roleNames) {
      const role = this.roleNamed(name);
      member.roles.cache.set(role.id, role);
    }
    this.joined.set(memberId, member);
  }

  /** The names of the roles a Member on the server holds, in no particular order. */
  rolesOf(memberId: string): string[] {
    const member = this.joined.get(memberId);
    if (member === undefined) throw new Error(`the fake guild has no Member ${memberId}`);
    return [...member.roles.cache.values()].map((role) => role.name);
  }

  /** The text of every message posted to the channel, in order. */
  messagesIn(channelId: string): string[] {
    return this.channelStore.get(channelId).sent.map((message) => message.content);
  }

  private addRole(name: string, options: { readonly permissions: bigint; readonly managed: boolean; readonly position: number }): ConnectRole {
    const id = String(this.nextRoleId).padStart(18, "0");
    this.nextRoleId += 1;
    const role: ConnectRole = {
      id,
      name,
      managed: options.managed,
      permissions: { bitfield: options.permissions },
      position: options.position,
    };
    this.guildRoles.set(id, role);
    return role;
  }

  private roleNamed(name: string): ConnectRole {
    const role = [...this.guildRoles.values()].find((candidate) => candidate.name === name);
    if (role === undefined) throw new Error(`the fake guild has no role ${name}`);
    return role;
  }
}
