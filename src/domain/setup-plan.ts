import { tagOfAllianceRole } from "./managed-roles.js";
import {
  BOT_TARGET,
  EVERYONE_TARGET,
  expandLayout,
  ROLE_PERMISSION_BITS,
  type ChannelType,
  type ExpandedChannel,
  type ExpandedForum,
  type ExpandedLayout,
  type Permission,
  type RolePermission,
  type ServerLayout,
  type WantedOverwrite,
} from "./server-layout.js";

export interface ServerRole {
  id: string;
  name: string;
  /** The role's Discord permission bits, as Discord gives them. */
  permissions: bigint;
  managed: boolean;
  position: number;
  /** The layout's role permissions the role holds; left out when none is known (slice 028). */
  rolePermissions?: RolePermission[];
}

export interface ServerOverwrite {
  targetId: string;
  allow: Permission[];
  deny: Permission[];
}

export interface ServerChannel {
  id: string;
  name: string;
  kind: "category" | ChannelType;
  parentId: string | undefined;
  overwrites: ServerOverwrite[];
  /** The topic, undefined when the channel has none (and for categories). */
  topic: string | undefined;
  /** Neil's pinned description: the oldest pin by Neil that starts with 📌; undefined when there is none. */
  description: { messageId: string; text: string } | undefined;
  /** false when Discord refused the read of the pins, so the description is unknown. */
  pinsReadable: boolean;
  /** A forum's state; undefined for every other kind, and for a forum whose state was not read. */
  forum: ForumState | undefined;
}

/** A forum tag as the server holds it. The emoji and moderated flag are kept as read and sent back unchanged. */
export interface ForumTagState {
  id: string;
  name: string;
  moderated?: boolean;
  emojiId?: string | null;
  emojiName?: string | null;
}

/** A tag the set-forum-tags step writes: a kept tag by its id, with the fields it was read with, or a new one by name. */
export type ForumTagWrite = Partial<ForumTagState> & { name: string };

/** What the server holds of a forum beyond its channel: tags, reaction and posts (slice 030, data-model.md). */
export interface ForumState {
  /** The forum's available tags. */
  tags: ForumTagState[];
  /** The default reaction's emoji name; undefined when none is set. */
  reaction: string | undefined;
  /** false when Discord refused the read of the forum's posts, so Neil's how-to post is unknown. */
  postsReadable: boolean;
  /** Neil's how-to post: the oldest post by Neil whose starter starts with 📌; undefined when there is none. */
  howTo: { threadId: string; title: string; content: string; archived: boolean; pinned: boolean } | undefined;
  /** Whether another post of the forum is pinned. */
  otherPinned: boolean;
}

/** The server as read by the adapter: what the plan needs and nothing it could change. */
export interface ServerState {
  everyoneId: string;
  botUserId: string;
  botTopPosition: number;
  hasCommunity: boolean;
  botIsAdministrator: boolean;
  roles: ServerRole[];
  channels: ServerChannel[];
}

export type SetupStep =
  | { kind: "create-role"; name: string }
  | { kind: "create-category"; name: string; overwrites: WantedOverwrite[] }
  | {
      kind: "create-channel";
      name: string;
      categoryName: string;
      type: ChannelType;
      overwrites: WantedOverwrite[];
      fallbackFrom?: "announcement";
      topic: string | undefined;
    }
  | {
      kind: "correct-overwrites";
      id: string;
      name: string;
      hidesFromEveryone: boolean;
      overwrites: WantedOverwrite[];
    }
  | { kind: "set-topic"; id: string; name: string; topic: string }
  /** A role permission the role lacks; a role the run creates gets it too. Planned after the role's create-role step. */
  | { kind: "allow-permission"; name: string; permission: RolePermission }
  /** A channel that has no Neil description yet; `id` is undefined for a channel the plan creates. */
  /** `pinned` is false in a voice channel, where Discord can't pin: there the description is its first message. */
  | { kind: "post-description"; name: string; categoryName: string; id: string | undefined; content: string; pinned: boolean }
  | { kind: "edit-description"; id: string; name: string; messageId: string; content: string }
  /** A forum's tags: the whole list, present tags with their ids in layout order, then the new ones, then the extras. */
  | { kind: "set-forum-tags"; id: string | undefined; name: string; categoryName: string; tags: ForumTagWrite[] }
  | { kind: "set-forum-reaction"; id: string | undefined; name: string; categoryName: string; reaction: string }
  /** Neil's how-to post; `pin` is false when another post of the forum is pinned. */
  | {
      kind: "open-how-to";
      id: string | undefined;
      name: string;
      categoryName: string;
      title: string;
      content: string;
      pin: boolean;
    }
  | { kind: "edit-how-to"; threadId: string; name: string; title: string; content: string; unarchive: boolean }
  /** `unarchive` is true when the post is archived, since Discord refuses to pin an archived post. */
  | { kind: "pin-how-to"; threadId: string; name: string; unarchive: boolean };

