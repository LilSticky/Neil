import type { NewRoleOptions, RoleLike, RolesGuild, RolesMember } from "../member-roles.js";

/** Discord's code for a missing permission, and for a role above the bot's or a change to the owner's nickname. */
export const MISSING_PERMISSIONS = 50013;

/** Discord's code for a guild that already has the maximum number of roles. */
export const MAXIMUM_ROLES_REACHED = 30005;

/** The id of the fake guild unless a test gives another one. */
const DEFAULT_GUILD_ID = "100000000000000000";

/** An error shaped like discord.js's DiscordAPIError: it carries Discord's numeric code. */
export class FakeDiscordError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "DiscordAPIError";
  }
}

/**
 * A role of the fake guild. Permissions are a bit field, as in discord.js; position orders roles from the bottom; a
 * managed role is one an integration owns.
 */
export class FakeRole implements RoleLike {
  constructor(
    readonly id: string,
    public name: string,
    readonly permissions: { readonly bitfield: bigint },
    readonly position: number,
    readonly managed: boolean = false,
  ) {}
}

/**
 * A guild of the fakes with roles, members and the failures a test wants Discord to give. Creating a role waits a
 * macrotask, so two applies that start together both see a role as missing before either creates it, as on Discord.
 * Roles above `botTopRolePosition` are out of the bot's reach (hierarchy); the owner's nickname cannot be changed.
 */
export class FakeRolesGuild implements RolesGuild {
  botTopRolePosition = 10;
  private readonly renameFailures = new Map<string, Error>();
  /** The options of every role created so far, in creation order. */
  readonly createdOptions: NewRoleOptions[] = [];

  private readonly all: FakeRole[] = [];
  private readonly failures = new Map<string, Error>();
  private nextId = 1;

  constructor(
    readonly ownerId: string,
    readonly id: string = DEFAULT_GUILD_ID,
  ) {}

  get roles(): readonly RoleLike[] {
    return this.all;
  }

  /**
   * Defines a role that already exists in the guild, as an Officer or an earlier apply left it. `id` fixes the role's id
   * (for example an Officer role's id from configuration, or the guild's id for @everyone).
   */
  defineRole(
    name: string,
    options: {
      readonly permissions?: bigint;
      readonly position?: number;
      readonly id?: string;
      readonly managed?: boolean;
    } = {},
  ): FakeRole {
    const role = new FakeRole(
      options.id ?? this.newId(),
      name,
      { bitfield: options.permissions ?? 0n },
      options.position ?? 1,
      options.managed ?? false,
    );
    this.all.push(role);
    return role;
  }

  /** The roles with this exact name; Discord allows duplicates, so more than one is possible. */
  rolesNamed(name: string): FakeRole[] {
    return this.all.filter((role) => role.name === name);
  }

  /** The names of the roles created by the bot, in creation order. */
  createdRoleNames(): string[] {
    return this.createdOptions.map((options) => options.name);
  }

  /**
   * A member of the guild holding the given roles: a name stands for the first defined role of that name, which must
   * exist; a role object is held as it is, so a test can hold one of two duplicates.
   */
  member(id: string, roles: readonly (string | RoleLike)[] = []): FakeRolesMember {
    const held = roles.map((entry) => {
      if (typeof entry !== "string") return entry;
      const role = this.rolesNamed(entry)[0];
      if (role === undefined) throw new Error(`the fake guild has no role ${entry}`);
      return role;
    });
    return new FakeRolesMember(id, held, this);
  }

  /** Makes creating the role with this name fail with the error. */
  failRenaming(name: string, error: Error): void {
    this.renameFailures.set(name, error);
  }

  failCreating(name: string, error: Error): void {
    this.failures.set(`createRole:${name}`, error);
  }

  /** Makes adding the role with this name to a member fail with the error. */
  failAdding(name: string, error: Error): void {
    this.failures.set(`addRole:${name}`, error);
  }

  /** Makes every nickname change fail with the error. */
  failNickname(error: Error): void {
    this.failures.set("setNickname", error);
  }

  /** Throws the failure set for this operation, if any; used by the fake members. */
  throwIfFailing(key: string): void {
    const error = this.failures.get(key);
    if (error !== undefined) throw error;
  }

  async createRole(options: NewRoleOptions): Promise<RoleLike> {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    this.throwIfFailing(`createRole:${options.name}`);
    this.createdOptions.push(options);
    const role = new FakeRole(this.newId(), options.name, { bitfield: options.permissions }, 1);
    this.all.push(role);
    return role;
  }

  /**
   * Renames the role with its id, as Discord does: the role keeps its id, so the members holding it keep it. A role the
   * fake does not hold is an error.
   */
  renameRole(role: RoleLike, name: string): Promise<void> {
    const failure = this.renameFailures.get(role.name);
    if (failure !== undefined) return Promise.reject(failure);
    const existing = this.all.find((held) => held.id === role.id);
    if (existing === undefined) throw new Error(`the fake guild has no role ${role.id}`);
    existing.name = name;
    return Promise.resolve();
  }

  /** The position and owner rules Discord applies to the bot's changes; used by the fake members. */
  isAboveBot(role: RoleLike): boolean {
    return role.position >= this.botTopRolePosition;
  }

  private newId(): string {
    const id = String(this.nextId).padStart(18, "0");
    this.nextId += 1;
    return id;
  }
}

/** A guild member of the fakes: the roles it holds and its nickname. */
export class FakeRolesMember implements RolesMember {
  nickname: string | undefined = undefined;
  /** Whether the Member is a bot account; a test sets it for a bot. */
  bot = false;

  constructor(
    readonly id: string,
    private held: RoleLike[],
    private readonly guild: FakeRolesGuild,
  ) {}

  get roles(): readonly RoleLike[] {
    return this.held;
  }

  async addRole(role: RoleLike): Promise<void> {
    await Promise.resolve();
    this.guild.throwIfFailing(`addRole:${role.name}`);
    if (this.guild.isAboveBot(role)) {
      throw new FakeDiscordError(MISSING_PERMISSIONS, "Missing Permissions: role is above the bot's highest role");
    }
    this.held = [...this.held, role];
  }

  async removeRole(role: RoleLike): Promise<void> {
    await Promise.resolve();
    this.held = this.held.filter((held) => held.id !== role.id);
  }

  async setNickname(nickname: string | null): Promise<void> {
    await Promise.resolve();
    this.guild.throwIfFailing("setNickname");
    if (this.id === this.guild.ownerId) {
      throw new FakeDiscordError(MISSING_PERMISSIONS, "Missing Permissions: the owner's nickname cannot be changed");
    }
    this.nickname = nickname ?? undefined;
  }
}
