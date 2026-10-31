import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  dueAt,
  MAX_FAILED_ATTEMPTS,
  startInterview,
  type AwaitingUid,
  type Checking,
  type NewInterview,
  type OnboardingInterview,
  type OpenInterview,
} from "../domain/onboarding-interview.js";
import { parseKingdom, parseUid, type Uid } from "../domain/lookup-input.js";
import type { Player } from "../domain/player.js";
import type { MemberId } from "../domain/rank-approval.js";

/** An Interview not yet stored: the database gives it its id. */
export type InterviewDraft = Omit<NewInterview, "id">;

/** The outcome of creating: the Interview was opened, or the Member already has an open one and nothing was written. */
export type CreateOutcome =
  | { readonly kind: "created"; readonly interview: AwaitingUid }
  | { readonly kind: "already-open" };

/** The open Interviews whose due time has come, and how many due rows could not be read. */
export interface DueInterviews {
  readonly interviews: OpenInterview[];
  readonly corrupt: number;
}

const OPEN_CONFLICT_PATTERN = /^UNIQUE constraint failed: onboarding_interview\.member_id$/;
const OPEN_STEPS = "('awaiting-uid', 'checking', 'awaiting-confirmation', 'paused-for-quota')";
const ENDED_STEPS = "('linked', 'handed-off', 'abandoned')";

const ROW_COLUMNS = [
  "member_id",
  "thread_id",
  "step",
  "failed_attempts",
  "uid",
  "player_json",
  "started_at",
  "last_asked_at",
  "resumes_at",
  "ended_at",
  "end_reason",
  "due_at",
] as const;
const ROW_SELECT = `SELECT id, ${ROW_COLUMNS.join(", ")} FROM onboarding_interview`;
const ROW_PLACEHOLDERS = ROW_COLUMNS.map((column) => `:${column}`).join(", ");
const INSERT_ROW = `INSERT INTO onboarding_interview (${ROW_COLUMNS.join(", ")}) VALUES (${ROW_PLACEHOLDERS})`;
const UPSERT_ROW =
  `INSERT INTO onboarding_interview (id, ${ROW_COLUMNS.join(", ")}) VALUES (:id, ${ROW_PLACEHOLDERS}) ` +
  `ON CONFLICT(id) DO UPDATE SET ${ROW_COLUMNS.map((column) => `${column} = excluded.${column}`).join(", ")}`;

const memberIdColumn = z.string().regex(/^\d+$/);
const isoDateColumn = z.iso.datetime().transform((value) => new Date(value));
const uidColumn = z.string().transform((value, ctx): Uid => {
  const parsed = parseUid(value);
  if (parsed.ok) return parsed.value;
  ctx.addIssue({ code: "custom", message: "not a Player uid" });
  return z.NEVER;
});

const openFailedAttemptsColumn = z.literal([0, 1, 2, 3, 4]);
const abandonReasonColumn = z.enum(["left", "timed-out"]);

const interviewRowBase = {
  id: z.number().int(),
  member_id: memberIdColumn,
  thread_id: z.string().min(1),
  started_at: isoDateColumn,
};

/** One variant per step: each reads only the columns that step has. */
const interviewRow = z.discriminatedUnion("step", [
  z.object({
    ...interviewRowBase,
    step: z.literal("awaiting-uid"),
    failed_attempts: openFailedAttemptsColumn,
    last_asked_at: isoDateColumn,
  }),
  z.object({
    ...interviewRowBase,
    step: z.literal("checking"),
    failed_attempts: openFailedAttemptsColumn,
    uid: uidColumn,
    last_asked_at: isoDateColumn,
  }),
  z.object({
    ...interviewRowBase,
    step: z.literal("awaiting-confirmation"),
    failed_attempts: openFailedAttemptsColumn,
    player_json: z.string(),
    last_asked_at: isoDateColumn,
  }),
  z.object({
    ...interviewRowBase,
    step: z.literal("paused-for-quota"),
    failed_attempts: openFailedAttemptsColumn,
    resumes_at: isoDateColumn,
  }),
  z.object({
    ...interviewRowBase,
    step: z.literal("linked"),
    failed_attempts: openFailedAttemptsColumn,
    uid: uidColumn,
    ended_at: isoDateColumn,
  }),
  z.object({
    ...interviewRowBase,
    step: z.literal("handed-off"),
    failed_attempts: z.literal(MAX_FAILED_ATTEMPTS),
    ended_at: isoDateColumn,
  }),
  z.object({
    ...interviewRowBase,
    step: z.literal("abandoned"),
    failed_attempts: openFailedAttemptsColumn,
    ended_at: isoDateColumn,
    end_reason: abandonReasonColumn,
  }),
]);

/** The stored shape of a Player, as the Interview keeps it while the Member confirms. */
const playerRecord = z.object({
  uid: z.string(),
  name: z.string(),
  kingdom: z.number(),
  power: z.number(),
  sanctuaryLevel: z.number(),
  alliance: z.object({ tag: z.string(), name: z.string(), leaderUid: z.string().optional() }).optional(),
  allianceRank: z.enum(["R1", "R2", "R3", "R4", "R5", "unknown"]).optional(),
});