export type SetupFinding =
  | { kind: "outside-layout"; name: string }
  | { kind: "extra-overwrite"; name: string; target: string }
  | { kind: "wrong-type"; name: string; expected: ChannelType; actual: "category" | ChannelType }
  | { kind: "other-category"; name: string; categoryName: string | undefined }
  | { kind: "duplicate-name"; name: string }
  | { kind: "external-role-missing"; name: string }
  | { kind: "role-has-permissions"; name: string }
  | { kind: "role-above-neil"; name: string }
  | { kind: "fallback-to-text"; name: string; from: "announcement" }
  | { kind: "hides-from-everyone"; name: string }
  /** The pins of a channel could not be read, so its description is neither posted nor edited. */
  | { kind: "descriptions-unread"; name: string }
  /** A tag the layout does not name; kept. */
  | { kind: "extra-tag"; name: string; tag: string }
  /** Another post is pinned, so Neil's how-to post is not pinned. */
  | { kind: "other-post-pinned"; name: string }
  /** The posts of a forum could not be read, so its how-to post is neither posted nor edited. */
  | { kind: "forum-posts-unread"; name: string };

export interface SetupPlan {
  steps: SetupStep[];
  findings: SetupFinding[];
}

type Lookup<T> = { kind: "none" } | { kind: "one"; item: T } | { kind: "many"; items: readonly T[] };

interface Plan {
  readonly server: ServerState;
  readonly missingExternalRoles: Set<string>;
  readonly roleSteps: SetupStep[];
  readonly categorySteps: SetupStep[];
  readonly channelSteps: SetupStep[];
  readonly topicSteps: SetupStep[];
  readonly descriptionSteps: SetupStep[];
  readonly forumSteps: SetupStep[];
  readonly findings: SetupFinding[];
  /** The layout's rolePermissions: a listed role may hold the bits they grant, and no other permission bits. */
  readonly rolePermissions: Record<string, RolePermission[]>;
  /** Server channels and categories the layout accounts for; any other is outside the layout. */
  readonly claimed: Set<string>;
}

/** Roles of the layout that may hold any permission without a finding: Moderator and King. */
const PERMISSION_ROLES = ["Moderator", "King"];
/** The variation selector that turns an emoji into its emoji presentation (U+FE0F). */
const VARIATION_SELECTOR = /\uFE0F/gu;
/** The state of a forum the plan creates: no tags, no reaction and no posts. */
const NO_FORUM_STATE: ForumState = { tags: [], reaction: undefined, postsReadable: true, howTo: undefined, otherPinned: false };

/**
 * The steps and findings that make a server match the layout (data-model.md, Setup plan). Reads nothing but its arguments
 * and writes nothing. The `[TAG]` roles of the server give the Alliance areas.
 */
