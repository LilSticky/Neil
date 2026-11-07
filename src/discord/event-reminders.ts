import {
  dueReminders,
  eventOwnerOf,
  kindForEventName,
  type EventKind,
  type EventKindOwner,
  type EventOwner,
  type SentReminder,
} from "../domain/events.js";
import type { KingdomNumber } from "../domain/lookup-input.js";
import { allianceRoleName } from "../domain/managed-roles.js";
import { isKnownGuest } from "../domain/preferences.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { AppliedStore } from "../storage/applied-store.js";
import type { EventStore } from "../storage/event-store.js";
import type { LinkStore } from "../storage/link-store.js";
import { eventChannelId, eventOf, guildIdOf, type Event, type EventInvitationServer } from "./events.js";
import { eventReminderMessages, type EventReminder } from "./event-texts.js";

/** The part of the server Event reminders use: the scheduled events, the Interested Members, roles, channels, posts and #neil-log. */
export interface EventReminderServer
  extends Pick<EventInvitationServer, "holdersOf" | "scheduledEvents" | "announcementsChannelId" | "allianceChatId" | "post" | "log"> {
  /** The Members who marked the Discord event Interested. */
  interestedIn(eventId: string): Promise<readonly MemberId[]>;
  /** Whether the Member is still on the server. */
  isOnServer(memberId: MemberId): Promise<boolean>;
}

export interface EventReminderDeps {
  readonly events: Pick<EventStore, "findEvent" | "remindersSent" | "recordReminderSent" | "listKinds" | "deleteEvent">;
  readonly links: Pick<LinkStore, "linkFor">;
  readonly applied: Pick<AppliedStore, "get">;
  readonly homeKingdom: KingdomNumber;
  readonly server: EventReminderServer;
  readonly now: () => Date;
  readonly logError: (line: string) => void;
}

export interface EventReminders {
  /** Sends the reminders now due, for every listed Event Neil has invited. Nothing here throws. */
  tick(): Promise<void>;
  /** The Discord event was deleted: its rows and sent reminders go. */
  onDeleted(eventId: string): void;
}

const MINUTE_MS = 60_000;

/** The key of an owner's Event Kinds: "kingdom" for the Home Kingdom, or the Alliance's tag. */
function kindOwnerOf(owner: EventOwner): EventKindOwner {
  return owner.kind === "kingdom" ? "kingdom" : owner.tag;
}

/** The reminder a sent reminder stands for: the start, or the Sign-up Deadline of the kind that has one. */
function reminderOf(event: Event, sent: SentReminder, kind: EventKind | undefined): EventReminder {
  if (sent.target === "start" || kind?.signupOffsetMinutes === undefined) return { event, target: "start" };
  const signUpDeadline = new Date(event.start.getTime() - kind.signupOffsetMinutes * MINUTE_MS);
  return { event, target: "signup", signUpDeadline };
}

/**
 * Creates the Event reminders. A Kind's lead times, or the default 30 minutes before the start, each post once to the
 * Event's channel and mention the Interested Members who may take part: Linked, on the server, and for a Kingdom Event
 * not a Guest, for an Alliance Event holding the Alliance's role. Nobody to mention posts nothing.
 */
export function createEventReminders(deps: EventReminderDeps): EventReminders {
  const { events, server } = deps;

  /** The Interested Members who may take part in the Event of this owner. */
  async function mentionedOf(owner: EventOwner, eventId: string): Promise<MemberId[]> {
    const holders = owner.kind === "alliance" ? await server.holdersOf(allianceRoleName(owner.tag)) : [];
    const mentioned: MemberId[] = [];
    for (const memberId of await server.interestedIn(eventId)) {
      if (deps.links.linkFor(memberId) === undefined || !(await server.isOnServer(memberId))) continue;
      const mayTakePart =
        owner.kind === "alliance"
          ? holders.includes(memberId)
          : !isKnownGuest(deps.applied.get(memberId)?.roles, deps.homeKingdom);
      if (mayTakePart) mentioned.push(memberId);
    }
    return mentioned;
  }

  async function remind(scheduledEvent: unknown): Promise<void> {
    const read = eventOf(scheduledEvent);
    const guildId = guildIdOf(scheduledEvent);
    if (!read.ok || guildId === undefined) return;
    const event = read.value;
    const stored = events.findEvent(event.id);
    if (stored === undefined || stored.invitedAt === undefined) return;

    const owner = eventOwnerOf(event.name);
    const kind = kindForEventName(events.listKinds(kindOwnerOf(owner)), event.name);
    const plan = dueReminders(
      event.start,
      event.status,
      kind,
      events.remindersSent(event.id),
      new Date(stored.firstSeenAt),
      deps.now(),
    );
    for (const reminder of [...plan.send, ...plan.record]) events.recordReminderSent(event.id, reminder);

    for (const sent of plan.send) {
      const mentioned = await mentionedOf(owner, event.id);
      if (mentioned.length === 0) continue;
      const channelId = eventChannelId(server, owner);
      if (channelId === undefined) {
        deps.logError(`The reminder of the Event ${event.name} was not posted: its Alliance has no alliance-chat`);
        continue;
      }
      for (const message of eventReminderMessages(guildId, reminderOf(event, sent, kind), mentioned)) {
        await server.post(channelId, message);
      }
      await server.log(`The reminder of the Event "${event.name}" was posted, mentioning ${mentioned.length.toString()} Members.`);
    }
  }

  return {
    async tick() {
      let scheduled: readonly unknown[];
      try {
        scheduled = await server.scheduledEvents();
      } catch (error) {
        deps.logError(`Reading the scheduled events failed: ${errorMessage(error)}`);
        return;
      }
      for (const scheduledEvent of scheduled) {
        try {
          await remind(scheduledEvent);
        } catch (error) {
          deps.logError(`Reminding about an Event failed: ${errorMessage(error)}`);
        }
      }
    },
    onDeleted(eventId) {
      events.deleteEvent(eventId);
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