/** The columns of one Interview row; a step leaves the columns it does not use NULL. */
type RowValues = {
  readonly member_id: string;
  readonly thread_id: string;
  readonly step: string;
  readonly failed_attempts: number;
  readonly uid: string | null;
  readonly player_json: string | null;
  readonly started_at: string;
  readonly last_asked_at: string | null;
  readonly resumes_at: string | null;
  readonly ended_at: string | null;
  readonly end_reason: string | null;
  readonly due_at: string | null;
};

const NO_STEP_FIELDS = {
  uid: null,
  player_json: null,
  last_asked_at: null,
  resumes_at: null,
  ended_at: null,
  end_reason: null,
} as const;

/** Keeps Onboarding Interviews in neil.db; a corrupt row is reported, never silently repaired. */
export class InterviewStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly timeoutMs: number,
  ) {}

  /** Opens an Interview for the Member, unless the Member already has an open one; then nothing is written. */
  create(draft: InterviewDraft, now: Date): CreateOutcome {
    // The database gives the id; startInterview only needs one to build the Interview's shape.
    const started = awaitingUidOf(startInterview({ ...draft, id: 0 }, now).interview);
    try {
      const result = this.db.prepare(INSERT_ROW).run(rowOf(started, this.timeoutMs));
      return { kind: "created", interview: { ...started, id: Number(result.lastInsertRowid) } };
    } catch (error) {
      if (error instanceof Error && OPEN_CONFLICT_PATTERN.test(error.message)) return { kind: "already-open" };
      throw error;
    }
  }

  /** Writes the Interview, inserting it or replacing the stored one with the same id. Runs in the caller's transaction. */
  save(interview: OnboardingInterview): void {
    this.db.prepare(UPSERT_ROW).run({ id: interview.id, ...rowOf(interview, this.timeoutMs) });
  }

  get(id: number): OnboardingInterview | undefined {
    const raw = this.db.prepare(`${ROW_SELECT} WHERE id = ?`).get(id);
    return raw === undefined ? undefined : interviewOrThrow(raw);
  }

  openFor(memberId: MemberId): OpenInterview | undefined {
    const raw = this.db.prepare(`${ROW_SELECT} WHERE member_id = ? AND step IN ${OPEN_STEPS}`).get(memberId);
    if (raw === undefined) return undefined;
    const interview = interviewOrThrow(raw);
    if (!isOpen(interview)) throw corruptInterviewError();
    return interview;
  }

  /** The newest Interview of the Member, open or ended. */
  latestFor(memberId: MemberId): OnboardingInterview | undefined {
    const raw = this.db.prepare(`${ROW_SELECT} WHERE member_id = ? ORDER BY id DESC LIMIT 1`).get(memberId);
    return raw === undefined ? undefined : interviewOrThrow(raw);
  }

  /** The open Interviews whose due time has come; a due row that cannot be read is counted and skipped. */
  due(now: Date): DueInterviews {
    const interviews: OpenInterview[] = [];
    let corrupt = 0;
    const rows = this.db
      .prepare(`${ROW_SELECT} WHERE due_at IS NOT NULL AND due_at <= ? ORDER BY due_at`)
      .all(now.toISOString());
    for (const raw of rows) {
      const interview = interviewOf(raw);
      if (interview !== undefined && isOpen(interview)) interviews.push(interview);
      else corrupt += 1;
    }
    return { interviews, corrupt };
  }

  /** The Interviews waiting on a Game API check, for recovery after a restart. */
  checking(): Checking[] {
    return this.db
      .prepare(`${ROW_SELECT} WHERE step = 'checking' ORDER BY id`)
      .all()
      .map((raw): Checking => {
        const interview = interviewOrThrow(raw);
        if (interview.step !== "checking") throw corruptInterviewError();
        return interview;
      });
  }

  /** Deletes the Interviews ended before the cutoff; open ones are never deleted. */
  deleteEndedBefore(cutoff: Date): void {
    this.db
      .prepare(`DELETE FROM onboarding_interview WHERE step IN ${ENDED_STEPS} AND ended_at < ?`)
      .run(cutoff.toISOString());
  }
}

function corruptInterviewError(): Error {
  return new Error("an Onboarding Interview in neil.db is corrupt; fix or remove it by hand");
}

function awaitingUidOf(interview: OnboardingInterview): AwaitingUid {
  if (interview.step !== "awaiting-uid") throw new Error("a new Onboarding Interview must ask for the uid");
  return interview;
}

function isOpen(interview: OnboardingInterview): interview is OpenInterview {
  switch (interview.step) {
    case "awaiting-uid":
    case "checking":
    case "awaiting-confirmation":
    case "paused-for-quota":
      return true;
    case "linked":
    case "handed-off":
    case "abandoned":
      return false;
  }
}

