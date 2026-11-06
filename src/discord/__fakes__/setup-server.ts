import type { ChannelType } from "../../domain/server-layout.js";
import type {
  BotMemberInfo,
  GuildInfo,
  OverwriteEdit,
  SetupChannelInfo,
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
  | { readonly op: "edit-overwrites"; readonly channelId: string; readonly overwrites: readonly OverwriteEdit[] };

export type SetupWriteOp = SetupWrite["op"];

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
}

/**
 * An in-memory Discord server for the setup script. It stores what the port reads and applies what the port writes, and
 * logs every write attempt in `writes`. A write named in `failWrite` throws its error and changes nothing.
 */
export class FakeSetupServer implements SetupServer {
  /** Every write attempt, in order, failed ones included. */
  readonly writes: SetupWrite[] = [];

  readonly guildId: string;
  readonly botUserId: string;

  private readonly guildFeatures: readonly string[];
  private readonly roles: SetupRoleInfo[] = [];
  private readonly channels: SetupChannelInfo[] = [];
  private readonly botRoleIds: string[] = [];
  private readonly failures = new Map<string, Error>();
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
    });
    return id;
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
    const failure = this.failures.get(`create-role:${name}`);
    if (failure !== undefined) return Promise.reject(failure);
    const id = this.newId();
    this.roles.push({ id, name, permissions: 0n, managed: false, position: 1 });
    return Promise.resolve(id);
  }

  createCategory(name: string, overwrites: readonly OverwriteEdit[]): Promise<string> {
    this.writes.push({ op: "create-category", name, overwrites: [...overwrites] });
    const failure = this.failures.get(`create-category:${name}`);
    if (failure !== undefined) return Promise.reject(failure);
    const id = this.newId();
    this.channels.push({ id, name, kind: "category", parentId: undefined, overwrites: [...overwrites] });
    return Promise.resolve(id);
  }

  createChannel(channel: {
    readonly name: string;
    readonly type: ChannelType;
    readonly parentId: string;
    readonly overwrites: readonly OverwriteEdit[];
  }): Promise<string> {
    this.writes.push({
      op: "create-channel",
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId,
      overwrites: [...channel.overwrites],
    });
    const failure = this.failures.get(`create-channel:${channel.name}`);
    if (failure !== undefined) return Promise.reject(failure);
    const id = this.newId();
    this.channels.push({
      id,
      name: channel.name,
      kind: channel.type,
      parentId: channel.parentId,
      overwrites: [...channel.overwrites],
    });
    return Promise.resolve(id);
  }

  editOverwrites(channelId: string, overwrites: readonly OverwriteEdit[]): Promise<void> {
    this.writes.push({ op: "edit-overwrites", channelId, overwrites: [...overwrites] });
    const name = this.channels.find((channel) => channel.id === channelId)?.name ?? channelId;
    const failure = this.failures.get(`edit-overwrites:${name}`);
    if (failure !== undefined) return Promise.reject(failure);
    const channel = this.channels.find((candidate) => candidate.id === channelId);
    if (channel !== undefined) channel.overwrites = [...overwrites];
    return Promise.resolve();
  }

  private newId(): string {
    const id = (100000000000000000n + BigInt(this.nextNumber)).toString();
    this.nextNumber += 1;
    return id;
  }
}
