import { describeChannel } from "./channel-description.js";
import { forumHowTo, type ForumHowTo } from "./forum-how-to.js";
import { allianceLeadersRoleName, tagOfAllianceRole } from "./managed-roles.js";

export type Permission =
  | "ViewChannel"
  | "SendMessages"
  | "SendMessagesInThreads"
  | "CreatePublicThreads"
  | "CreatePrivateThreads"
  | "ManageThreads"
  | "ReadMessageHistory"
  | "EmbedLinks"
  | "PinMessages"
  | "AddReactions"
  | "Connect"
  | "Speak";
export type ChannelType = "text" | "voice" | "forum" | "announcement";
/** A permission the layout gives a whole role, not an overwrite (slice 028, plan D10). */
export type RolePermission = "CreateEvents";
/** The Discord bit of each role permission the layout may give (slice 028, plan D10): CreateEvents is bit 44. */
export const ROLE_PERMISSION_BITS: Record<RolePermission, bigint> = {
  CreateEvents: 1n << 44n,
};

/** The Discord permission bits of the given role permissions, combined. */
export function permissionBits(permissions: readonly RolePermission[]): bigint {
  return permissions.reduce((bits, name) => bits | ROLE_PERMISSION_BITS[name], 0n);
}

/**
 * The role permissions the setup grants each role by name: the same as server-layout.json's rolePermissions. Neil never
 * reads that file (it is not deployed), so this is how it knows the setup's own grants; a test keeps the two equal.
 */
export const ROLE_GRANTS: Readonly<Record<string, readonly RolePermission[]>> = {
  R4: ["CreateEvents"],
  R5: ["CreateEvents"],
  Moderator: ["CreateEvents"],
  King: ["CreateEvents"],
};

/** The Discord permission bits the setup grants a role of the name: none when the setup grants it nothing. */
export function grantedRoleBits(name: string): bigint {
  return Object.hasOwn(ROLE_GRANTS, name) ? permissionBits(ROLE_GRANTS[name] ?? []) : 0n;
}

export interface OverwriteSpec {
  allow: Permission[];
  deny: Permission[];
}

/** What a forum needs to be set up: its tags, the reaction Neil suggests, and the how-to post Neil pins (slice 030). */
export interface ForumSetup {
  tags: string[];
  reaction: string;
  howTo: { belongs: string; exampleTitle: string; template: string[] };
}

export interface LayoutChannel {
  name: string;
  type: ChannelType;
  /** What the channel is for, 1 to 1024 characters; Neil pins it (slice 029). */
  description: string;
  /** The rules a Member accepts to see the channel; copied from code-of-conduct.md (slice 029). */
  codeOfConduct?: string[];
  mode?: "read-only" | "only-king-posts";
  translated?: boolean;
  seenBy?: string[];
  overwrites?: Record<string, OverwriteSpec>;
  /** Required on a forum, and only there (slice 030). */
  forum?: ForumSetup;
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
  translations: string[];
  categories: LayoutCategory[];
  allianceArea: { channels: LayoutChannel[] };
  /** The permissions each listed role should hold; missing ones are added, never removed (slice 028, plan D10). */
  rolePermissions?: Record<string, RolePermission[]>;
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
  /** The description, undefined for voice (slice 029). */
  topic: string | undefined;
  /** The description message, undefined for forums (slice 029). */
  message: string | undefined;
  /** The forum's tags, reaction and how-to post; undefined for every other type (slice 030). */
  forum: ExpandedForum | undefined;
}

