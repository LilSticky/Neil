// The setup script's logic: the layout file, the server as read through a port, the writes, and the report (slice 020).
// Talks to Discord only through SetupServer; setup-server-rest.ts is the discord.js adapter behind it.
import { PermissionFlagsBits } from "discord.js";
import { z } from "zod";
import { redact } from "../startup.js";
import { PIN_MARK } from "../domain/channel-description.js";
import {
  BOT_TARGET,
  EVERYONE_TARGET,
  expandLayout,
  translatedDescription,
  type ChannelType,
  type LayoutCategory,
  type LayoutChannel,
  type OverwriteSpec,
  type Permission,
  type ServerLayout,
  type WantedOverwrite,
} from "../domain/server-layout.js";
import {
  allianceRoleNamesOf,
  planSetup,
  type ServerChannel,
  type ServerRole,
  type ServerState,
  type SetupFinding,
  type SetupPlan,
  type SetupStep,
} from "../domain/setup-plan.js";

/** The guild as the script reads it. `id` is the guild's, which is also the id of @everyone. */
export interface GuildInfo {
  id: string;
  features: string[];
}

/** Neil's member: its user id and the ids of the roles it holds. */
export interface BotMemberInfo {
  userId: string;
  roleIds: string[];
}

export interface SetupRoleInfo {
  id: string;
  name: string;
  permissions: bigint;
  managed: boolean;
  position: number;
}

/** Discord's code for an overwrite of a role (0) or of a Member (1). */
export type OverwriteType = 0 | 1;
const ROLE_OVERWRITE: OverwriteType = 0;
const MEMBER_OVERWRITE: OverwriteType = 1;

/**
 * One permission overwrite as Discord holds it: the bits, including bits the domain does not name, and the type of its
 * target. A kept overwrite keeps its type; a new one is a Member overwrite for Neil and a role overwrite for the rest.
 */
export interface OverwriteEdit {
  targetId: string;
  type: OverwriteType;
  allow: bigint;
  deny: bigint;
}

export interface SetupChannelInfo {
  id: string;
  name: string;
  kind: "category" | ChannelType;
  parentId: string | undefined;
  overwrites: OverwriteEdit[];
  /** The topic, or undefined when the channel has none. */
  topic: string | undefined;
}

/** A pinned message of a channel: its id, the id of its author, and its content. */
export interface SetupPinInfo {
  messageId: string;
  authorId: string;
  content: string;
}

/** The part of a Discord server the setup uses. The REST adapter maps Discord onto it; the fake stands in for it in tests. */
export interface SetupServer {
  readGuild(): Promise<GuildInfo>;
  readBotMember(): Promise<BotMemberInfo>;
  readRoles(): Promise<readonly SetupRoleInfo[]>;
  readChannels(): Promise<readonly SetupChannelInfo[]>;
  createRole(name: string): Promise<string>;
  createCategory(name: string, overwrites: readonly OverwriteEdit[]): Promise<string>;
  createChannel(channel: {
    readonly name: string;
    readonly type: ChannelType;
    readonly parentId: string;
    readonly overwrites: readonly OverwriteEdit[];
    readonly topic: string | undefined;
  }): Promise<string>;
  /** Writes the channel's whole overwrite list in one request. */
  editOverwrites(channelId: string, overwrites: readonly OverwriteEdit[]): Promise<void>;
  setTopic(channelId: string, topic: string): Promise<void>;
  /** The pinned messages of a channel, newest first; undefined when Discord refuses the read (Neil lacks Administrator). */
  readPins(channelId: string): Promise<readonly SetupPinInfo[] | undefined>;
  /** Posts a message with no mentions, pins it, and returns its id. */
  postPinnedMessage(channelId: string, content: string): Promise<string>;
  editMessage(channelId: string, messageId: string, content: string): Promise<void>;
}

export type StepOutcome = { step: SetupStep; status: "done" } | FailedOutcome;
type FailedOutcome = { step: SetupStep; status: "failed"; reason: string };

