import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { type DailyQuota, type UtcDay, utcDayOf } from "../domain/daily-quota.js";

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => !Number.isNaN(Date.parse(`${day}T00:00:00Z`)))
  .transform((day): UtcDay => utcDayOf(new Date(`${day}T00:00:00Z`)));

const row = z.object({
  day: isoDay,
  used: z.number().int().min(0),
  quota_limit: z.number().int().min(1),
  limit_reached: z.union([z.literal(0), z.literal(1)]),
  confirmed_at: z.iso.datetime().nullable(),
});

/** Keeps the one Daily Quota in neil.db; a corrupt row is an error, never a silent reset. */
export class DailyQuotaStore {
  constructor(private readonly db: DatabaseSync) {}

  load(): DailyQuota | undefined {
    const raw = this.db
      .prepare("SELECT day, used, quota_limit, limit_reached, confirmed_at FROM daily_quota WHERE id = 1")
      .get();
    if (raw === undefined) return undefined;
    const parsed = row.safeParse(raw);
    if (!parsed.success) throw new Error("the Daily Quota in neil.db is corrupt; fix or remove it by hand");
    return {
      day: parsed.data.day,
      used: parsed.data.used,
      limit: parsed.data.quota_limit,
      limitReached: parsed.data.limit_reached === 1,
      confirmedAt: parsed.data.confirmed_at === null ? undefined : new Date(parsed.data.confirmed_at),
    };
  }

  save(quota: DailyQuota): void {
    this.db
      .prepare(
        `INSERT INTO daily_quota (id, day, used, quota_limit, limit_reached, confirmed_at) VALUES (1, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET day = excluded.day, used = excluded.used, quota_limit = excluded.quota_limit,
           limit_reached = excluded.limit_reached, confirmed_at = excluded.confirmed_at`,
      )
      .run(
        quota.day,
        quota.used,
        quota.limit,
        quota.limitReached ? 1 : 0,
        quota.confirmedAt === undefined ? null : quota.confirmedAt.toISOString(),
      );
  }
}
