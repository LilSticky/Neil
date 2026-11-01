import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  dueAt,
  MAX_FAILED_ATTEMPTS,
  startInterview,
  type AwaitingConfirmation,
  type Checking,
  type Chosen,
  type NewInterview,
  type OnboardingInterview,
  type OpenInterview,
  type Recommending,
} from "../domain/onboarding-interview.js";
import { parseKingdom, parseUid, type Uid } from "../domain/lookup-input.js";
import type { PickablePlayerMatch, Player } from "../domain/player.js";
import type { MemberId } from "../domain/rank-approval.js";

/** An Interview not yet stored: the database gives it its id. */
export type InterviewDraft = Omit<NewInterview, "id">;

/** The outcome of creating: the Interview was opened, or the Member already has an open one and nothing was written. */
export type CreateOutcome =
  | { readonly kind: "created"; readonly interview: Recommending }
  | { readonly kind: "already-open" };

/** The open Interviews whose due time has come, and how many due rows could not be read. */
export interface DueInterviews {
  readonly interviews: OpenInterview[];
  readonly corrupt: number;
}

/**
 * The Interviews whose Game API lookup or check was in flight, or whose chosen Player still waits for its Link, and how
 * many such rows could not be read.
 */
export interface InFlightInterviews {
  readonly interviews: (Recommending | Checking | AwaitingConfirmation)[];
  readonly corrupt: number;
}

const OPEN_CONFLICT_PATTERN = /^UNIQUE constraint failed: onboarding_interview\.member_id$/;
const OPEN_STEPS =
  "('recommending', 'awaiting-recommendation', 'awaiting-pick', 'awaiting-uid', 'checking', 'awaiting-confirmation', 'paused-for-quota')";
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
  "chosen_uid",
  "chosen_player_json",
  "matches_json",
] as const;
const ROW_SELECT = `SELECT id, ${ROW_COLUMNS.join(", ")} FROM onboarding_interview`;
const ROW_PLACEHOLDERS = ROW_COLUMNS.map((column) => `:${column}`).join(", ");
const INSERT_ROW = `INSERT INTO onboarding_interview (${ROW_COLUMNS.join(", ")}) VALUES (${ROW_PLACEHOLDERS})`;
const UPSERT_ROW =
  `INSERT INTO onboarding_interview (id, ${ROW_COLUMNS.join(", ")}) VALUES (:id, ${ROW_PLACEHOLDERS}) ` +
  `ON CONFLICT(id) DO UPDATE SET ${ROW_COLUMNS.map((column) => `${column} = excluded.${column}`).join(", ")}`;
const UPDATE_ROW_IF_STEP =
  `UPDATE onboarding_interview SET ${ROW_COLUMNS.map((column) => `${column} = :${column}`).join(", ")} ` +
  "WHERE id = :id AND step = :expected_step";

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

/** The chosen uid of an Interview after "That's me" or a pick; NULL when the Member chose none. */
const chosenColumns = {
  chosen_uid: uidColumn.nullable(),
  chosen_player_json: z.string().nullable(),
};