/** What a forum should carry: its tags, its default reaction and the how-to post Neil pins (slice 030). */
export interface ExpandedForum {
  tags: string[];
  reaction: string;
  howTo: ForumHowTo;
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
/** Neil Police's role on the test server; never named in the layout, only added by the setup plan (issue #127). */
export const POLICE_TARGET = "Neil Police";

const KINGDOM_PLACEHOLDER = "#<Home Kingdom>";
/** In the Alliance area only: the Alliance Leaders Role of the Alliance the area is for (slice 045). */
export const ALLIANCE_LEADERS_PLACEHOLDER = "<Alliance> Leaders";
const KING_ROLE = "King";
const TRANSLATION_BOT_ROLE = "Interaction Bot";
const LANGUAGES_CATEGORY = "Languages";

/** The description of a translated copy: the original's text, then the credit to the translation bot (slice 029). */
export function translatedDescription(description: string, language: string): string {
  return `${description} Translated into ${language} by ${TRANSLATION_BOT_ROLE}.`;
}

const VIEW: Permission = "ViewChannel";
const SEND: Permission = "SendMessages";
const HISTORY: Permission = "ReadMessageHistory";
const POSTING: Permission[] = ["SendMessages", "SendMessagesInThreads", "CreatePublicThreads", "CreatePrivateThreads"];

/**
 * What a seer of each type of channel may do there, granted on the channel so it works whatever @everyone holds on the
 * server: a read-only or only-king-posts channel drops the posting part.
 */
const SEER_GRANTS: Record<ChannelType, { reading: Permission[]; posting: Permission[] }> = {
  text: { reading: [VIEW, HISTORY], posting: [SEND] },
  announcement: { reading: [VIEW, HISTORY], posting: [SEND] },
  forum: { reading: [VIEW, HISTORY], posting: [SEND, "SendMessagesInThreads"] },
  voice: { reading: [VIEW, "Connect", "Speak"], posting: [] },
};

type Grant = "allow" | "deny";
type Grants = Map<string, Map<Permission, Grant>>;

/**
 * The wanted overwrites of a layout, with placeholders replaced, categories and channels expanded (data-model.md, Expansion).
 * A channel's overwrites are its category's, with the channel's own on top, own winning per permission.
 */
export function expandLayout(layout: ServerLayout, homeKingdom: number, allianceRoles: readonly string[]): ExpandedLayout {
  const resolve = (target: string): string => (target === KINGDOM_PLACEHOLDER ? `#${homeKingdom.toString()}` : target);
  const expansion: Expansion = { resolve, hidden: new Set([BOT_TARGET, ...layout.externalRoles]) };
  const expandWithCopies = (channel: LayoutChannel, categorySeenBy: readonly string[]): ExpandedChannel[] => {
    const original = expandChannel(channel, categorySeenBy, expansion);
    if (channel.translated !== true) return [original];
    // A copy carries no overwrites of the original: what Neil may do in the original (post, pin) is not needed there.
    const copied: LayoutChannel = { ...channel, overwrites: {} };
    const copies = layout.translations.map((language) =>
      expandChannel(
        {
          ...copied,
          name: `${channel.name}-${language.toLowerCase()}`,
          seenBy: [language],
          description: translatedDescription(channel.description, language),
        },
        categorySeenBy,
        expansion,
      ),
    );
    return [original, ...copies];
  };
  const expand = (name: string, seenBy: readonly string[], channels: readonly LayoutChannel[]): ExpandedCategory => ({
    name,
    overwrites: toOverwrites(categoryGrants(seenBy.map(resolve))),
    channels: channels.flatMap((channel) => expandWithCopies(channel, seenBy.map(resolve))),
  });
  // An Alliance area names its own Leaders Role by the placeholder; it is resolved per Alliance, so only that
  // Alliance's channels name it.
  const expandAllianceArea = (roleName: string, tag: string): ExpandedCategory => {
    const leadersRole = allianceLeadersRoleName(tag);
    const withLeaders = (target: string): string => (target === ALLIANCE_LEADERS_PLACEHOLDER ? leadersRole : target);
    const areaChannels = layout.allianceArea.channels.map(
      (channel): LayoutChannel => ({
        ...channel,
        ...(channel.seenBy === undefined ? {} : { seenBy: channel.seenBy.map(withLeaders) }),
        ...(channel.overwrites === undefined
          ? {}
          : {
              overwrites: Object.fromEntries(
                Object.entries(channel.overwrites).map(([target, spec]) => [withLeaders(target), spec]),
              ),
            }),
      }),
    );
    return expand(roleName, [roleName], areaChannels);
  };

  const categories = layout.categories.map((category) => expand(category.name, category.seenBy, category.channels));
  if (layout.languages.length > 0) {
    categories.push(
      expand(
        LANGUAGES_CATEGORY,
        [],
        layout.languages.map((language) => ({
          name: `${language.toLowerCase()}-chat`,
          type: "text",
          description: `Chat in ${language}.`,
          seenBy: [language],
        })),
      ),
    );
  }
  const leadersRoles: string[] = [];
  const namesLeaders = layout.allianceArea.channels.some(
    (channel) =>
      (channel.seenBy ?? []).includes(ALLIANCE_LEADERS_PLACEHOLDER) ||
      Object.hasOwn(channel.overwrites ?? {}, ALLIANCE_LEADERS_PLACEHOLDER),
  );
  for (const roleName of allianceRoles) {
    const tag = tagOfAllianceRole(roleName);
    if (tag === undefined) continue;
    categories.push(expandAllianceArea(roleName, tag));
    if (namesLeaders) leadersRoles.push(allianceLeadersRoleName(tag));
  }

  return {
    // The Alliance Leaders Roles the Alliance areas name are wanted too, so the setup creates them before the channels.
    roles: [...layout.roles.map(resolve), ...layout.languages, ...leadersRoles],
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

/** What a channel is expanded with: the placeholder resolution and the targets Neil never names as seers. */
interface Expansion {
  resolve: (target: string) => string;
  hidden: ReadonlySet<string>;
}

function expandChannel(channel: LayoutChannel, categorySeenBy: readonly string[], expansion: Expansion): ExpandedChannel {
  const { resolve } = expansion;
  const seenBy = (channel.seenBy ?? categorySeenBy).map(resolve);
  const grants = categoryGrants(seenBy);
  const seer = SEER_GRANTS[channel.type];
  if (channel.type === "forum") grant(grants, EVERYONE_TARGET, [SEND], "deny");
  for (const role of seenBy) {
    grant(grants, role, seer.reading, "allow");
    if (channel.mode === undefined) grant(grants, role, seer.posting, "allow");
    else grant(grants, role, POSTING, "deny");
  }
  if (channel.mode === "only-king-posts") grant(grants, KING_ROLE, [VIEW, SEND, HISTORY], "allow");
  if (channel.translated === true) grant(grants, TRANSLATION_BOT_ROLE, [VIEW, SEND], "allow");
  for (const [target, spec] of Object.entries(channel.overwrites ?? {})) {
    grant(grants, resolve(target), spec.allow, "allow");
    grant(grants, resolve(target), spec.deny, "deny");
  }
  const overwrites = toOverwrites(grants);
  return {
    name: channel.name,
    type: channel.type,
    overwrites,
    ...describeChannel(channel, overwrites, expansion.hidden),
    forum: channel.forum === undefined ? undefined : expandForum(channel.name, channel.forum),
  };
}

function expandForum(name: string, forum: ForumSetup): ExpandedForum {
  return { tags: [...forum.tags], reaction: forum.reaction, howTo: forumHowTo(name, forum) };
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
