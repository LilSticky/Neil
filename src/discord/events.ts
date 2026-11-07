import { GuildScheduledEventStatus } from "discord.js";
import { z } from "zod";
import type { EventStatus } from "../domain/events.js";

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
