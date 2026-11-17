import { ChannelType, RESTJSONErrorCodes, type BaseMessageOptions } from "discord.js";
import { z } from "zod";
import type { CityRotationServer } from "./city-rotation.js";

/** The channel the City Rotation card is pinned in: the original, not a translated copy. */
const ANNOUNCEMENTS_CHANNEL = "nap-announcements";
/** The R5s' and the King's room, where Neil asks for the Handover after the Royal City siege. */
const LEADERS_CHANNEL = "nap-leaders";
/** The Home Kingdom's news, where every change of the City Rotation is announced. */
const KINGDOM_ANNOUNCEMENTS_CHANNEL = "home-kingdom-announcements";

/** A channel of the guild as the City Rotation finds it: by name, cached without a fetch. */
interface NamedChannelLike {
  readonly id: string;
  readonly type: ChannelType;
  readonly name: string;
}

/** A channel fetched by id; only a text or announcement channel can carry the card. */
interface ChannelLike {
  readonly id: string;
  readonly type: ChannelType;
}

interface MessageChannelLike extends ChannelLike {
  send(message: BaseMessageOptions): Promise<{ readonly id: string }>;
  readonly messages: {
    edit(messageId: string, message: BaseMessageOptions): Promise<unknown>;
    pin(messageId: string): Promise<void>;
  };
}

/** The part of a discord.js Guild that the City Rotation uses. Methods, not properties, keep it bivariant. */
export interface CityRotationGuildLike {
  channels: {
    readonly cache: ReadonlyMap<string, NamedChannelLike>;
    fetch(channelId: string): Promise<ChannelLike | null>;
  };
}

/** Discord's answer when the message to edit is gone. */
const unknownMessage = z.object({ code: z.literal(RESTJSONErrorCodes.UnknownMessage) });

function isMessageChannel(channel: ChannelLike): channel is MessageChannelLike {
  return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
}

/** The first cached text or announcement channel with this name. */
function channelNamed(guild: CityRotationGuildLike, name: string): string | undefined {
  return [...guild.channels.cache.values()].find(
    (channel) =>
      (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) && channel.name === name,
  )?.id;
}

async function messageChannel(guild: CityRotationGuildLike, channelId: string): Promise<MessageChannelLike> {
  const channel = await guild.channels.fetch(channelId);
  if (channel === null || !isMessageChannel(channel)) {
    throw new Error(`The channel ${channelId} is not a text or announcement channel.`);
  }
  return channel;
}

/**
 * The Discord server as the City Rotation uses it: #nap-announcements, #nap-leaders and #home-kingdom-announcements by name, Neil's own posts, edits
 * and pins there, and #neil-log (through `log`, with mentions off).
 */
export function cityRotationServerOf(
  guild: CityRotationGuildLike,
  options: { readonly log: (message: BaseMessageOptions) => Promise<void> },
): CityRotationServer {
  return {
    announcementsChannelId: () => channelNamed(guild, ANNOUNCEMENTS_CHANNEL),
    leadersChannelId: () => channelNamed(guild, LEADERS_CHANNEL),
    kingdomAnnouncementsChannelId: () => channelNamed(guild, KINGDOM_ANNOUNCEMENTS_CHANNEL),
    async post(channelId, message) {
      const sent = await (await messageChannel(guild, channelId)).send(message);
      return sent.id;
    },
    async edit(channelId, messageId, message) {
      const channel = await messageChannel(guild, channelId);
      try {
        await channel.messages.edit(messageId, message);
        return true;
      } catch (error) {
        if (unknownMessage.safeParse(error).success) return false;
        throw error;
      }
    },
    async pin(channelId, messageId) {
      await (await messageChannel(guild, channelId)).messages.pin(messageId);
    },
    // Mentions are off in the log: a line names a Member by id, and must not ping them.
    log: (line) => options.log({ content: line, allowedMentions: { parse: [] } }),
  };
}
