import { GuildScheduledEventStatus } from "discord.js";
import { BOT_MEMBER_ID, FakeGuild, type FakeChannel, type FakeChannelOptions } from "./guild.js";

/** Discord's code for a user who is not a member of the guild. */
const UNKNOWN_MEMBER = 10007;

/** A scheduled event as discord.js caches it: the fields Neil reads, and the guild it belongs to. */
export interface ConnectScheduledEvent {
  readonly id: string;
  readonly guildId: string;
  readonly name: string;
  readonly scheduledStartTimestamp: number | null;
  readonly description: string | null;
  readonly status: GuildScheduledEventStatus;
  readonly creatorId: string | null;
}

/** A user who marked a scheduled event Interested, as fetchSubscribers gives them; the Member only when asked for. */
export interface ConnectSubscriber {
  readonly guildScheduledEventId: string;
  readonly user: { readonly id: string };
  readonly member: FakeConnectMember | null;
}

/** One request for the subscribers of an event, as the code made it: the page size and the id it reads after. */
export interface ConnectSubscriberRequest {
  readonly eventId: string;
  readonly limit: number | undefined;
  readonly after: string | undefined;
}

/** A role of the guild as discord.js exposes it to the name and roles: id, name, managed flag, permissions and position. */
export interface ConnectRole {
  readonly id: string;
  readonly name: string;
  readonly managed: boolean;
  readonly permissions: { readonly bitfield: bigint };
  readonly position: number;
}

/** A presence as discord.js caches it: the id of the Member it is for, and the status Discord reports. */
export interface ConnectPresence {
  readonly userId: string;
  readonly status: "online" | "idle" | "dnd" | "offline";
}

/**
 * A Member of the guild as discord.js exposes it: the bot flag, the username and display name (the Interview needs both),
 * the nickname, and the roles held (by id, as the cache).
 */
export class FakeConnectMember {
  nickname: string | null = null;
  readonly displayName: string;
  readonly user: { readonly bot: boolean; readonly username: string };
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
    this.displayName = `member_${id}`;
    this.user = { bot, username: `member_${id}` };
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
  private readonly heldFetches = new Map<string, Promise<void>>();
  private readonly fetchedIds: string[] = [];
  private readonly presenceStore = new Map<string, ConnectPresence>();
  private unscopedFetchCount = 0;
  private listingGate: Promise<void> | undefined = undefined;
  private openListingGate: (() => void) | undefined = undefined;
  private nextRoleId = 1;

  readonly channels = this.channelStore.channels;

  /** The presences discord.js caches, by Member id: Discord reports the status of every Member it sends, offline ones too. */
  readonly presences = { cache: this.presenceStore };

  private readonly scheduledStore = new Map<string, ConnectScheduledEvent>();
  private readonly interestedStore = new Map<string, string[]>();
  private readonly subscriberRequestLog: ConnectSubscriberRequest[] = [];
  private scheduledListingCount = 0;
  private scheduledListingGate: Promise<void> | undefined = undefined;
  private memberReadCount = 0;

  /**
   * The scheduled events of the guild. `fetch` lists them all, as discord.js does; `fetchSubscribers` pages the users who
   * marked an event Interested by id, `limit` at a time (100 by default), from the id given as `after`.
   */
  readonly scheduledEvents = {
    fetch: async (): Promise<Map<string, ConnectScheduledEvent>> => {
      this.scheduledListingCount += 1;
      if (this.scheduledListingGate !== undefined) await this.scheduledListingGate;
      return new Map(this.scheduledStore);
    },
    fetchSubscribers: (
      eventId: string,
      options: { readonly limit?: number; readonly withMember?: boolean; readonly after?: string } = {},
    ): Promise<Map<string, ConnectSubscriber>> => {
      this.subscriberRequestLog.push({ eventId, limit: options.limit, after: options.after });
      const limit = options.limit ?? 100;
      const after = options.after ?? "";
      const ids = (this.interestedStore.get(eventId) ?? []).filter((id) => id > after).sort().slice(0, limit);
      return Promise.resolve(
        new Map(
          ids.map((id) => [
            id,
            {
              guildScheduledEventId: eventId,
              user: { id },
              member: options.withMember === true ? (this.joined.get(id) ?? null) : null,
            },
          ]),
        ),
      );
    },
  };

