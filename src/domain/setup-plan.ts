import { tagOfAllianceRole } from "./managed-roles.js";
import {
  BOT_TARGET,
  EVERYONE_TARGET,
  expandLayout,
  type ChannelType,
  type ExpandedChannel,
  type ExpandedLayout,
  type Permission,
  type RolePermission,
  type ServerLayout,
  type WantedOverwrite,
} from "./server-layout.js";

export interface ServerRole {
  id: string;
  name: string;
  hasPermissions: boolean;
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
  | { kind: "edit-description"; id: string; name: string; messageId: string; content: string };

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
  | { kind: "descriptions-unread"; name: string };

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
  readonly findings: SetupFinding[];
  /** The roles the layout names in rolePermissions: they may hold permissions without a finding. */
  readonly rolePermissionRoles: ReadonlySet<string>;
  /** Server channels and categories the layout accounts for; any other is outside the layout. */
  readonly claimed: Set<string>;
}

/** Roles of the layout that may hold permissions without a finding, besides those rolePermissions names: Moderator and King. */
const PERMISSION_ROLES = ["Moderator", "King"];

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
    findings: [],
    rolePermissionRoles: new Set(Object.keys(layout.rolePermissions ?? {})),
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

function reviewRole(plan: Plan, role: ServerRole): void {
  const exempt = PERMISSION_ROLES.includes(role.name) || plan.rolePermissionRoles.has(role.name);
  if (role.hasPermissions && !exempt) plan.findings.push({ kind: "role-has-permissions", name: role.name });
  if (role.position >= plan.server.botTopPosition) plan.findings.push({ kind: "role-above-neil", name: role.name });
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
