import { ChannelType, type BaseMessageOptions } from "discord.js";
import { allianceRoleName } from "../domain/managed-roles.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { EventInvitationServer, EventRole } from "./events.js";
import type { EventReminderServer } from "./event-reminders.js";
import { listEveryMember } from "./member-listing.js";

/** The Discord server the Event invitations and reminders use: both interfaces at once. */
export type EventServer = EventInvitationServer & EventReminderServer;

/** The most Interested Members Discord gives in one page of fetchSubscribers. */
const SUBSCRIBER_PAGE_SIZE = 100;

/** The channel the Event invitations go to for a Kingdom Event. */
const ANNOUNCEMENTS_CHANNEL = "event-announcements";

/** The channel of an Alliance, in its category, that its Alliance Events go to. */
const ALLIANCE_CHAT_CHANNEL = "alliance-chat";

/** A Member as the Event invitations and reminders read them: the id, and the roles held, by id and name. */
interface EventMemberLike {
  readonly id: string;
  readonly roles: { readonly cache: ReadonlyMap<string, EventRole> };
}

/** A channel of the guild as the Event invitations read it: its name and category, cached without a fetch. */
interface NamedChannelLike {
  readonly id: string;
  readonly type: ChannelType;
  readonly name: string;
  readonly parent: { readonly name: string } | null;
}

/** A channel fetched by id; only a guild text channel can be posted to. */
interface ChannelLike {
  readonly id: string;
  readonly type: ChannelType;
}

interface PostableChannelLike extends ChannelLike {
  send(message: BaseMessageOptions): Promise<{ readonly url: string }>;
}

/**
 * The part of a discord.js Guild that the Event invitations and reminders use. Methods, not properties, keep it bivariant:
 * a discord.js Guild and a test fake both fit it.
 */
export interface EventGuildLike {
  members: {
    list(options: { readonly after?: string; readonly limit: number }): Promise<ReadonlyMap<string, EventMemberLike>>;
    fetch(memberId: string): Promise<EventMemberLike>;
  };
  channels: {
    readonly cache: ReadonlyMap<string, NamedChannelLike>;
    fetch(channelId: string): Promise<ChannelLike | null>;
  };
  scheduledEvents: {
    fetch(): Promise<ReadonlyMap<string, unknown>>;
    /**
     * discord.js 14 types fetchSubscribers without `after`, although the REST call sends it and the manager passes it on.
     * Declaring it here, and passing it through the manager's generic options, needs no cast.
     */
    fetchSubscribers(
      eventId: string,
      options: { readonly limit: number; readonly after?: string },
    ): Promise<ReadonlyMap<string, { readonly user: { readonly id: string } }>>;
  };
}

function isPostable(channel: ChannelLike): channel is PostableChannelLike {
  return channel.type === ChannelType.GuildText;
}

/** The first cached channel that is a guild text channel with this name and, when given, this category name. */
function findTextChannel(
  guild: EventGuildLike,
  name: string,
  categoryName?: string,
): NamedChannelLike | undefined {
  return [...guild.channels.cache.values()].find(
    (channel) =>
      channel.type === ChannelType.GuildText &&
      channel.name === name &&
      (categoryName === undefined || channel.parent?.name === categoryName),
  );
}

/**
 * The Discord server as the Event invitations and reminders use it: role holders and roles, the announcement and alliance
 * channels, posts, #neil-log (through `log`, with mentions off), scheduled events, Interested Members and presence on the
 * server. Member lists are read over REST, page by page, and the Interested Members page by 100.
 */
export function eventServerOf(
  guild: EventGuildLike,
  options: { readonly log: (message: BaseMessageOptions) => Promise<void> },
): EventServer {
  return {
    async holdersOf(roleName) {
      const members = await listEveryMember(async (after, limit) => [
        ...(await guild.members.list(after === undefined ? { limit } : { after, limit })).values(),
      ]);
      return members
        .filter((member) => [...member.roles.cache.values()].some((role) => role.name === roleName))
        .map((member) => member.id);
    },

    async rolesOf(memberId) {
      const member = await guild.members.fetch(memberId);
      return [...member.roles.cache.values()].map((role) => ({ id: role.id, name: role.name }));
    },

    announcementsChannelId() {
      return findTextChannel(guild, ANNOUNCEMENTS_CHANNEL)?.id;
    },

    allianceChatId(tag) {
      return findTextChannel(guild, ALLIANCE_CHAT_CHANNEL, allianceRoleName(tag))?.id;
    },

    async post(channelId, message) {
      const channel = await guild.channels.fetch(channelId);
      if (channel === null || !isPostable(channel)) {
        throw new Error(`The channel ${channelId} is not a guild text channel.`);
      }
      const sent = await channel.send(message);
      return sent.url;
    },

    // Mentions are off in the log: a line names a Member by id, and must not ping them.
    log: (line) => options.log({ content: line, allowedMentions: { parse: [] } }),

    async scheduledEvents() {
      return [...(await guild.scheduledEvents.fetch()).values()];
    },

    async interestedIn(eventId) {
      const interested: MemberId[] = [];
      let after: string | undefined;
      for (;;) {
        const page = await guild.scheduledEvents.fetchSubscribers(
          eventId,
          after === undefined ? { limit: SUBSCRIBER_PAGE_SIZE } : { limit: SUBSCRIBER_PAGE_SIZE, after },
        );
        const ids = [...page.keys()];
        interested.push(...ids);
        const last = ids.at(-1);
        if (ids.length < SUBSCRIBER_PAGE_SIZE || last === undefined) return interested;
        after = last;
      }
    },

    isOnServer(memberId) {
      return guild.members.fetch(memberId).then(
        () => true,
        () => false,
      );
    },
  };
}