/** One variant per step: each reads only the columns that step has. */
const interviewRow = z.discriminatedUnion("step", [
  z.object({
    ...interviewRowBase,
    step: z.literal("recommending"),
    failed_attempts: openFailedAttemptsColumn,
    last_asked_at: isoDateColumn,
  }),
  z.object({
    ...interviewRowBase,
    step: z.literal("awaiting-recommendation"),
    failed_attempts: openFailedAttemptsColumn,
    player_json: z.string(),
    last_asked_at: isoDateColumn,
  }),
  z.object({
    ...interviewRowBase,
    step: z.literal("awaiting-pick"),
    failed_attempts: openFailedAttemptsColumn,
    matches_json: z.string(),
    last_asked_at: isoDateColumn,
  }),
  z.object({
    ...interviewRowBase,
    step: z.literal("awaiting-uid"),
    failed_attempts: openFailedAttemptsColumn,
    last_asked_at: isoDateColumn,
    ...chosenColumns,
  }),
  z.object({
    ...interviewRowBase,
    step: z.literal("checking"),
    failed_attempts: openFailedAttemptsColumn,
    uid: uidColumn,
    last_asked_at: isoDateColumn,
    ...chosenColumns,
  }),
  z.object({
    ...interviewRowBase,
    step: z.literal("awaiting-confirmation"),
    failed_attempts: openFailedAttemptsColumn,
    player_json: z.string(),
    last_asked_at: isoDateColumn,
    // Set only when the Member chose the uid of the Player shown: the Interview is then confirmed by the choice.
    chosen_uid: uidColumn.nullable(),
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

/** The stored shape of one match of a pick list. */
const matchRecord = z.object({
  uid: z.string(),
  kingdom: z.number(),
  name: z.string().optional(),
  tag: z.string().optional(),
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
  readonly chosen_uid: string | null;
  readonly chosen_player_json: string | null;
  readonly matches_json: string | null;
};

const NO_STEP_FIELDS = {
  uid: null,
  player_json: null,
  last_asked_at: null,
  resumes_at: null,
  ended_at: null,
  end_reason: null,
  chosen_uid: null,
  chosen_player_json: null,
  matches_json: null,
} as const;

/** Keeps Onboarding Interviews in neil.db; a corrupt row is reported, never silently repaired. */
export class InterviewStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly timeoutMs: number,
  ) {}

  /** Opens an Interview looking up the Member's Recommended Player, unless the Member already has an open one; then nothing is written. */
  create(draft: InterviewDraft, now: Date): CreateOutcome {
    // The database gives the id; startInterview only needs one to build the Interview's shape.
    const started = recommendingOf(startInterview({ ...draft, id: 0 }, now).interview);
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

  /**
   * Writes the Interview only when the stored row is still on expectedStep: a writer that read the row before an await
   * cannot overwrite what happened meanwhile. Returns false, and writes nothing, when the row has moved on.
   */
  saveIfStep(interview: OnboardingInterview, expectedStep: OnboardingInterview["step"]): boolean {
    const result = this.db
      .prepare(UPDATE_ROW_IF_STEP)
      .run({ id: interview.id, expected_step: expectedStep, ...rowOf(interview, this.timeoutMs) });
    return Number(result.changes) > 0;
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

  /**
   * The Interviews to recover after a restart: a Recommended Player lookup or uid check was in flight, or the Member chose
   * the Player shown and its Link was not made yet. A row that cannot be read is counted and skipped.
   */
  inFlight(): InFlightInterviews {
    const interviews: (Recommending | Checking | AwaitingConfirmation)[] = [];
    let corrupt = 0;
    const rows = this.db
      .prepare(
        `${ROW_SELECT} WHERE step IN ('recommending', 'checking') OR (step = 'awaiting-confirmation' AND chosen_uid IS NOT NULL) ORDER BY id`,
      )
      .all();
    for (const raw of rows) {
      const interview = interviewOf(raw);
      if (interview !== undefined && isInFlight(interview)) interviews.push(interview);
      else corrupt += 1;
    }
    return { interviews, corrupt };
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

function recommendingOf(interview: OnboardingInterview): Recommending {
  if (interview.step !== "recommending") throw new Error("a new Onboarding Interview must look up the Recommended Player");
  return interview;
}

/** The steps `inFlight` lists: a lookup or check, or a confirmation of the Player the Member chose. */
function isInFlight(
  interview: OnboardingInterview,
): interview is Recommending | Checking | (AwaitingConfirmation & { readonly confirmedByChoice: true }) {
  if (interview.step === "awaiting-confirmation") return interview.confirmedByChoice === true;
  return interview.step === "recommending" || interview.step === "checking";
}

function isOpen(interview: OnboardingInterview): interview is OpenInterview {
  switch (interview.step) {
    case "recommending":
    case "awaiting-recommendation":
    case "awaiting-pick":
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
    case "recommending":
      return { ...base, step: "recommending", failedAttempts: row.failed_attempts, lastAskedAt: row.last_asked_at };
    case "awaiting-recommendation": {
      const recommended = playerOf(row.player_json);
      if (recommended === undefined) return undefined;
      return {
        ...base,
        step: "awaiting-recommendation",
        failedAttempts: row.failed_attempts,
        lastAskedAt: row.last_asked_at,
        recommended,
      };
    }
    case "awaiting-pick": {
      const matches = matchesOf(row.matches_json);
      if (matches === undefined) return undefined;
      return { ...base, step: "awaiting-pick", failedAttempts: row.failed_attempts, lastAskedAt: row.last_asked_at, matches };
    }
    case "awaiting-uid": {
      const choice = chosenOf(row.chosen_uid, row.chosen_player_json);
      if (choice === undefined) return undefined;
      return {
        ...base,
        step: "awaiting-uid",
        failedAttempts: row.failed_attempts,
        lastAskedAt: row.last_asked_at,
        ...choice,
      };
    }
    case "checking": {
      const choice = chosenOf(row.chosen_uid, row.chosen_player_json);
      if (choice === undefined) return undefined;
      return {
        ...base,
        step: "checking",
        failedAttempts: row.failed_attempts,
        lastAskedAt: row.last_asked_at,
        uid: row.uid,
        ...choice,
      };
    }
    case "awaiting-confirmation": {
      const player = playerOf(row.player_json);
      if (player === undefined) return undefined;
      return {
        ...base,
        step: "awaiting-confirmation",
        failedAttempts: row.failed_attempts,
        lastAskedAt: row.last_asked_at,
        player,
        ...(row.chosen_uid === null ? {} : { confirmedByChoice: true as const }),
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

/** The chosen uid and its Player, when the Member chose one; undefined when the columns do not fit together. */
function chosenOf(uid: Uid | null, playerJson: string | null): { readonly chosen?: Chosen } | undefined {
  if (uid === null) return playerJson === null ? {} : undefined;
  if (playerJson === null) return { chosen: { uid, player: undefined } };
  const player = playerOf(playerJson);
  return player === undefined ? undefined : { chosen: { uid, player } };
}

/** The JSON text parsed, or undefined when it is not JSON. */
function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A Player from the JSON the Interview stored; undefined when the JSON is not a valid Player. */
function playerOf(text: string | null): Player | undefined {
  if (text === null) return undefined;
  const parsed = playerRecord.safeParse(jsonOf(text));
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

/** The matches of a pick list from the JSON the Interview stored; undefined when any of them is not a Player match. */
function matchesOf(text: string | null): PickablePlayerMatch[] | undefined {
  if (text === null) return undefined;
  const parsed = z.array(matchRecord).safeParse(jsonOf(text));
  if (!parsed.success) return undefined;
  return parsed.data.map((record): PickablePlayerMatch => {
    const { name, tag } = record;
    return {
      uid: record.uid,
      kingdom: record.kingdom,
      ...(name === undefined ? {} : { name }),
      ...(tag === undefined ? {} : { tag }),
    };
  });
}

/** The columns of the chosen uid: the uid, and the Player when the Member chose a Recommended Player. */
function chosenColumnsOf(chosen: Chosen | undefined): Pick<RowValues, "chosen_uid" | "chosen_player_json"> {
  if (chosen === undefined) return { chosen_uid: null, chosen_player_json: null };
  return {
    chosen_uid: chosen.uid,
    chosen_player_json: chosen.player === undefined ? null : JSON.stringify(chosen.player),
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
    case "recommending":
      return { ...common, ...NO_STEP_FIELDS, last_asked_at: interview.lastAskedAt.toISOString() };
    case "awaiting-recommendation":
      return {
        ...common,
        ...NO_STEP_FIELDS,
        player_json: JSON.stringify(interview.recommended),
        last_asked_at: interview.lastAskedAt.toISOString(),
      };
    case "awaiting-pick":
      return {
        ...common,
        ...NO_STEP_FIELDS,
        matches_json: JSON.stringify(interview.matches),
        last_asked_at: interview.lastAskedAt.toISOString(),
      };
    case "awaiting-uid":
      return {
        ...common,
        ...NO_STEP_FIELDS,
        ...chosenColumnsOf(interview.chosen),
        last_asked_at: interview.lastAskedAt.toISOString(),
      };
    case "checking":
      return {
        ...common,
        ...NO_STEP_FIELDS,
        uid: interview.uid,
        ...chosenColumnsOf(interview.chosen),
        last_asked_at: interview.lastAskedAt.toISOString(),
      };
    case "awaiting-confirmation":
      return {
        ...common,
        ...NO_STEP_FIELDS,
        uid: interview.player.uid,
        player_json: JSON.stringify(interview.player),
        chosen_uid: interview.confirmedByChoice === true ? interview.player.uid : null,
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