/** The Discord bit of each permission name the layout may use. */
const PERMISSION_BITS: Record<Permission, bigint> = {
  ViewChannel: PermissionFlagsBits.ViewChannel,
  SendMessages: PermissionFlagsBits.SendMessages,
  SendMessagesInThreads: PermissionFlagsBits.SendMessagesInThreads,
  CreatePublicThreads: PermissionFlagsBits.CreatePublicThreads,
  CreatePrivateThreads: PermissionFlagsBits.CreatePrivateThreads,
  ManageThreads: PermissionFlagsBits.ManageThreads,
  ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory,
  EmbedLinks: PermissionFlagsBits.EmbedLinks,
};
const PERMISSIONS: readonly Permission[] = Object.keys(PERMISSION_BITS).filter(isPermission);
const ADMINISTRATOR = PermissionFlagsBits.Administrator;
const LOWERCASE_NO_SPACES = /^[a-z0-9_-]+$/;
const LAST_LINE = "Now take Administrator off Neil's role.";
const BY_HAND = [
  "Still by hand, in Server Settings > Integrations > Neil: allow Moderator and King on /quota, /rank and /link, and limit commands to their channels (SERVER-SETUP.md section 5).",
  "Still by hand, in the Developer Portal > Bot: switch on Server Members Intent and Presence Intent.",
  "Still by hand, if you want real announcement channels: switch on Community in Server Settings, then run this again.",
  "Still by hand, in Server Settings > Roles: Neil's role above every role it gives, and below Moderator and King.",
];
/** The IDs the owner copies into the settings: setting name, and the role or channel it names. */
const ID_SETTINGS: readonly { setting: string; kind: "role" | "channel"; name: string }[] = [
  { setting: "DISCORD_MODERATOR_ROLE_ID", kind: "role", name: "Moderator" },
  { setting: "DISCORD_KING_ROLE_ID", kind: "role", name: "King" },
  { setting: "DISCORD_ONBOARDING_CHANNEL_ID", kind: "channel", name: "onboarding" },
  { setting: "DISCORD_LOG_CHANNEL_ID", kind: "channel", name: "neil-log" },
  { setting: "DISCORD_GUIDES_FORUM_ID", kind: "channel", name: "guides" },
];

function isPermission(name: string): name is Permission {
  return Object.hasOwn(PERMISSION_BITS, name);
}

// ---- The layout file -------------------------------------------------------------------------------------------------

const overwriteSchema = z.strictObject({
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
});
// The description is required, but checked by hand (descriptionOf) so that a refusal names the category and channel.
const channelSchema = z.strictObject({
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
  codeOfConduct: z.array(z.string()).optional(),
  mode: z.string().optional(),
  translated: z.boolean().optional(),
  seenBy: z.array(z.string()).optional(),
  overwrites: z.record(z.string(), overwriteSchema).optional(),
});
const categorySchema = z.strictObject({
  name: z.string(),
  seenBy: z.array(z.string()),
  channels: z.array(channelSchema),
});
const layoutSchema = z.strictObject({
  roles: z.array(z.string()),
  externalRoles: z.array(z.string()),
  languages: z.array(z.string()),
  translations: z.array(z.string()),
  categories: z.array(categorySchema),
  allianceArea: z.strictObject({ channels: z.array(channelSchema) }),
});
type RawChannel = z.infer<typeof channelSchema>;

/**
 * Reads the layout file (data-model.md, Rules checked on load). The shape is checked by zod; the values by hand, so each
 * refusal names the category and channel it is about. Throws an Error with that message.
 */
export function parseLayout(text: string): ServerLayout {
  const json: unknown = parseJson(text);
  const parsed = layoutSchema.safeParse(json);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`server-layout.json: ${problems.join("; ")}`);
  }
  const raw = parsed.data;
  const known = new Set([...raw.roles, ...raw.languages, ...raw.externalRoles, EVERYONE_TARGET, BOT_TARGET]);
  const translations = checkTranslations(raw.translations, raw.languages);
  const categoryNames = new Set<string>();
  const channelNames = new Map<string, string>();

  const categories: LayoutCategory[] = raw.categories.map((category) => {
    if (categoryNames.has(category.name)) throw new Error(`category "${category.name}" is listed twice`);
    categoryNames.add(category.name);
    const container = `category "${category.name}"`;
    for (const target of category.seenBy) checkTarget(known, container, target);
    return {
      name: category.name,
      seenBy: [...category.seenBy],
      channels: category.channels.map((channel) => checkChannel(container, channel, known, channelNames, translations)),
    };
  });
  const allianceChannels = raw.allianceArea.channels.map((channel) =>
    checkChannel("allianceArea", channel, known, channelNames, translations),
  );

  return {
    roles: [...raw.roles],
    externalRoles: [...raw.externalRoles],
    languages: [...raw.languages],
    translations,
    categories,
    allianceArea: { channels: allianceChannels },
  };
}

