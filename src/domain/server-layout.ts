import { tagOfAllianceRole } from "./managed-roles.js";

export type Permission = "ViewChannel" | "SendMessages" | "SendMessagesInThreads" | "CreatePublicThreads" | "CreatePrivateThreads";
export type ChannelType = "text" | "voice" | "forum" | "announcement";

export interface OverwriteSpec {
  allow: Permission[];
  deny: Permission[];
}

export interface LayoutChannel {
  name: string;
  type: ChannelType;
  mode?: "read-only" | "only-king-posts";
  translated?: boolean;
  seenBy?: string[];
  overwrites?: Record<string, OverwriteSpec>;
}

export interface LayoutCategory {
  name: string;
  seenBy: string[];
  channels: LayoutChannel[];
}

/** The server layout file, as it is after the placeholders are read but before they are expanded. */
export interface ServerLayout {
  roles: string[];
  externalRoles: string[];
  languages: string[];
  categories: LayoutCategory[];
  allianceArea: { channels: { name: string; type: ChannelType }[] };
}

/** One overwrite a channel or category should carry. `target` is a role name, `@everyone`, `Neil` or an external role name. */
export interface WantedOverwrite {
  target: string;
  allow: Permission[];
  deny: Permission[];
}

export interface ExpandedChannel {
  name: string;
  type: ChannelType;
  overwrites: WantedOverwrite[];
}

export interface ExpandedCategory {
  name: string;
  overwrites: WantedOverwrite[];
  channels: ExpandedChannel[];
}

export interface ExpandedLayout {
  roles: string[];
  externalRoles: string[];
  categories: ExpandedCategory[];
}

export const EVERYONE_TARGET = "@everyone";
export const BOT_TARGET = "Neil";

const KINGDOM_PLACEHOLDER = "#<Home Kingdom>";
const KING_ROLE = "King";
const TRANSLATION_BOT_ROLE = "Interaction Bot";
const LANGUAGES_CATEGORY = "Languages";

const VIEW: Permission = "ViewChannel";
const SEND: Permission = "SendMessages";
const POSTING: Permission[] = ["SendMessages", "SendMessagesInThreads", "CreatePublicThreads", "CreatePrivateThreads"];

type Grant = "allow" | "deny";
type Grants = Map<string, Map<Permission, Grant>>;

/**
 * The wanted overwrites of a layout, with placeholders replaced, categories and channels expanded (data-model.md, Expansion).
 * A channel's overwrites are its category's, with the channel's own on top, own winning per permission.
 */
export function expandLayout(layout: ServerLayout, homeKingdom: number, allianceRoles: readonly string[]): ExpandedLayout {
  const resolve = (target: string): string => (target === KINGDOM_PLACEHOLDER ? `#${homeKingdom.toString()}` : target);
  const expand = (name: string, seenBy: readonly string[], channels: readonly LayoutChannel[]): ExpandedCategory => ({
    name,
    overwrites: toOverwrites(categoryGrants(seenBy.map(resolve))),
    channels: channels.map((channel) => expandChannel(channel, seenBy.map(resolve), resolve)),
  });

  const categories = layout.categories.map((category) => expand(category.name, category.seenBy, category.channels));
  if (layout.languages.length > 0) {
    categories.push(
      expand(
        LANGUAGES_CATEGORY,
        [],
        layout.languages.map((language) => ({ name: `${language.toLowerCase()}-chat`, type: "text", seenBy: [language] })),
      ),
    );
  }
  for (const roleName of allianceRoles) {
    if (tagOfAllianceRole(roleName) === undefined) continue;
    categories.push(expand(roleName, [roleName], layout.allianceArea.channels));
  }

  return {
    roles: [...layout.roles.map(resolve), ...layout.languages],
    externalRoles: [...layout.externalRoles],
    categories,
  };
}

function categoryGrants(seenBy: readonly string[]): Grants {
  const grants: Grants = new Map();
  grant(grants, EVERYONE_TARGET, [VIEW], "deny");
  for (const role of seenBy) grant(grants, role, [VIEW], "allow");
  return grants;
}

function expandChannel(channel: LayoutChannel, categorySeenBy: readonly string[], resolve: (target: string) => string): ExpandedChannel {
  const seenBy = (channel.seenBy ?? categorySeenBy).map(resolve);
  const grants = categoryGrants(seenBy);
  if (channel.mode === "read-only") {
    for (const role of seenBy) grant(grants, role, [SEND], "deny");
  }
  if (channel.mode === "only-king-posts") {
    for (const role of seenBy) grant(grants, role, POSTING, "deny");
    grant(grants, KING_ROLE, [VIEW, SEND], "allow");
  }
  if (channel.translated === true) grant(grants, TRANSLATION_BOT_ROLE, [VIEW, SEND], "allow");
  for (const [target, spec] of Object.entries(channel.overwrites ?? {})) {
    grant(grants, resolve(target), spec.allow, "allow");
    grant(grants, resolve(target), spec.deny, "deny");
  }
  return { name: channel.name, type: channel.type, overwrites: toOverwrites(grants) };
}

function grant(grants: Grants, target: string, permissions: readonly Permission[], how: Grant): void {
  if (permissions.length === 0) return;
  const perTarget = grants.get(target) ?? new Map<Permission, Grant>();
  for (const permission of permissions) perTarget.set(permission, how);
  grants.set(target, perTarget);
}

function toOverwrites(grants: Grants): WantedOverwrite[] {
  return [...grants].map(([target, perPermission]) => ({
    target,
    allow: [...perPermission].filter(([, how]) => how === "allow").map(([permission]) => permission),
    deny: [...perPermission].filter(([, how]) => how === "deny").map(([permission]) => permission),
  }));
}
