import type { BaseMessageOptions } from "discord.js";
import { GuildScheduledEventStatus } from "discord.js";
import { z } from "zod";
import { eventOwnerOf, mayActOnEvent, type EventCreator, type EventOwner, type EventStatus } from "../domain/events.js";
import type { RankOnLink } from "../domain/link.js";
import { allianceRoleName } from "../domain/managed-roles.js";
import { isOfficer } from "../domain/officer.js";
import type { AllianceRank } from "../domain/player.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { EventStore } from "../storage/event-store.js";
import type { LinkStore } from "../storage/link-store.js";
import { eventInvitationMessages } from "./event-texts.js";

/** An Event as Neil reads it: the Discord event's id, name, start, description, status and creator. */
export interface Event {
  readonly id: string;
  readonly name: string;
  readonly start: Date;
  readonly description: string;
  readonly status: EventStatus;
  readonly creatorId: string | undefined;
}

/** Why a scheduled event cannot be read as an Event: no start, a malformed id, or anything else unreadable. */
export type EventRefusal = "no-start" | "malformed-id" | "unreadable";

export type EventResult = { readonly ok: true; readonly value: Event } | { readonly ok: false; readonly reason: EventRefusal };

/** A Discord id: digits only, 17 to 20 of them. */
const snowflake = z.string().regex(/^\d{17,20}$/);

/** The fields of a discord.js scheduled event that Neil reads. Other fields are ignored. */
const scheduledEventSchema = z.object({
  id: snowflake,
  name: z.string(),
  scheduledStartTimestamp: z.number().nullable(),
  description: z.string().nullable(),
  status: z.enum(GuildScheduledEventStatus),
  creatorId: snowflake.nullable(),
});

/** The guild of a scheduled event, which its link in an invitation or a reminder needs. */
const scheduledEventGuildSchema = z.object({ guildId: snowflake });

/** The guild a scheduled event belongs to, or undefined when it has none Neil can read. Never throws. */
export function guildIdOf(scheduledEvent: unknown): string | undefined {
  const guild = scheduledEventGuildSchema.safeParse(scheduledEvent);
  return guild.success ? guild.data.guildId : undefined;
}

const EVENT_STATUS: Record<GuildScheduledEventStatus, EventStatus> = {
  [GuildScheduledEventStatus.Scheduled]: "scheduled",
  [GuildScheduledEventStatus.Active]: "active",
  [GuildScheduledEventStatus.Completed]: "completed",
  [GuildScheduledEventStatus.Canceled]: "cancelled",
};

/** Reads a discord.js scheduled event as an Event, refusing what Neil cannot use. Never throws. */
export function eventOf(scheduledEvent: unknown): EventResult {
  const parsed = scheduledEventSchema.safeParse(scheduledEvent);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { ok: false, reason: field === "id" ? "malformed-id" : "unreadable" };
  }
  const { id, name, scheduledStartTimestamp, description, status, creatorId } = parsed.data;
  if (scheduledStartTimestamp === null) return { ok: false, reason: "no-start" };
  return {
    ok: true,
    value: {
      id,
      name,
      start: new Date(scheduledStartTimestamp),
      description: description ?? "",
      status: EVENT_STATUS[status],
      creatorId: creatorId ?? undefined,
    },
  };
}

/** A role of a Member as the server gives it: its id for the Officer check, its name for the Alliance role. */
export interface EventRole {
  readonly id: string;
  readonly name: string;
}

/** The part of the Discord server Event invitations use: role holders and roles, channels, posts, #neil-log and scheduled events. */
export interface EventInvitationServer {
  holdersOf(roleName: string): Promise<readonly MemberId[]>;
  rolesOf(memberId: MemberId): Promise<readonly EventRole[]>;
  announcementsChannelId(): string | undefined;
  allianceChatId(tag: string): string | undefined;
  /** Posts the message and resolves to the link Discord gives it. */
  post(channelId: string, message: BaseMessageOptions): Promise<string>;
  log(line: string): Promise<void>;
  /** The scheduled events Discord lists, as Discord gives them; each is read by `eventOf`. */
  scheduledEvents(): Promise<readonly unknown[]>;
}

export interface EventInvitationDeps {
  readonly events: Pick<EventStore, "findEvent" | "recordFirstSeen" | "markInvited" | "hasInvitationsOff">;
  readonly links: Pick<LinkStore, "linkFor">;
  readonly server: EventInvitationServer;
  readonly officerRoleIds: readonly string[];
  readonly now: () => Date;
  readonly logError: (line: string) => void;
}