/** Each translation is a listed language, once (data-model.md, Rules checked on load). */
function checkTranslations(translations: readonly string[], languages: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const language of translations) {
    if (!languages.includes(language)) throw new Error(`translations: "${language}" is not one of the listed languages`);
    if (seen.has(language)) throw new Error(`translations: "${language}" is listed twice`);
    seen.add(language);
  }
  return [...translations];
}

const DESCRIPTION_MAX = 1024;

function descriptionOf(place: string, value: string | undefined): string {
  if (value === undefined) throw new Error(`${place}: description is required, 1–1024 characters`);
  if (value.length === 0 || value.length > DESCRIPTION_MAX) {
    throw new Error(`${place}: description must be 1–1024 characters, not ${value.length.toString()}`);
  }
  if (value !== value.trim()) throw new Error(`${place}: description must not start or end with spaces or line breaks`);
  return value;
}

/** A translated channel's copies carry the description with their credit; the longest of them must fit the limit. */
function checkTranslatedLength(place: string, description: string, translations: readonly string[]): void {
  const longest = translations.reduce(
    (max, language) => Math.max(max, translatedDescription(description, language).length),
    0,
  );
  if (longest > DESCRIPTION_MAX) {
    throw new Error(`${place}: the translated description is ${longest.toString()} characters; 1024 at most`);
  }
}

function parseJson(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`server-layout.json is not JSON: ${detail}`, { cause: error });
  }
}

function checkTarget(known: ReadonlySet<string>, place: string, target: string): void {
  if (!known.has(target)) throw new Error(`${place}: "${target}" is no listed role, external role, @everyone or Neil`);
}

function checkChannel(
  container: string,
  raw: RawChannel,
  known: ReadonlySet<string>,
  names: Map<string, string>,
  translations: readonly string[],
): LayoutChannel {
  const place = `${container}, channel "${raw.name}"`;
  const type = channelTypeOf(raw.type);
  if (type === undefined) throw new Error(`${place}: type "${raw.type}" is not text, voice, forum or announcement`);
  if (type !== "voice" && !LOWERCASE_NO_SPACES.test(raw.name)) {
    throw new Error(`${place}: the name must be lowercase with no spaces`);
  }
  const mode = raw.mode === undefined ? undefined : modeOf(raw.mode);
  if (raw.mode !== undefined && mode === undefined) {
    throw new Error(`${place}: mode "${raw.mode}" is not read-only or only-king-posts`);
  }
  const earlier = names.get(raw.name);
  if (earlier !== undefined) throw new Error(`channel "${raw.name}" is in two places: ${earlier} and ${place}`);
  names.set(raw.name, place);

  const description = descriptionOf(place, raw.description);
  if (raw.translated === true) checkTranslatedLength(place, description, translations);
  for (const target of raw.seenBy ?? []) checkTarget(known, place, target);
  const overwrites = raw.overwrites === undefined ? undefined : checkOverwrites(place, raw.overwrites, known);

  const channel: LayoutChannel = { name: raw.name, type, description };
  if (raw.codeOfConduct !== undefined) channel.codeOfConduct = [...raw.codeOfConduct];
  if (mode !== undefined) channel.mode = mode;
  if (raw.translated !== undefined) channel.translated = raw.translated;
  if (raw.seenBy !== undefined) channel.seenBy = [...raw.seenBy];
  if (overwrites !== undefined) channel.overwrites = overwrites;
  return channel;
}

function checkOverwrites(
  place: string,
  raw: Record<string, { allow: string[]; deny: string[] }>,
  known: ReadonlySet<string>,
): Record<string, OverwriteSpec> {
  const result: Record<string, OverwriteSpec> = {};
  for (const [target, spec] of Object.entries(raw)) {
    checkTarget(known, place, target);
    result[target] = { allow: permissionsOf(place, target, spec.allow), deny: permissionsOf(place, target, spec.deny) };
  }
  return result;
}

