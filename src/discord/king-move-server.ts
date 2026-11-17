import { ChannelType, RESTJSONErrorCodes, type BaseMessageOptions } from "discord.js";
import { z } from "zod";
import type { MemberId } from "../domain/rank-approval.js";
import type { KingMoveServer } from "./king-move.js";

/** A channel fetched by id; the log channel is a text channel. */
interface ChannelLike {
  readonly id: string;
  readonly type: ChannelType;
}

interface MessageChannelLike extends ChannelLike {
  send(message: BaseMessageOptions): Promise<{ readonly id: string }>;
  readonly messages: { edit(messageId: string, message: BaseMessageOptions): Promise<unknown> };
}

/** A Member as the King Move reads them: their id and role ids. */
export interface ListedMember {
  readonly id: MemberId;
  readonly roleIds: readonly string[];
}

/** The part of a discord.js Guild that the King Move uses. Methods, not properties, keep it bivariant. */
export interface KingMoveGuildLike {
  channels: { fetch(channelId: string): Promise<ChannelLike | null> };
  /** Gives the role to the Member (discord.js `guild.members.addRole`). */
  addRole(memberId: MemberId, roleId: string): Promise<unknown>;
  /** Takes the role from the Member (discord.js `guild.members.removeRole`). */
  removeRole(memberId: MemberId, roleId: string): Promise<unknown>;
  /** Every Member of the guild, over REST. */
  everyMember(): Promise<readonly ListedMember[]>;
  /** Whether the Member is on the guild. */
  isOnServer(memberId: MemberId): Promise<boolean>;
}

/** Discord's answer when the message to edit is gone. */
const unknownMessage = z.object({ code: z.literal(RESTJSONErrorCodes.UnknownMessage) });

function isMessageChannel(channel: ChannelLike): channel is MessageChannelLike {
  return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
}

/**
 * The Discord server as the King Move uses it: the configured King role (and no other role), its cards in #neil-log, and
 * one line per step there, with mentions off.
 */
export function kingMoveServerOf(
  guild: KingMoveGuildLike,
  options: {
    readonly kingRoleId: string;
    readonly logChannelId: string;
    readonly log: (message: BaseMessageOptions) => Promise<void>;
  },
): KingMoveServer {
  async function logChannel(): Promise<MessageChannelLike> {
    const channel = await guild.channels.fetch(options.logChannelId);
    if (channel === null || !isMessageChannel(channel)) {
      throw new Error(`The log channel ${options.logChannelId} is not a text channel.`);
    }
    return channel;
  }

  return {
    async kingHolders() {
      const members = await guild.everyMember();
      return members.filter((member) => member.roleIds.includes(options.kingRoleId)).map((member) => member.id);
    },
    isOnServer: (memberId) => guild.isOnServer(memberId),
    async giveKing(memberId) {
      await guild.addRole(memberId, options.kingRoleId);
    },
    async takeKing(memberId) {
      await guild.removeRole(memberId, options.kingRoleId);
    },
    async postCard(message) {
      const sent = await (await logChannel()).send(message);
      return sent.id;
    },
    async editCard(messageId, message) {
      const channel = await logChannel();
      try {
        await channel.messages.edit(messageId, message);
        return true;
      } catch (error) {
        if (unknownMessage.safeParse(error).success) return false;
        throw error;
      }
    },
    // Mentions are off in the log: a line names a Member by id, and must not ping them.
    log: (line) => options.log({ content: line, allowedMentions: { parse: [] } }),
  };
}
