import {
  ChannelType,
  DiscordAPIError,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type APIEmbed,
  type BaseMessageOptions,
  type Guild,
} from "discord.js";
import { allianceRoleName, tagOfAllianceRole } from "../domain/managed-roles.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { PostedCard } from "../storage/raid-store.js";
import type { EventRole } from "./events.js";
import { listEveryMember } from "./member-listing.js";

/** A Member as the Raid reads them: the id and the roles held. */
export interface RaidMember {
  readonly id: string;
  readonly roles: readonly EventRole[];
}

/** What a card is edited to: its embeds and buttons. */
export interface CardEdit {
  readonly embeds: APIEmbed[];
  readonly components: APIActionRowComponent<APIButtonComponentWithCustomId>[];
}

/** The Discord server as the Raid planning and its clock use it. */
export interface RaidServer {
  /** Every Member, read over REST page by page. */
  members(): Promise<readonly RaidMember[]>;
  /** The tags of the server's `[TAG]` Alliance roles: the Home Kingdom Alliances. */
  allianceTags(): readonly string[];
  /** A text or announcement channel by name. */
  channelIdNamed(name: string): string | undefined;
  /** The alliance-chat of an Alliance's area. */
  allianceChatId(tag: string): string | undefined;
  /** Posts a message; the posted card's channel and message. */
  post(channelId: string, message: BaseMessageOptions): Promise<PostedCard>;
  /** Edits a posted card; false when it is gone. */
  edit(card: PostedCard, edit: CardEdit): Promise<boolean>;
  /** A line in #neil-log, with mentions off. */
  log(line: string): Promise<void>;
}

const LEADER_RANKS = ["R5", "R4"];
const ALLIANCE_CHAT_CHANNEL = "alliance-chat";

/** The Members who hold the Alliance role of one of the tags and R5 or R4: the leaders asked and chased. */
export function leadersOf(members: readonly RaidMember[], tags: readonly string[]): MemberId[] {
  const roleNames = new Set(tags.map(allianceRoleName));
  return members
    .filter(
      (member) =>
        member.roles.some((role) => roleNames.has(role.name)) && member.roles.some((role) => LEADER_RANKS.includes(role.name)),
    )
    .map((member) => member.id);
}

/** The Members who hold a role, by its id. */
export function holdersOfRole(members: readonly RaidMember[], roleId: string): MemberId[] {
  return members.filter((member) => member.roles.some((role) => role.id === roleId)).map((member) => member.id);
}

/** The Members of an Alliance: the holders of its `[TAG]` role. */
export function allianceMembersOf(members: readonly RaidMember[], tag: string): MemberId[] {
  const roleName = allianceRoleName(tag);
  return members.filter((member) => member.roles.some((role) => role.name === roleName)).map((member) => member.id);
}

/** Discord's "Unknown Channel" and "Unknown Message": the card is gone. Any other failure is thrown, so no second card is posted. */
const GONE_CODES = [10003, 10008];

function orGone(error: unknown): void {
  if (error instanceof DiscordAPIError && typeof error.code === "number" && GONE_CODES.includes(error.code)) return;
  throw error;
}

const POSTABLE = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

/** The Raid's view of the guild. Neil posts into an announcement channel (kvk-announcements) as into a text channel. */
export function raidServerOf(guild: Guild, options: { readonly log: (message: BaseMessageOptions) => Promise<void> }): RaidServer {
  const findChannel = (name: string, categoryName?: string): string | undefined =>
    [...guild.channels.cache.values()].find(
      (channel) =>
        POSTABLE.includes(channel.type) &&
        channel.name === name &&
        (categoryName === undefined || channel.parent?.name === categoryName),
    )?.id;
  return {
    async members() {
      const members = await listEveryMember(async (after, limit) => [
        ...(await guild.members.list(after === undefined ? { limit } : { after, limit })).values(),
      ]);
      return members.map((member) => ({
        id: member.id,
        roles: [...member.roles.cache.values()].map((role) => ({ id: role.id, name: role.name })),
      }));
    },
    allianceTags() {
      return [...guild.roles.cache.values()]
        .flatMap((role) => {
          const tag = tagOfAllianceRole(role.name);
          return tag === undefined ? [] : [tag];
        })
        .sort((a, b) => a.localeCompare(b));
    },
    channelIdNamed: (name) => findChannel(name),
    allianceChatId: (tag) => findChannel(ALLIANCE_CHAT_CHANNEL, allianceRoleName(tag)),
    async post(channelId, message) {
      const channel = await guild.channels.fetch(channelId);
      if (channel === null || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
        throw new Error(`The channel ${channelId} is not a text or announcement channel.`);
      }
      const sent = await channel.send(message);
      return { channelId, messageId: sent.id };
    },
    async edit(card, edit) {
      const channel = await guild.channels.fetch(card.channelId).catch((error: unknown) => {
        orGone(error);
        return undefined;
      });
      if (channel === null || channel === undefined || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
        return false;
      }
      const message = await channel.messages.fetch(card.messageId).catch((error: unknown) => {
        orGone(error);
        return undefined;
      });
      if (message === undefined) return false;
      await message.edit({ embeds: edit.embeds, components: edit.components, allowedMentions: { parse: [] } });
      return true;
    },
    // Mentions are off in the log: a line names a Member by id, and must not ping them.
    log: (line) => options.log({ content: line, allowedMentions: { parse: [] } }),
  };
}
