import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { BattlePlan, PlanConfirmation, Raid, RaidId, RaidState } from "../domain/raid.js";

/** Where a card of a Raid was posted: its channel and message. */
export interface PostedCard {
  readonly channelId: string;
  readonly messageId: string;
}

/** A Raid as stored, with the cards posted for it. */
export interface StoredRaid {
  readonly raid: Raid;
  readonly planCard: PostedCard | undefined;
  readonly confirmationCard: PostedCard | undefined;
}

const iso = z.iso.datetime();
const snowflake = z.string().regex(/^\d+$/);

const planJson = z
  .string()
  .transform((text, ctx): unknown => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "not JSON" });
      return z.NEVER;
    }
  })
  .pipe(
    z.object({
      customObjectives: z.array(z.string().min(1)),
      phases: z.array(z.object({ name: z.string().min(1), at: iso })),
      assignments: z.array(
        z.object({
          tag: z.string().min(1),
          objective: z.string().min(1),
          phase: z.string().min(1).nullable(),
          task: z.string().min(1).nullable(),
        }),
      ),
      notes: z.string(),
    }),
  );

const raidRow = z.object({
  id: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: iso,
  state: z.enum(["draft", "published", "cancelled"]),
  plan: planJson,
  published_at: iso.nullable(),
  amended_at: iso.nullable(),
  cancelled_at: iso.nullable(),
  plan_channel_id: snowflake.nullable(),
  plan_message_id: snowflake.nullable(),
  confirmation_channel_id: snowflake.nullable(),
  confirmation_message_id: snowflake.nullable(),
});

const confirmationRow = z.object({ tag: z.string().min(1), member_id: snowflake, confirmed_at: iso });
const noticeRow = z.object({ key: z.string().min(1) });

const CORRUPT_MESSAGE = "a Raid in neil.db is corrupt; fix or remove it by hand";

function stateOf(row: z.infer<typeof raidRow>): RaidState | undefined {
  const publishedAt = row.published_at === null ? undefined : new Date(row.published_at);
  if (row.state === "draft") return { kind: "draft" };
  if (row.state === "published") {
    if (publishedAt === undefined) return undefined;
    return { kind: "published", publishedAt, amendedAt: row.amended_at === null ? undefined : new Date(row.amended_at) };
  }
  if (row.cancelled_at === null) return undefined;
  return { kind: "cancelled", cancelledAt: new Date(row.cancelled_at), publishedAt };
}

function cardOf(channelId: string | null, messageId: string | null): PostedCard | undefined {
  return channelId === null || messageId === null ? undefined : { channelId, messageId };
}

function planText(plan: BattlePlan): string {
  return JSON.stringify({
    customObjectives: plan.customObjectives,
    phases: plan.phases.map((phase) => ({ name: phase.name, at: phase.at.toISOString() })),
    assignments: plan.assignments.map((assignment) => ({
      tag: assignment.tag,
      objective: assignment.objective,
      phase: assignment.phase ?? null,
      task: assignment.task ?? null,
    })),
    notes: plan.notes,
  });
}

/** Keeps the Raids, their Battle Plans and cards, Plan Confirmations and the notices sent, in neil.db. A row that does not read is refused, not reset. */
export class RaidStore {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /** The Raid as stored, or undefined when none was kept for that Saturday. */
  find(raidId: RaidId): StoredRaid | undefined {
    const raw = this.db.prepare("SELECT * FROM raids WHERE id = ?").get(raidId);
    if (raw === undefined) return undefined;
    const parsed = raidRow.safeParse(raw);
    if (!parsed.success) throw new Error(CORRUPT_MESSAGE);
    const row = parsed.data;
    const state = stateOf(row);
    if (state === undefined) throw new Error(CORRUPT_MESSAGE);
    const plan: BattlePlan = {
      customObjectives: row.plan.customObjectives,
      phases: row.plan.phases.map((phase) => ({ name: phase.name, at: new Date(phase.at) })),
      assignments: row.plan.assignments.map((assignment) => ({
        tag: assignment.tag,
        objective: assignment.objective,
        phase: assignment.phase ?? undefined,
        task: assignment.task ?? undefined,
      })),
      notes: row.plan.notes,
    };
    return {
      raid: { id: row.id, start: new Date(row.start), state, plan },
      planCard: cardOf(row.plan_channel_id, row.plan_message_id),
      confirmationCard: cardOf(row.confirmation_channel_id, row.confirmation_message_id),
    };
  }