function permissionsOf(place: string, target: string, names: readonly string[]): Permission[] {
  return names.map((name) => {
    if (!isPermission(name)) throw new Error(`${place}, overwrite "${target}": "${name}" is not a known permission`);
    return name;
  });
}

function channelTypeOf(value: string): ChannelType | undefined {
  if (value === "text" || value === "voice" || value === "forum" || value === "announcement") return value;
  return undefined;
}

function modeOf(value: string): "read-only" | "only-king-posts" | undefined {
  if (value === "read-only" || value === "only-king-posts") return value;
  return undefined;
}

// ---- Reading the server ----------------------------------------------------------------------------------------------

/** The server as the plan needs it (data-model.md, Server state). Reads only; the names of permissions come from their bits. */
export async function readServer(port: SetupServer): Promise<ServerState> {
  const [guild, bot, roles, channels] = await readAll(port);
  const everyone = roles.find((role) => role.id === guild.id);
  const botRoles = roles.filter((role) => bot.roleIds.includes(role.id));
  return {
    everyoneId: guild.id,
    botUserId: bot.userId,
    botTopPosition: Math.max(0, ...botRoles.map((role) => role.position)),
    hasCommunity: guild.features.includes("COMMUNITY"),
    botIsAdministrator: [...botRoles, ...(everyone === undefined ? [] : [everyone])].some(hasAdministrator),
    roles: roles.map(toServerRole),
    channels: await Promise.all(channels.map((channel) => readChannel(port, channel, bot.userId))),
  };
}

/** A channel as the plan needs it. Pins are read only where a description can be: text, announcement and voice channels. */
async function readChannel(port: SetupServer, channel: SetupChannelInfo, botUserId: string): Promise<ServerChannel> {
  const describable = channel.kind !== "category" && channel.kind !== "forum";
  const pins = describable ? await port.readPins(channel.id) : [];
  return {
    id: channel.id,
    name: channel.name,
    kind: channel.kind,
    parentId: channel.parentId,
    topic: channel.topic,
    description: pins === undefined ? undefined : neilDescriptionOf(pins, botUserId),
    pinsReadable: pins !== undefined,
    overwrites: channel.overwrites.map((overwrite) => ({
      targetId: overwrite.targetId,
      allow: permissionNamesOf(overwrite.allow),
      deny: permissionNamesOf(overwrite.deny),
    })),
  };
}

/** Neil's description: the oldest pin by Neil's user whose text starts with the pin mark. Discord lists pins newest first. */
function neilDescriptionOf(pins: readonly SetupPinInfo[], botUserId: string): ServerChannel["description"] {
  const oldest = pins.filter((pin) => pin.authorId === botUserId && pin.content.startsWith(PIN_MARK)).at(-1);
  return oldest === undefined ? undefined : { messageId: oldest.messageId, text: oldest.content };
}

function toServerRole(role: SetupRoleInfo): ServerRole {
  return {
    id: role.id,
    name: role.name,
    hasPermissions: role.permissions !== 0n,
    managed: role.managed,
    position: role.position,
  };
}

function hasAdministrator(role: SetupRoleInfo): boolean {
  return (role.permissions & ADMINISTRATOR) !== 0n;
}

/** The four reads the setup starts with: the guild, Neil's member, the roles and the channels. */
function readAll(port: SetupServer): Promise<[GuildInfo, BotMemberInfo, readonly SetupRoleInfo[], readonly SetupChannelInfo[]]> {
  return Promise.all([port.readGuild(), port.readBotMember(), port.readRoles(), port.readChannels()]);
}

/** The permission names whose bits are set; bits the domain does not name are left out. */
function permissionNamesOf(bits: bigint): Permission[] {
  return PERMISSIONS.filter((name) => (bits & PERMISSION_BITS[name]) !== 0n);
}

function bitsOf(names: readonly Permission[]): bigint {
  return names.reduce((bits, name) => bits | PERMISSION_BITS[name], 0n);
}

// ---- Writing --------------------------------------------------------------------------------------------------------

/** What applying needs by name: the server's roles and categories as they stand, and its channels with their bits. */
interface Book {
  everyoneId: string;
  botUserId: string;
  roles: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  channels: Map<string, SetupChannelInfo>;
  /** The channels this run created, so that a description step with no id can find its channel. */
  created: { id: string; name: string; categoryName: string }[];
}