export function planSetup(layout: ServerLayout, server: ServerState, homeKingdom: number): SetupPlan {
  const allianceRoleNames = allianceRoleNamesOf(server);
  const expanded = expandLayout(layout, homeKingdom, allianceRoleNames);
  const plan: Plan = {
    server,
    missingExternalRoles: new Set(),
    roleSteps: [],
    categorySteps: [],
    channelSteps: [],
    topicSteps: [],
    descriptionSteps: [],
    forumSteps: [],
    findings: [],
    rolePermissions: layout.rolePermissions ?? {},
    claimed: new Set(),
  };

  planRoles(plan, expanded);
  planRolePermissions(plan, layout.rolePermissions ?? {});
  planCategories(plan, expanded, allianceRoleNames);
  for (const channel of server.channels) {
    if (!plan.claimed.has(channel.id)) plan.findings.push({ kind: "outside-layout", name: channel.name });
  }

  return {
    steps: [
      ...plan.roleSteps,
      ...plan.categorySteps,
      ...plan.channelSteps,
      ...plan.topicSteps,
      ...plan.descriptionSteps,
      ...plan.forumSteps,
    ],
    findings: plan.findings,
  };
}

/** The names of the server's `[TAG]` roles, which give the Alliance areas. */
export function allianceRoleNamesOf(server: ServerState): string[] {
  return [...new Set(server.roles.map((role) => role.name).filter((name) => tagOfAllianceRole(name) !== undefined))];
}

function lookup<T>(items: readonly T[]): Lookup<T> {
  const [first, second] = items;
  if (first === undefined) return { kind: "none" };
  if (second !== undefined) return { kind: "many", items };
  return { kind: "one", item: first };
}

function planRoles(plan: Plan, layout: ExpandedLayout): void {
  for (const name of layout.roles) {
    const found = lookup(plan.server.roles.filter((role) => role.name === name));
    if (found.kind === "none") plan.roleSteps.push({ kind: "create-role", name });
    else if (found.kind === "many") plan.findings.push({ kind: "duplicate-name", name });
    else reviewRole(plan, found.item);
  }
  for (const name of layout.externalRoles) {
    const found = lookup(plan.server.roles.filter((role) => role.name === name));
    if (found.kind === "none") {
      plan.missingExternalRoles.add(name);
      plan.findings.push({ kind: "external-role-missing", name });
    } else if (found.kind === "many") plan.findings.push({ kind: "duplicate-name", name });
  }
}

/** Each role permission a listed role lacks. Only missing ones are planned: nothing is removed, and a role not there yet lacks all. */
function planRolePermissions(plan: Plan, rolePermissions: Record<string, RolePermission[]>): void {
  for (const [name, permissions] of Object.entries(rolePermissions)) {
    const found = lookup(plan.server.roles.filter((role) => role.name === name));
    if (found.kind === "many") continue;
    const held = found.kind === "one" ? (found.item.rolePermissions ?? []) : [];
    for (const permission of new Set(permissions)) {
      if (!held.includes(permission)) plan.roleSteps.push({ kind: "allow-permission", name, permission });
    }
  }
}

/** A listed role may hold the bits its rolePermissions grant; any other bit it holds is a finding, unless Moderator or King. */
function reviewRole(plan: Plan, role: ServerRole): void {
  const granted = grantedBitsOf(plan.rolePermissions[role.name] ?? []);
  const beyond = role.permissions & ~granted;
  const exempt = PERMISSION_ROLES.includes(role.name);
  if (beyond !== 0n && !exempt) plan.findings.push({ kind: "role-has-permissions", name: role.name });
  if (role.position >= plan.server.botTopPosition) plan.findings.push({ kind: "role-above-neil", name: role.name });
}

function grantedBitsOf(permissions: readonly RolePermission[]): bigint {
  return permissions.reduce((bits, name) => bits | ROLE_PERMISSION_BITS[name], 0n);
}