  /** Sets the scheduled events Discord lists for the guild. */
  setScheduledEvents(events: readonly ConnectScheduledEvent[]): void {
    this.scheduledStore.clear();
    for (const event of events) this.scheduledStore.set(event.id, event);
  }

  /** Sets the users who marked the scheduled event Interested, in any order, as Discord has them (a user who left may be listed). */
  setInterested(eventId: string, userIds: readonly string[]): void {
    this.interestedStore.set(eventId, [...userIds]);
  }

  /** How many times the code listed the scheduled events of the guild. */
  get scheduledListings(): number {
    return this.scheduledListingCount;
  }

  /** Every request for the subscribers of an event, in order. */
  get subscriberRequests(): readonly ConnectSubscriberRequest[] {
    return this.subscriberRequestLog;
  }

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
    list: async (options: { readonly after?: string; readonly limit: number }): Promise<Map<string, FakeConnectMember>> => {
      this.memberReadCount += 1;
      if (this.listingGate !== undefined) await this.listingGate;
      const after = options.after ?? "";
      const ids = [...this.joined.keys()].filter((id) => id > after).sort().slice(0, options.limit);
      return new Map(ids.flatMap((id) => {
        const member = this.joined.get(id);
        return member === undefined ? [] : [[id, member] as const];
      }));
    },
    /**
     * The one Member, or Discord's refusal for a user it cannot find. With no id this is Request Guild Members (opcode 8):
     * always rate limited here, as Discord refused it at startup (#53), so a listing that goes back to it fails the tests.
     */
    fetch: (memberId?: string): Promise<FakeConnectMember> => {
      this.memberReadCount += 1;
      if (memberId === undefined) {
        this.unscopedFetchCount += 1;
        return Promise.reject(new Error("Request with opcode 8 was rate limited."));
      }
      this.fetchedIds.push(memberId);
      const answer = (): Promise<FakeConnectMember> => {
        const code = this.fetchFailures.get(memberId);
        if (code !== undefined) return Promise.reject(Object.assign(new Error("Discord API error"), { code }));
        const member = this.joined.get(memberId);
        if (member !== undefined) return Promise.resolve(member);
        return Promise.reject(Object.assign(new Error("Unknown Member"), { code: UNKNOWN_MEMBER }));
      };
      const held = this.heldFetches.get(memberId);
      return held === undefined ? answer() : held.then(answer);
    },
  };

  /** How many fetches of every Member, without an id, the code made: Discord refuses them, so a test checks it made none. */
  get unscopedFetches(): number {
    return this.unscopedFetchCount;
  }

  /** Caches the status Discord reports for a Member; a Member with no presence set is not in the cache. */
  setPresence(memberId: string, status: ConnectPresence["status"]): void {
    this.presenceStore.set(memberId, { userId: memberId, status });
  }

  /** Holds every listing of the scheduled events until the returned function is called. */
  holdScheduledListings(): () => void {
    let release: () => void = () => undefined;
    this.scheduledListingGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => {
      release();
    };
  }

  /** How many reads of Members the code made, by id or by page, batched or not. */
  get memberReads(): number {
    return this.memberReadCount;
  }

  /** Makes listing the Members wait, once the code asks for it, until releaseListing is called. */
  holdListing(): void {
    this.listingGate = new Promise<void>((resolve) => {
      this.openListingGate = resolve;
    });
  }

  releaseListing(): void {
    this.openListingGate?.();
    this.listingGate = undefined;
    this.openListingGate = undefined;
  }

  /** Holds every fetch of this member until the returned function is called. */
  holdFetch(memberId: string): () => void {
    let release: () => void = () => undefined;
    this.heldFetches.set(memberId, new Promise((resolve) => { release = resolve; }));
    return () => {
      release();
    };
  }

  /** How many fetches of this member the code made. */
  fetchesOf(memberId: string): number {
    return this.fetchedIds.filter((id) => id === memberId).length;
  }

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

  /** The threads the code created in the guild, in creation order. */
  createdThreads(): FakeChannel[] {
    return this.channelStore.createdThreads();
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
