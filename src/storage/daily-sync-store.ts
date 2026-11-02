import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { utcDayOf, type UtcDay } from "../domain/daily-quota.js";
import type { MemberId } from "../domain/rank-approval.js";

/** The last Daily Sync run: its UTC day, and the Linked Members it did not get to, in the order they are to be checked. */
export interface DailySyncRecord {
  readonly day: UtcDay;
  readonly leftOver: readonly MemberId[];
}

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => !Number.isNaN(Date.parse(`${day}T00:00:00Z`)))
  .transform((day): UtcDay => utcDayOf(new Date(`${day}T00:00:00Z`)));

const row = z.object({
  day: isoDay,
  left_over_json: z.string().transform((text, ctx) => {
    const parsed = z.array(z.string().regex(/^\d+$/)).safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
    ctx.addIssue({ code: "custom", message: "not a list of Member IDs" });
    return z.NEVER;
  }),
});

/** Keeps the record of the last Daily Sync in neil.db; a corrupt row is an error, never a silent reset. */
export class DailySyncStore {
  constructor(private readonly db: DatabaseSync) {}

  load(): DailySyncRecord | undefined {
    const raw = this.db.prepare("SELECT day, left_over_json FROM daily_sync WHERE id = 1").get();
    if (raw === undefined) return undefined;
    const parsed = row.safeParse(raw);
    if (!parsed.success) throw new Error("the Daily Sync record in neil.db is corrupt; fix or remove it by hand");
    return { day: parsed.data.day, leftOver: parsed.data.left_over_json };
  }

  /** Replaces the record of the previous run. */
  save(record: DailySyncRecord): void {
    this.db
      .prepare(
        `INSERT INTO daily_sync (id, day, left_over_json) VALUES (1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET day = excluded.day, left_over_json = excluded.left_over_json`,
      )
      .run(record.day, JSON.stringify(record.leftOver));
  }
}