function planCategories(plan: Plan, layout: ExpandedLayout, allianceRoleNames: readonly string[]): void {
  for (const category of layout.categories) {
    const isAlliance = allianceRoleNames.includes(category.name);
    const found = lookup(plan.server.channels.filter((channel) => channel.kind === "category" && channel.name === category.name));
    if (found.kind === "none") {
      plan.categorySteps.push({ kind: "create-category", name: category.name, overwrites: usable(plan, category.overwrites) });
      for (const channel of category.channels) planChannel(plan, channel, category.name, undefined, isAlliance);
    } else if (found.kind === "many") {
      plan.findings.push({ kind: "duplicate-name", name: category.name });
      claimWithChildren(plan, found.items);
    } else {
      plan.claimed.add(found.item.id);
      checkOverwrites(plan, found.item, usable(plan, category.overwrites), plan.categorySteps);
      for (const channel of category.channels) planChannel(plan, channel, category.name, found.item.id, isAlliance);
    }
  }
}

/** Duplicated categories are left alone: they and their channels count as in the layout, but nothing is planned for them. */
function claimWithChildren(plan: Plan, categories: readonly ServerChannel[]): void {
  for (const category of categories) {
    plan.claimed.add(category.id);
    for (const child of plan.server.channels) {
      if (child.parentId === category.id) plan.claimed.add(child.id);
    }
  }
}

function planChannel(
  plan: Plan,
  channel: ExpandedChannel,
  categoryName: string,
  categoryId: string | undefined,
  isAlliance: boolean,
): void {
  const named = plan.server.channels.filter((candidate) => candidate.kind !== "category" && candidate.name === channel.name);
  const inCategory = categoryId === undefined ? [] : named.filter((candidate) => candidate.parentId === categoryId);
  const elsewhere = inCategory.length === 0;
  const found: Lookup<ServerChannel> =
    !elsewhere ? lookup(inCategory) : isAlliance ? { kind: "none" } : lookup(named);

  if (found.kind === "none") {
    createChannel(plan, channel, categoryName);
    return;
  }
  if (found.kind === "many") {
    plan.findings.push({ kind: "duplicate-name", name: channel.name });
    for (const candidate of found.items) plan.claimed.add(candidate.id);
    return;
  }

  const existing = found.item;
  plan.claimed.add(existing.id);
  if (elsewhere) {
    plan.findings.push({ kind: "other-category", name: channel.name, categoryName: categoryNameOf(plan.server, existing.parentId) });
  }
  if (!typeMatches(existing.kind, channel.type, plan.server.hasCommunity)) {
    plan.findings.push({ kind: "wrong-type", name: channel.name, expected: channel.type, actual: existing.kind });
    return;
  }
  checkOverwrites(plan, existing, usable(plan, channel.overwrites), plan.channelSteps);
  checkText(plan, existing, channel, categoryName);
  if (channel.forum !== undefined) planForumState(plan, channel.forum, channel.name, categoryName, existing.id, existing.forum);
}

/** The topic of a channel that exists, and Neil's description: posted when missing, edited when its text differs. */
function checkText(plan: Plan, existing: ServerChannel, channel: ExpandedChannel, categoryName: string): void {
  if (channel.topic !== undefined && channel.topic !== existing.topic) {
    plan.topicSteps.push({ kind: "set-topic", id: existing.id, name: channel.name, topic: channel.topic });
  }
  if (channel.message === undefined) return;
  if (!existing.pinsReadable) {
    plan.findings.push({ kind: "descriptions-unread", name: channel.name });
    return;
  }
  if (existing.description === undefined) {
    plan.descriptionSteps.push({
      kind: "post-description",
      name: channel.name,
      categoryName,
      id: existing.id,
      content: channel.message,
      pinned: channel.type !== "voice",
    });
  } else if (existing.description.text !== channel.message) {
    plan.descriptionSteps.push({
      kind: "edit-description",
      id: existing.id,
      name: channel.name,
      messageId: existing.description.messageId,
      content: channel.message,
    });
  }
}

