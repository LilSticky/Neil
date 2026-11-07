import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { EventKind, EventKindOwner, SentReminder } from "../domain/events.js";

export type { EventKind, EventKindOwner, ReminderTarget, SentReminder } from "../domain/events.js";

/** An Event as stored: when Neil first saw it, and when its invitation was posted (undefined until then). */
export interface StoredEvent {
  readonly eventId: string;
  readonly firstSeenAt: string;
  readonly invitedAt: string | undefined;
}

/** "full": the owner already keeps the most Event Kinds; the list is unchanged. */
export type AddKindResult = { readonly ok: true } | { readonly ok: false; readonly reason: "full" };

/** At most this many Event Kinds per owner. */
const MAX_KINDS_PER_OWNER = 25;

const snowflake = z.string().regex(/^\d+$/);
const leadMinute = z.number().int().min(1);

const leadMinutesJson = z
  .string()
  .transform((text, ctx): unknown => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "not JSON" });
      return z.NEVER;
    }
  })
  .pipe(z.array(leadMinute));

const eventRow = z.object({
  event_id: snowflake,
  first_seen_at: z.iso.datetime(),
  invited_at: z.iso.datetime().nullable(),
});

const reminderRow = z.object({
  target: z.enum(["start", "signup"]),
  lead_minutes: leadMinute,
});

const kindRow = z.object({
  name: z.string().min(1),
  before_start: leadMinutesJson,
  signup_offset_minutes: leadMinute.nullable(),
  before_signup: leadMinutesJson,
});

const CORRUPT_MESSAGE = "the Events in neil.db is corrupt; fix or remove it by hand";

/**
 * Keeps the Events, their Event Reminders, the Event Kinds and the Event Invitations Off in neil.db. A row that does not
 * read is refused, not reset.
 */
export class EventStore {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /** The Event as stored, or undefined when Neil has never seen it. */
  findEvent(eventId: string): StoredEvent | undefined {
    const raw = this.db.prepare("SELECT event_id, first_seen_at, invited_at FROM events WHERE event_id = ?").get(eventId);
    if (raw === undefined) return undefined;
    const parsed = eventRow.safeParse(raw);
    if (!parsed.success) throw new Error(CORRUPT_MESSAGE);
    return {
      eventId: parsed.data.event_id,
      firstSeenAt: parsed.data.first_seen_at,
      invitedAt: parsed.data.invited_at ?? undefined,
    };
  }

  /** Keeps the Event from its first sighting; a second sighting changes nothing. */
  recordFirstSeen(eventId: string, seenAt: string): void {
    this.db.prepare("INSERT OR IGNORE INTO events (event_id, first_seen_at) VALUES (?, ?)").run(eventId, seenAt);
  }

  /** Sets the time of the invitation, once: a later call keeps the first time. */
  markInvited(eventId: string, invitedAt: string): void {
    this.db.prepare("UPDATE events SET invited_at = COALESCE(invited_at, ?) WHERE event_id = ?").run(invitedAt, eventId);
  }

  /** Deletes the Event and its sent reminders. */
  deleteEvent(eventId: string): void {
    this.db.prepare("DELETE FROM events WHERE event_id = ?").run(eventId);
  }

  /** The reminders already sent for the Event. */
  remindersSent(eventId: string): SentReminder[] {
    const rows = this.db
      .prepare("SELECT target, lead_minutes FROM event_reminders_sent WHERE event_id = ? ORDER BY target, lead_minutes")
      .all(eventId);
    return rows.map((raw) => {
      const parsed = reminderRow.safeParse(raw);
      if (!parsed.success) throw new Error(CORRUPT_MESSAGE);
      return { target: parsed.data.target, leadMinutes: parsed.data.lead_minutes };
    });
  }

  /** Records a reminder as sent; recording it again keeps one row. */
  recordReminderSent(eventId: string, reminder: SentReminder): void {
    this.db
      .prepare("INSERT OR IGNORE INTO event_reminders_sent (event_id, target, lead_minutes) VALUES (?, ?, ?)")
      .run(eventId, reminder.target, reminder.leadMinutes);
  }

  /** The owner's Event Kinds in the order they were added. */
  listKinds(owner: EventKindOwner): EventKind[] {
    const rows = this.db
      .prepare("SELECT name, before_start, signup_offset_minutes, before_signup FROM event_kinds WHERE owner = ? ORDER BY id")
      .all(owner);
    return rows.map((raw) => {
      const parsed = kindRow.safeParse(raw);
      if (!parsed.success) throw new Error(CORRUPT_MESSAGE);
      return {
        name: parsed.data.name,
        beforeStart: parsed.data.before_start,
        signupOffsetMinutes: parsed.data.signup_offset_minutes ?? undefined,
        beforeSignup: parsed.data.before_signup,
      };
    });
  }

  /** Adds the Event Kind, or replaces the owner's kind of the same name ignoring case. Refused when the owner is full. */
  addKind(owner: EventKindOwner, kind: EventKind): AddKindResult {
    const named = this.db.prepare("SELECT 1 AS found FROM event_kinds WHERE owner = ? AND name = ?").get(owner, kind.name);
    if (named === undefined) {
      const count = this.db.prepare("SELECT COUNT(*) AS count FROM event_kinds WHERE owner = ?").get(owner);
      if (typeof count?.count === "number" && count.count >= MAX_KINDS_PER_OWNER) return { ok: false, reason: "full" };
    }
    this.db
      .prepare(
        `INSERT INTO event_kinds (owner, name, before_start, signup_offset_minutes, before_signup) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (owner, name) DO UPDATE SET name = excluded.name, before_start = excluded.before_start,
           signup_offset_minutes = excluded.signup_offset_minutes, before_signup = excluded.before_signup`,
      )
      .run(
        owner,
        kind.name,
        JSON.stringify(kind.beforeStart),
        kind.signupOffsetMinutes ?? null,
        JSON.stringify(kind.beforeSignup),
      );
    return { ok: true };
  }

  /** Removes the owner's Event Kind whose name matches ignoring case; a name not listed changes nothing. */
  removeKind(owner: EventKindOwner, name: string): void {
    this.db.prepare("DELETE FROM event_kinds WHERE owner = ? AND name = ?").run(owner, name);
  }

  /** Switches the Member's Event Invitations off. */
  setInvitationsOff(memberId: string): void {
    this.db.prepare("INSERT OR IGNORE INTO event_invitations_off (member_id) VALUES (?)").run(memberId);
  }

  /** Switches the Member's Event Invitations back on. */
  clearInvitationsOff(memberId: string): void {
    this.db.prepare("DELETE FROM event_invitations_off WHERE member_id = ?").run(memberId);
  }

  /** Whether the Member has Event Invitations off. */
  hasInvitationsOff(memberId: string): boolean {
    return this.db.prepare("SELECT 1 AS found FROM event_invitations_off WHERE member_id = ?").get(memberId) !== undefined;
  }

  /** Forgets the Member's choice, so their invitations are on again. */
  forgetMember(memberId: string): void {
    this.clearInvitationsOff(memberId);
  }
}