export interface EventInvitations {
  /** Invites each listed Event that is still ahead and has no invitation yet. */
  onStartup(): Promise<void>;
  onCreated(scheduledEvent: unknown): Promise<void>;
  /** An edit invites only an Event with no invitation yet, so it never posts a second one. */
  onUpdated(scheduledEvent: unknown): Promise<void>;
}

/** The role whose holders are mentioned in a Kingdom Event's invitation. */
const EVENTS_ROLE = "Events";

/** The channel an Event's messages go to: #event-announcements for a Kingdom Event, the Alliance's alliance-chat for an Alliance Event. */
export function eventChannelId(
  server: Pick<EventInvitationServer, "announcementsChannelId" | "allianceChatId">,
  owner: EventOwner,
): string | undefined {
  return owner.kind === "kingdom" ? server.announcementsChannelId() : server.allianceChatId(owner.tag);
}

/**
 * Creates the Event invitations. A new Event is posted once: a Kingdom Event to #event-announcements, an Alliance Event
 * to its alliance-chat, mentioning the holders of `Events` or of the Alliance role less those with Event Invitations Off.
 * An Event whose tag has no alliance-chat, or whose creator may not create it, is logged and not posted. A failed post is
 * logged and leaves the Event uninvited. Nothing here throws.
 */
export function createEventInvitations(deps: EventInvitationDeps): EventInvitations {
  const { events, server } = deps;

  /** The creator's standing for an Event of this owner: their Alliance, when they hold its role, and whether they are an Officer. */
  async function creatorOf(owner: EventOwner, creatorId: string): Promise<EventCreator> {
    const roles = await server.rolesOf(creatorId);
    const officer = isOfficer(
      roles.map((role) => role.id),
      deps.officerRoleIds,
    );
    const link = deps.links.linkFor(creatorId);
    const inAlliance = owner.kind === "alliance" && roles.some((role) => role.name === allianceRoleName(owner.tag));
    const alliance = inAlliance && link !== undefined ? { tag: owner.tag, rank: rankOf(link.allianceRank) } : undefined;
    return { alliance, officer };
  }

  async function postInvitation(guildId: string, event: Event, now: Date): Promise<void> {
    const owner = eventOwnerOf(event.name);
    const channelId = eventChannelId(server, owner);
    if (channelId === undefined) return refuse(event, "its Alliance has no alliance-chat");
    const creator = event.creatorId === undefined ? undefined : await creatorOf(owner, event.creatorId);
    if (!mayActOnEvent(owner, creator)) return refuse(event, `its creator ${event.creatorId ?? "(none)"} may not create it`);

    const holders = await server.holdersOf(owner.kind === "kingdom" ? EVENTS_ROLE : allianceRoleName(owner.tag));
    const mentioned = holders.filter((memberId) => !events.hasInvitationsOff(memberId));
    for (const [index, message] of eventInvitationMessages(guildId, event, mentioned).entries()) {
      await server.post(channelId, message);
      if (index === 0) events.markInvited(event.id, now.toISOString());
    }
    await server.log(`The Event "${event.name}" was invited, mentioning ${mentioned.length.toString()} Members.`);
  }

  function refuse(event: Event, reason: string): Promise<void> {
    return server.log(`The Event "${event.name}" was not invited: ${reason}.`);
  }

  async function invite(scheduledEvent: unknown): Promise<void> {
    const read = eventOf(scheduledEvent);
    const guildId = guildIdOf(scheduledEvent);
    if (!read.ok || guildId === undefined) {
      deps.logError(`An Event was not read: ${read.ok ? "no guild" : read.reason}`);
      return;
    }
    const event = read.value;
    const now = deps.now();
    events.recordFirstSeen(event.id, now.toISOString());
    if (event.start.getTime() <= now.getTime() || events.findEvent(event.id)?.invitedAt !== undefined) return;
    try {
      await postInvitation(guildId, event, now);
    } catch (error) {
      deps.logError(`Inviting to the Event ${event.name} failed: ${errorMessage(error)}`);
    }
  }

  return {
    async onStartup() {
      try {
        for (const scheduledEvent of await server.scheduledEvents()) await invite(scheduledEvent);
      } catch (error) {
        deps.logError(`Reading the scheduled events failed: ${errorMessage(error)}`);
      }
    },
    onCreated: invite,
    onUpdated: invite,
  };
}

/** The Alliance Rank a Link carries from the Game API or an Officer; unknown when it carries none. */
function rankOf(rank: RankOnLink): AllianceRank {
  return rank.source === "game-api" || rank.source === "rank-approval" ? rank.rank : "unknown";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
