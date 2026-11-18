import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { MemberId } from "../domain/rank-approval.js";
import { isShieldWeek, type ShieldWeek } from "../domain/shield.js";

/** A KvK Week as marked: when, and by which Officer. */
export interface KvkWeekMark {
  readonly week: ShieldWeek;
  readonly markedAt: Date;
  readonly markedBy: MemberId;
}

const snowflake = z.string().regex(/^\d+$/);
const week = z.string().refine(isShieldWeek);
const isoDate = z.string().refine((text) => !Number.isNaN(Date.parse(text)));

const markRow = z.object({ week, marked_at: isoDate, marked_by: snowflake });
const leadRow = z.object({ lead_minutes: z.number().int().positive() });
const memberRow = z.object({ member_id: snowflake });

const CORRUPT_MESSAGE = "the Shield Reminders in neil.db are corrupt; fix or remove them by hand";

function parsed<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new Error(CORRUPT_MESSAGE);
  return result.data;
}

/**
 * Keeps the Shield Reminders in neil.db (slice 044, ADR 26): the KvK Weeks, the lead times sent per week, the Members'
 * Shield Confirmations per week, and the Members with Shield Reminders Off. A row that does not read is refused, not reset.
 */
export class ShieldStore {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /** The mark of the week, or undefined when it is not a KvK Week. */
  markOf(shieldWeek: ShieldWeek): KvkWeekMark | undefined {
    const raw = this.db.prepare("SELECT week, marked_at, marked_by FROM kvk_week WHERE week = ?").get(shieldWeek);
    if (raw === undefined) return undefined;
    const row = parsed(markRow, raw);
    return { week: row.week, markedAt: new Date(row.marked_at), markedBy: row.marked_by };
  }

  /** Marks the week as a KvK Week; false, changing nothing, when it already is one. */
  mark(shieldWeek: ShieldWeek, markedAt: Date, markedBy: MemberId): boolean {
    const result = this.db
      .prepare("INSERT OR IGNORE INTO kvk_week (week, marked_at, marked_by) VALUES (?, ?, ?)")
      .run(shieldWeek, markedAt.toISOString(), markedBy);
    return result.changes > 0;
  }

  /** Unmarks the week and deletes its Shield Confirmations; false, changing nothing, when it was not marked. */
  unmark(shieldWeek: ShieldWeek): boolean {
    this.db.exec("BEGIN");
    try {
      const removed = this.db.prepare("DELETE FROM kvk_week WHERE week = ?").run(shieldWeek).changes > 0;
      if (removed) this.db.prepare("DELETE FROM shield_confirmation WHERE week = ?").run(shieldWeek);
      this.db.exec("COMMIT");
      return removed;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /** The lead times (minutes) of the week's Shield Reminders already sent or recorded as sent. */
  sentLeads(shieldWeek: ShieldWeek): number[] {
    return this.db
      .prepare("SELECT lead_minutes FROM shield_reminder_sent WHERE week = ? ORDER BY lead_minutes DESC")
      .all(shieldWeek)
      .map((raw) => parsed(leadRow, raw).lead_minutes);
  }

  /** Records a lead time of the week as sent; recording it twice changes nothing. */
  recordSent(shieldWeek: ShieldWeek, leadMinutes: number): void {
    this.db
      .prepare("INSERT OR IGNORE INTO shield_reminder_sent (week, lead_minutes) VALUES (?, ?)")
      .run(shieldWeek, leadMinutes);
  }

  /** Records the Member's Shield Confirmation for the week; false, changing nothing, when one is already recorded. */
  confirm(shieldWeek: ShieldWeek, memberId: MemberId, confirmedAt: Date): boolean {
    const result = this.db
      .prepare("INSERT OR IGNORE INTO shield_confirmation (week, member_id, confirmed_at) VALUES (?, ?, ?)")
      .run(shieldWeek, memberId, confirmedAt.toISOString());
    return result.changes > 0;
  }

  /** The Members with a Shield Confirmation for the week. */
  confirmed(shieldWeek: ShieldWeek): Set<MemberId> {
    const rows = this.db.prepare("SELECT member_id FROM shield_confirmation WHERE week = ?").all(shieldWeek);
    return new Set(rows.map((raw) => parsed(memberRow, raw).member_id));
  }

  /** Deletes the Shield Confirmations of every week before the given one, whose Shield Deadline has passed. */
  deleteConfirmationsBefore(shieldWeek: ShieldWeek): void {
    this.db.prepare("DELETE FROM shield_confirmation WHERE week < ?").run(shieldWeek);
  }

  /** Whether the Member has Shield Reminders Off; no record means on. */
  isOff(memberId: MemberId): boolean {
    return this.db.prepare("SELECT member_id FROM shield_reminders_off WHERE member_id = ?").get(memberId) !== undefined;
  }

  /** Records the Member's choice: Off keeps a row, on deletes it. */
  setOff(memberId: MemberId, off: boolean): void {
    if (off) this.db.prepare("INSERT OR IGNORE INTO shield_reminders_off (member_id) VALUES (?)").run(memberId);
    else this.db.prepare("DELETE FROM shield_reminders_off WHERE member_id = ?").run(memberId);
  }

  /** The Members with Shield Reminders Off. */
  remindersOff(): Set<MemberId> {
    const rows = this.db.prepare("SELECT member_id FROM shield_reminders_off").all();
    return new Set(rows.map((raw) => parsed(memberRow, raw).member_id));
  }

  /** Deletes the Member's Shield Confirmations and Shield Reminders Off, at Unlink. */
  forget(memberId: MemberId): void {
    this.db.prepare("DELETE FROM shield_confirmation WHERE member_id = ?").run(memberId);
    this.db.prepare("DELETE FROM shield_reminders_off WHERE member_id = ?").run(memberId);
  }
}