function interviewOrThrow(raw: unknown): OnboardingInterview {
  const interview = interviewOf(raw);
  if (interview === undefined) throw corruptInterviewError();
  return interview;
}

/** An Interview from its row; undefined when the row does not validate into the domain. */
function interviewOf(raw: unknown): OnboardingInterview | undefined {
  const parsed = interviewRow.safeParse(raw);
  if (!parsed.success) return undefined;
  const row = parsed.data;
  const base = { id: row.id, memberId: row.member_id, threadId: row.thread_id, startedAt: row.started_at };
  switch (row.step) {
    case "awaiting-uid":
      return {
        ...base,
        step: "awaiting-uid",
        failedAttempts: row.failed_attempts,
        lastAskedAt: row.last_asked_at,
      };
    case "checking":
      return {
        ...base,
        step: "checking",
        failedAttempts: row.failed_attempts,
        lastAskedAt: row.last_asked_at,
        uid: row.uid,
      };
    case "awaiting-confirmation": {
      const player = playerOf(row.player_json);
      if (player === undefined) return undefined;
      return {
        ...base,
        step: "awaiting-confirmation",
        failedAttempts: row.failed_attempts,
        lastAskedAt: row.last_asked_at,
        player,
      };
    }
    case "paused-for-quota":
      return {
        ...base,
        step: "paused-for-quota",
        failedAttempts: row.failed_attempts,
        resumesAt: row.resumes_at,
      };
    case "linked":
      return {
        ...base,
        step: "linked",
        failedAttempts: row.failed_attempts,
        uid: row.uid,
        endedAt: row.ended_at,
      };
    case "handed-off":
      return {
        ...base,
        step: "handed-off",
        failedAttempts: row.failed_attempts,
        endedAt: row.ended_at,
      };
    case "abandoned":
      return {
        ...base,
        step: "abandoned",
        failedAttempts: row.failed_attempts,
        endedAt: row.ended_at,
        reason: row.end_reason,
      };
  }
}

/** A Player from the JSON the Interview stored; undefined when the JSON is not a valid Player. */
function playerOf(text: string): Player | undefined {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  const parsed = playerRecord.safeParse(json);
  if (!parsed.success) return undefined;
  const record = parsed.data;
  const uid = parseUid(record.uid);
  const kingdom = parseKingdom(record.kingdom);
  if (!uid.ok || !kingdom.ok) return undefined;
  const profile = {
    uid: uid.value,
    name: record.name,
    kingdom: kingdom.value,
    power: record.power,
    sanctuaryLevel: record.sanctuaryLevel,
  };
  if (record.alliance === undefined) {
    if (record.allianceRank !== undefined) return undefined;
    return { ...profile, alliance: undefined, allianceRank: undefined };
  }
  if (record.allianceRank === undefined) return undefined;
  let leaderUid: Uid | undefined = undefined;
  if (record.alliance.leaderUid !== undefined) {
    const parsedLeader = parseUid(record.alliance.leaderUid);
    if (!parsedLeader.ok) return undefined;
    leaderUid = parsedLeader.value;
  }
  return {
    ...profile,
    alliance: { tag: record.alliance.tag, name: record.alliance.name, leaderUid },
    allianceRank: record.allianceRank,
  };
}

/** The row of an Interview: its step's columns filled, the others NULL. */
function rowOf(interview: OnboardingInterview, timeoutMs: number): RowValues {
  const common = {
    member_id: interview.memberId,
    thread_id: interview.threadId,
    step: interview.step,
    failed_attempts: interview.failedAttempts,
    started_at: interview.startedAt.toISOString(),
    due_at: dueAt(interview, timeoutMs)?.toISOString() ?? null,
  };
  switch (interview.step) {
    case "awaiting-uid":
      return { ...common, ...NO_STEP_FIELDS, last_asked_at: interview.lastAskedAt.toISOString() };
    case "checking":
      return {
        ...common,
        ...NO_STEP_FIELDS,
        uid: interview.uid,
        last_asked_at: interview.lastAskedAt.toISOString(),
      };
    case "awaiting-confirmation":
      return {
        ...common,
        ...NO_STEP_FIELDS,
        uid: interview.player.uid,
        player_json: JSON.stringify(interview.player),
        last_asked_at: interview.lastAskedAt.toISOString(),
      };
    case "paused-for-quota":
      return { ...common, ...NO_STEP_FIELDS, resumes_at: interview.resumesAt.toISOString() };
    case "linked":
      return { ...common, ...NO_STEP_FIELDS, uid: interview.uid, ended_at: interview.endedAt.toISOString() };
    case "handed-off":
      return { ...common, ...NO_STEP_FIELDS, ended_at: interview.endedAt.toISOString() };
    case "abandoned":
      return {
        ...common,
        ...NO_STEP_FIELDS,
        ended_at: interview.endedAt.toISOString(),
        end_reason: interview.reason,
      };
  }
}