function createChannel(plan: Plan, channel: ExpandedChannel, categoryName: string): void {
  const overwrites = usable(plan, channel.overwrites);
  if (!plan.server.hasCommunity && channel.type === "announcement") {
    plan.channelSteps.push({
      kind: "create-channel",
      name: channel.name,
      categoryName,
      type: "text",
      overwrites,
      fallbackFrom: channel.type,
      topic: channel.topic,
    });
    plan.findings.push({ kind: "fallback-to-text", name: channel.name, from: channel.type });
  } else {
    plan.channelSteps.push({ kind: "create-channel", name: channel.name, categoryName, type: channel.type, overwrites, topic: channel.topic });
  }
  if (channel.message !== undefined) {
    plan.descriptionSteps.push({
      kind: "post-description",
      name: channel.name,
      categoryName,
      id: undefined,
      content: channel.message,
      pinned: channel.type !== "voice",
    });
  }
  if (channel.forum !== undefined) planForumState(plan, channel.forum, channel.name, categoryName, undefined, NO_FORUM_STATE);
}

/**
 * The steps that bring a forum's tags, reaction and how-to post in step with the layout (data-model.md, Steps). `id` is
 * undefined for a forum the plan creates. A forum whose state was not read gets no steps.
 */
function planForumState(
  plan: Plan,
  wanted: ExpandedForum,
  name: string,
  categoryName: string,
  id: string | undefined,
  state: ForumState | undefined,
): void {
  if (state === undefined) return;
  planForumTags(plan, wanted, name, categoryName, id, state);
  if (bareEmoji(state.reaction) !== bareEmoji(wanted.reaction)) {
    plan.forumSteps.push({ kind: "set-forum-reaction", id, name, categoryName, reaction: wanted.reaction });
  }
  planHowTo(plan, wanted, name, categoryName, id, state);
}

/** An emoji without its variation selector: the layout and Discord may each include U+FE0F or leave it out. */
function bareEmoji(emoji: string | undefined): string | undefined {
  return emoji?.replace(VARIATION_SELECTOR, "");
}

/** Tag names are the same tag when they differ only in case (slice 030). */
function sameTagName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Missing tags, and kept tags whose case differs from the layout's, give one step with the whole list: the layout's tags in
 * its order, with a kept tag taking the layout's spelling, then the new ones, then the extras, which stay.
 */
function planForumTags(
  plan: Plan,
  wanted: ExpandedForum,
  name: string,
  categoryName: string,
  id: string | undefined,
  state: ForumState,
): void {
  const missing = wanted.tags.filter((tag) => !state.tags.some((existing) => sameTagName(existing.name, tag)));
  const present = wanted.tags.flatMap((tag) =>
    state.tags.filter((existing) => sameTagName(existing.name, tag)).map((existing) => ({ ...existing, name: tag })),
  );
  const extras = state.tags.filter((existing) => !wanted.tags.some((tag) => sameTagName(existing.name, tag)));
  for (const extra of extras) plan.findings.push({ kind: "extra-tag", name, tag: extra.name });
  const renamed = present.some((kept) => state.tags.some((existing) => existing.id === kept.id && existing.name !== kept.name));
  if (missing.length === 0 && !renamed) return;
  const tags: ForumTagWrite[] = [...present, ...missing.map((tag) => ({ name: tag })), ...extras];
  plan.forumSteps.push({ kind: "set-forum-tags", id, name, categoryName, tags });
}

/** Neil's how-to post: opened when missing, edited when its text differs, pinned when unpinned and no other post is. */
function planHowTo(
  plan: Plan,
  wanted: ExpandedForum,
  name: string,
  categoryName: string,
  id: string | undefined,
  state: ForumState,
): void {
  if (!state.postsReadable) {
    plan.findings.push({ kind: "forum-posts-unread", name });
    return;
  }
  const { title, content } = wanted.howTo;
  const howTo = state.howTo;
  if (state.otherPinned && (howTo === undefined || !howTo.pinned)) plan.findings.push({ kind: "other-post-pinned", name });
  if (howTo === undefined) {
    plan.forumSteps.push({ kind: "open-how-to", id, name, categoryName, title, content, pin: !state.otherPinned });
    return;
  }
  if (howTo.title !== title || howTo.content !== content) {
    plan.forumSteps.push({ kind: "edit-how-to", threadId: howTo.threadId, name, title, content, unarchive: howTo.archived });
  }
  if (!howTo.pinned && !state.otherPinned) plan.forumSteps.push({ kind: "pin-how-to", threadId: howTo.threadId, name, unarchive: howTo.archived });
}