  /** Keeps the Raid's start, state and plan; the cards already posted stay. */
  save(raid: Raid): void {
    const state = raid.state;
    const publishedAt = state.kind === "draft" ? undefined : state.publishedAt;
    const amendedAt = state.kind === "published" ? state.amendedAt : undefined;
    const cancelledAt = state.kind === "cancelled" ? state.cancelledAt : undefined;
    this.db
      .prepare(
        `INSERT INTO raids (id, start, state, plan, published_at, amended_at, cancelled_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET start = excluded.start, state = excluded.state, plan = excluded.plan,
           published_at = excluded.published_at, amended_at = excluded.amended_at, cancelled_at = excluded.cancelled_at`,
      )
      .run(
        raid.id,
        raid.start.toISOString(),
        state.kind,
        planText(raid.plan),
        publishedAt?.toISOString() ?? null,
        amendedAt?.toISOString() ?? null,
        cancelledAt?.toISOString() ?? null,
      );
  }

  /** Keeps where the plan card was posted. */
  savePlanCard(raidId: RaidId, card: PostedCard): void {
    this.db
      .prepare("UPDATE raids SET plan_channel_id = ?, plan_message_id = ? WHERE id = ?")
      .run(card.channelId, card.messageId, raidId);
  }

  /** Keeps where the confirmation card was posted. */
  saveConfirmationCard(raidId: RaidId, card: PostedCard): void {
    this.db
      .prepare("UPDATE raids SET confirmation_channel_id = ?, confirmation_message_id = ? WHERE id = ?")
      .run(card.channelId, card.messageId, raidId);
  }

  /** The Plan Confirmations of the Raid, oldest first. */
  confirmations(raidId: RaidId): PlanConfirmation[] {
    const rows = this.db
      .prepare("SELECT tag, member_id, confirmed_at FROM raid_confirmations WHERE raid_id = ? ORDER BY confirmed_at, tag")
      .all(raidId);
    return rows.map((raw) => {
      const parsed = confirmationRow.safeParse(raw);
      if (!parsed.success) throw new Error(CORRUPT_MESSAGE);
      return { tag: parsed.data.tag, memberId: parsed.data.member_id, at: new Date(parsed.data.confirmed_at) };
    });
  }

  /** Keeps a Plan Confirmation; false when the Alliance had already confirmed for the Raid, which then stays as it was. */
  addConfirmation(raidId: RaidId, confirmation: PlanConfirmation): boolean {
    const result = this.db
      .prepare("INSERT OR IGNORE INTO raid_confirmations (raid_id, tag, member_id, confirmed_at) VALUES (?, ?, ?, ?)")
      .run(raidId, confirmation.tag, confirmation.memberId, confirmation.at.toISOString());
    return Number(result.changes) === 1;
  }

  /** The keys of the notices handled for the Raid: sent, or recorded unsent. */
  noticesHandled(raidId: RaidId): Set<string> {
    const rows = this.db.prepare("SELECT key FROM raid_notices_sent WHERE raid_id = ?").all(raidId);
    return new Set(
      rows.map((raw) => {
        const parsed = noticeRow.safeParse(raw);
        if (!parsed.success) throw new Error(CORRUPT_MESSAGE);
        return parsed.data.key;
      }),
    );
  }

  /** Records a notice as handled, keeping the Raid as a draft first when it was never stored. */
  recordNotice(raid: Raid, key: string, at: Date): void {
    if (this.find(raid.id) === undefined) this.save(raid);
    this.db
      .prepare("INSERT OR IGNORE INTO raid_notices_sent (raid_id, key, sent_at) VALUES (?, ?, ?)")
      .run(raid.id, key, at.toISOString());
  }
}