/**
 * Applies a plan: roles, then categories, then channels, then corrected overwrites. A failed write is recorded and the rest
 * go on; a step whose category or role failed is recorded as failed without a write.
 */
export async function applySetup(plan: SetupPlan, port: SetupServer): Promise<StepOutcome[]> {
  const book = await readBook(port);
  const outcomes: StepOutcome[] = [];
  for (const step of inOrder(plan.steps)) {
    try {
      await applyStep(step, port, book);
      outcomes.push({ step, status: "done" });
    } catch (error) {
      outcomes.push({ step, status: "failed", reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcomes;
}

async function readBook(port: SetupServer): Promise<Book> {
  const [guild, bot, roles, channels] = await readAll(port);
  return {
    everyoneId: guild.id,
    botUserId: bot.userId,
    roles: roles.map((role) => ({ id: role.id, name: role.name })),
    categories: channels
      .filter((channel) => channel.kind === "category")
      .map((channel) => ({ id: channel.id, name: channel.name })),
    channels: new Map(channels.map((channel) => [channel.id, channel])),
    created: [],
  };
}

const PHASE: Record<SetupStep["kind"], number> = {
  "create-role": 0,
  "create-category": 1,
  "create-channel": 2,
  "correct-overwrites": 3,
  "set-topic": 4,
  "post-description": 5,
  "edit-description": 5,
};

function inOrder(steps: readonly SetupStep[]): SetupStep[] {
  return [...steps].sort((a, b) => PHASE[a.kind] - PHASE[b.kind]);
}

async function applyStep(step: SetupStep, port: SetupServer, book: Book): Promise<void> {
  switch (step.kind) {
    case "create-role": {
      const id = await port.createRole(step.name);
      book.roles.push({ id, name: step.name });
      return;
    }
    case "create-category": {
      const overwrites = step.overwrites.map((wanted) => editFor(book, wanted));
      const id = await port.createCategory(step.name, overwrites);
      book.categories.push({ id, name: step.name });
      return;
    }
    case "create-channel": {
      const parent = categoryNamed(book, step.categoryName);
      const overwrites = step.overwrites.map((wanted) => editFor(book, wanted));
      const id = await port.createChannel({ name: step.name, type: step.type, parentId: parent.id, overwrites, topic: step.topic });
      book.created.push({ id, name: step.name, categoryName: step.categoryName });
      return;
    }
    case "correct-overwrites": {
      const current = book.channels.get(step.id);
      if (current === undefined) throw new Error(`channel "${step.name}" is not there any more`);
      const wanted = step.overwrites.map((overwrite) => editFor(book, overwrite));
      await port.editOverwrites(step.id, mergeOverwrites(current.overwrites, wanted));
      return;
    }
    case "set-topic":
      await port.setTopic(step.id, step.topic);
      return;
    case "post-description": {
      const channelId = step.id ?? createdIdOf(book, step.name, step.categoryName);
      await port.postPinnedMessage(channelId, step.content);
      return;
    }
    case "edit-description":
      await port.editMessage(step.id, step.messageId, step.content);
      return;
  }
}

function categoryNamed(book: Book, name: string): { id: string; name: string } {
  return single(book.categories.filter((category) => category.name === name), `category "${name}" is not there (its step failed)`);
}

/** The id of a channel this run created in the category; a channel whose creation failed has none. */
function createdIdOf(book: Book, name: string, categoryName: string): string {
  const created = book.created.filter((channel) => channel.name === name && channel.categoryName === categoryName);
  return single(created, `channel "${name}" created in this run (its creation failed, or it is not there)`).id;
}

function editFor(book: Book, wanted: WantedOverwrite): OverwriteEdit {
  const targetId = idOfTarget(book, wanted.target);
  const type = targetId === book.botUserId ? MEMBER_OVERWRITE : ROLE_OVERWRITE;
  return { targetId, type, allow: bitsOf(wanted.allow), deny: bitsOf(wanted.deny) };
}

function idOfTarget(book: Book, target: string): string {
  if (target === EVERYONE_TARGET) return book.everyoneId;
  if (target === BOT_TARGET) return book.botUserId;
  return single(book.roles.filter((role) => role.name === target), `role "${target}"`).id;
}

/** The overwrite list with the wanted allows and denies merged in, keeping every other bit and target (research R4). */
function mergeOverwrites(current: readonly OverwriteEdit[], wanted: readonly OverwriteEdit[]): OverwriteEdit[] {
  const merged = [...current];
  for (const want of wanted) {
    const index = merged.findIndex((overwrite) => overwrite.targetId === want.targetId);
    const base = merged[index] ?? { targetId: want.targetId, type: want.type, allow: 0n, deny: 0n };
    const next: OverwriteEdit = {
      targetId: want.targetId,
      type: base.type,
      allow: (base.allow | want.allow) & ~want.deny,
      deny: (base.deny | want.deny) & ~want.allow,
    };
    if (index === -1) merged.push(next);
    else merged[index] = next;
  }
  return merged;
}

function single<T>(matches: readonly T[], what: string): T {
  if (matches.length === 0) throw new Error(`no ${what}`);
  if (matches.length > 1) throw new Error(`more than one ${what}`);
  const [only] = matches;
  if (only === undefined) throw new Error(`no ${what}`);
  return only;
}

// ---- The run and its report -----------------------------------------------------------------------------------------

export interface RunOptions {
  layout: ServerLayout;
  homeKingdom: number;
  /** false is a dry run: the plan is printed and nothing is written. */
  apply: boolean;
  port: SetupServer;
  /** Values the report never prints, such as the bot token. */
  secrets: readonly string[];
}

/**
 * Plans the setup, applies it on a real run, and returns the report (contracts/cli.md, in its order) with the exit code. A real
 * run without Administrator on Neil's role writes nothing and exits 1.
 */
export async function runSetup(options: RunOptions): Promise<{ report: string; exitCode: 0 | 1 }> {
  const { layout, homeKingdom, apply, port, secrets } = options;
  const before = await readServer(port);
  const overlong = overlongLines(layout, homeKingdom, before);
  if (overlong.length > 0) return { report: redact(overlong.join("\n"), secrets), exitCode: 1 };
  const plan = planSetup(layout, before, homeKingdom);
  const blocked = apply && !before.botIsAdministrator;
  const real = apply && !blocked;

  const outcomes = real ? await applySetup(plan, port) : [];
  const failures = outcomes.filter((outcome): outcome is FailedOutcome => outcome.status === "failed");
  // The read after the writes may fail too; the outcomes are still reported, and the ID lines are left out.
  const after = real ? await readAfterWrites(port) : before;
  const changed = plan.steps.filter((step) => !failures.some((failure) => failure.step === step));
  const unreadCount = plan.findings.filter((finding) => finding.kind === "descriptions-unread").length;
  const lineFindings = plan.findings.filter(isLineFinding);
  const outside = lineFindings.filter((finding) => finding.kind === "outside-layout");
  const warnings = lineFindings.filter((finding) => finding.kind !== "outside-layout");
  const tense = (step: SetupStep): string => (real ? describeStep(step) : `would ${describeStep(step)}`);

  const lines = [
    ...administratorNote(before.botIsAdministrator, apply),
    ...changed.map(tense),
    ...warnings.sort((a, b) => warningRank(a) - warningRank(b)).map((finding) => describeFinding(finding, real)),
    ...(unreadCount > 0 ? [unreadLine(unreadCount)] : []),
    ...outside.map((finding) => describeFinding(finding, real)),
    ...failures.map((failure) => `failed: ${describeStep(failure.step)}: ${failure.reason}`),
    ...(plan.steps.length === 0 ? ["Nothing to do."] : []),
    ...(after === undefined ? ["Could not read the IDs after the writes; run this again to see them."] : idLines(after)),
    ...BY_HAND,
    ...(real ? [LAST_LINE] : []),
  ];

  return {
    report: redact(lines.join("\n"), secrets),
    exitCode: blocked || failures.length > 0 ? 1 : 0,
  };
}

const MESSAGE_MAX = 2000;

/**
 * One line per description message longer than Discord allows. The message depends on the Kingdom number and on the
 * server's `[TAG]` roles, so it is rendered here from the server as read (research R6), before any write.
 */
function overlongLines(layout: ServerLayout, homeKingdom: number, server: ServerState): string[] {
  const expanded = expandLayout(layout, homeKingdom, allianceRoleNamesOf(server));
  return expanded.categories
    .flatMap((category) => category.channels)
    .flatMap((channel) => {
      const length = channel.message === undefined ? 0 : Array.from(channel.message).length;
      if (length <= MESSAGE_MAX) return [];
      return [`${channel.name}: its description message is ${length.toString()} characters; Discord allows ${MESSAGE_MAX.toString()}. Nothing was written.`];
    });
}

/** The server as it is after a real run's writes; undefined when the read fails. */
async function readAfterWrites(port: SetupServer): Promise<ServerState | undefined> {
  try {
    return await readServer(port);
  } catch {
    return undefined;
  }
}

function administratorNote(isAdministrator: boolean, apply: boolean): string[] {
  if (isAdministrator) return [];
  return apply
    ? ["A real run needs Administrator on Neil's role. Nothing was written."]
    : ["Neil's role has no Administrator: a dry run works without it, a real run needs it."];
}

function describeStep(step: SetupStep): string {
  switch (step.kind) {
    case "create-role":
      return `create role ${step.name}`;
    case "create-category":
      return `create category ${step.name}`;
    case "create-channel":
      return `create ${step.type} channel ${step.name} in ${step.categoryName}`;
    case "correct-overwrites":
      return `correct permissions of ${step.name}`;
    case "set-topic":
      return `set topic of ${step.name}`;
    case "post-description":
      return `post description in ${step.name}`;
    case "edit-description":
      return `edit description in ${step.name}`;
  }
}

/** The findings that get a line of their own; the unread descriptions are counted into one line instead. */
type LineFinding = Exclude<SetupFinding, { kind: "descriptions-unread" }>;

function isLineFinding(finding: SetupFinding): finding is LineFinding {
  return finding.kind !== "descriptions-unread";
}

/** One line for all the channels whose pins Neil cannot read (a dry run without Administrator). */
function unreadLine(count: number): string {
  return `Neil can't read the pinned messages of ${count.toString()} channels without Administrator; a real run checks their descriptions.`;
}

/** Warnings: hides-from-everyone first, the other findings after, each group in the order of the plan. */
function warningRank(finding: SetupFinding): number {
  return finding.kind === "hides-from-everyone" ? 0 : 1;
}

/** A finding as a line; `real` is whether the run writes, which decides the tense of what it will do. */
function describeFinding(finding: LineFinding, real: boolean): string {
  switch (finding.kind) {
    case "hides-from-everyone":
      return real ? `${finding.name} is hidden from @everyone` : `${finding.name} would be hidden from @everyone`;
    case "outside-layout":
      return `${finding.name} is outside the layout`;
    case "extra-overwrite":
      return `${finding.name} has an overwrite for ${finding.target} that the layout does not name; kept`;
    case "wrong-type":
      return `${finding.name} is a ${finding.actual}, the layout wants a ${finding.expected}; kept`;
    case "other-category":
      return `${finding.name} is in ${finding.categoryName ?? "no category"}, not where the layout puts it; kept`;
    case "duplicate-name":
      return `${finding.name} exists more than once; Neil doesn't choose between them`;
    case "external-role-missing":
      return `${finding.name} (external role) is missing; its overwrites are left out`;
    case "role-has-permissions":
      return `${finding.name} holds permissions; Neil doesn't give or take it`;
    case "role-above-neil":
      return `${finding.name} is above Neil's role; Neil can't give it`;
    case "fallback-to-text":
      return `${finding.name}: without Community it is created as text instead of ${finding.from}`;
  }
}

/** The IDs as SETTING=value lines, from the server as it is now; a role or channel missing or doubled gives no line. */
function idLines(state: ServerState): string[] {
  const lines = [`DISCORD_GUILD_ID=${state.everyoneId}`];
  for (const setting of ID_SETTINGS) {
    const matches =
      setting.kind === "role"
        ? state.roles.filter((role) => role.name === setting.name)
        : state.channels.filter((channel) => channel.kind !== "category" && channel.name === setting.name);
    const [only] = matches;
    if (matches.length === 1 && only !== undefined) lines.push(`${setting.setting}=${only.id}`);
  }
  return lines;
}