/** Without Community an announcement channel is planned as text, so an existing text channel stands for it. Forums need no Community. */
function typeMatches(actual: "category" | ChannelType, expected: ChannelType, hasCommunity: boolean): boolean {
  if (actual === expected) return true;
  return !hasCommunity && actual === "text" && expected === "announcement";
}

/**
 * Compares the wanted overwrites with those of an existing channel or category. Named permissions missing from the
 * server give a correction listing the whole wanted overwrite of each such target; other permissions and extra
 * overwrites are only reported.
 */
function checkOverwrites(plan: Plan, existing: ServerChannel, wanted: WantedOverwrite[], steps: SetupStep[]): void {
  const { server } = plan;
  const wantedIds = new Set(wanted.map((overwrite) => targetIdOf(server, overwrite.target)));
  for (const overwrite of existing.overwrites) {
    if (!wantedIds.has(overwrite.targetId)) {
      plan.findings.push({ kind: "extra-overwrite", name: existing.name, target: describeTarget(server, overwrite.targetId) });
    }
  }

  const hidesFromEveryone = wantsHiddenFromEveryone(wanted) && !isHiddenFromEveryone(server, existing);
  if (hidesFromEveryone) plan.findings.push({ kind: "hides-from-everyone", name: existing.name });

  const missing = wanted.filter((overwrite) => isMissing(server, existing, overwrite));
  if (missing.length > 0) {
    steps.push({ kind: "correct-overwrites", id: existing.id, name: existing.name, hidesFromEveryone, overwrites: missing });
  }
}

function isMissing(server: ServerState, existing: ServerChannel, wanted: WantedOverwrite): boolean {
  const id = targetIdOf(server, wanted.target);
  const current = existing.overwrites.find((overwrite) => overwrite.targetId === id);
  return (
    wanted.allow.some((permission) => !(current?.allow.includes(permission) ?? false)) ||
    wanted.deny.some((permission) => !(current?.deny.includes(permission) ?? false))
  );
}

function wantsHiddenFromEveryone(wanted: readonly WantedOverwrite[]): boolean {
  return wanted.some((overwrite) => overwrite.target === EVERYONE_TARGET && overwrite.deny.includes("ViewChannel"));
}

function isHiddenFromEveryone(server: ServerState, existing: ServerChannel): boolean {
  return existing.overwrites.some((overwrite) => overwrite.targetId === server.everyoneId && overwrite.deny.includes("ViewChannel"));
}

/** Drops the wanted overwrites of external roles the server lacks: they cannot be written, and the finding says so. */
function usable(plan: Plan, overwrites: readonly WantedOverwrite[]): WantedOverwrite[] {
  return overwrites.filter((overwrite) => !plan.missingExternalRoles.has(overwrite.target));
}

/** The server id of a wanted target; undefined when no single role of that name exists (yet). */
function targetIdOf(server: ServerState, target: string): string | undefined {
  if (target === EVERYONE_TARGET) return server.everyoneId;
  if (target === BOT_TARGET) return server.botUserId;
  const found = lookup(server.roles.filter((role) => role.name === target));
  return found.kind === "one" ? found.item.id : undefined;
}

function describeTarget(server: ServerState, id: string): string {
  if (id === server.everyoneId) return EVERYONE_TARGET;
  if (id === server.botUserId) return BOT_TARGET;
  return server.roles.find((role) => role.id === id)?.name ?? id;
}

function categoryNameOf(server: ServerState, parentId: string | undefined): string | undefined {
  if (parentId === undefined) return undefined;
  return server.channels.find((channel) => channel.id === parentId)?.name;
}
