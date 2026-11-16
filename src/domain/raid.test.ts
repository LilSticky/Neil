import { describe, expect, test } from "vitest";
import {
  addObjective,
  addPhase,
  assign,
  cancel,
  confirmPlan,
  currentRaidOf,
  dueNotices,
  FIXED_OBJECTIVES,
  newRaid,
  objectivesOf,
  onPlan,
  publish,
  removeObjective,
  removePhase,
  setNotes,
  unassign,
  type Raid,
  type RaidResult,
} from "./raid.js";

const RAID_ID = "2026-11-21";
/** Saturday 20:00 Server Time is 22:00 UTC. */
const START = new Date("2026-11-21T22:00:00.000Z");
const TAGS = ["NML", "ABC", "XYZ"];
const DEADLINES = { planHours: 24, confirmationHours: 2 };

function ok(result: RaidResult): Raid {
  if (!result.ok) throw new Error(`refused: ${result.refusal.kind}`);
  return result.raid;
}

function refusalOf(result: RaidResult): string {
  if (result.ok) throw new Error("expected a refusal");
  return result.refusal.kind;
}

function draft(): Raid {
  return newRaid(RAID_ID, START);
}

/** A draft with a Phase at 20:00 and NML on the Royal City for it. */
function planned(): Raid {
  const withPhase = ok(addPhase(draft(), "Opening", "20:00"));
  return ok(assign(withPhase, { tag: "NML", objective: "Royal City", phase: "Opening", task: "Hold the gate" }, TAGS));
}

function minutesBefore(moment: Date, minutes: number): Date {
  return new Date(moment.getTime() - minutes * 60_000);
}

describe("currentRaidOf", () => {
  test("from Sunday to Saturday, the Raid is that week's Saturday at the start time", () => {
    expect(currentRaidOf(new Date("2026-11-16T12:00:00.000Z"), 20 * 60)).toEqual({ id: RAID_ID, start: START });
    // Sunday 00:30 Server Time is 02:30 UTC.
    expect(currentRaidOf(new Date("2026-11-15T02:30:00.000Z"), 20 * 60).id).toBe(RAID_ID);
  });

  test("Saturday 23:59 Server Time is still that Saturday's Raid; 00:00 starts the next week", () => {
    expect(currentRaidOf(new Date("2026-11-22T01:59:00.000Z"), 20 * 60).id).toBe(RAID_ID);
    expect(currentRaidOf(new Date("2026-11-22T02:00:00.000Z"), 20 * 60).id).toBe("2026-11-28");
  });
});

describe("Objectives", () => {
  test("a plan always offers the six fixed Objectives in order", () => {
    expect(objectivesOf(draft().plan)).toEqual([
      "Royal City",
      "Cannon Tower North",
      "Cannon Tower East",
      "Cannon Tower South",
      "Cannon Tower West",
      "Enemy sanctuaries",
    ]);
    expect(FIXED_OBJECTIVES).toHaveLength(6);
  });

  test("a fixed Objective can't be removed", () => {
    expect(refusalOf(removeObjective(draft(), "royal city"))).toBe("fixed-objective");
  });

  test("custom Objectives come after the fixed ones, are unique ignoring case and at most six", () => {
    let raid = ok(addObjective(draft(), " Enemy capital gate "));
    expect(objectivesOf(raid.plan).at(-1)).toBe("Enemy capital gate");
    expect(refusalOf(addObjective(raid, "ENEMY CAPITAL GATE"))).toBe("objective-exists");
    expect(refusalOf(addObjective(raid, "cannon tower north"))).toBe("objective-exists");
    for (const name of ["A", "B", "C", "D", "E"]) raid = ok(addObjective(raid, name));
    expect(refusalOf(addObjective(raid, "F"))).toBe("too-many-objectives");
  });

  test("a name is 1 to 50 characters", () => {
    expect(refusalOf(addObjective(draft(), "  "))).toBe("invalid-name");
    expect(refusalOf(addObjective(draft(), "x".repeat(51)))).toBe("invalid-name");
    expect(addObjective(draft(), "x".repeat(50)).ok).toBe(true);
  });

  test("a custom Objective is removed, unless it is still assigned", () => {
    const raid = ok(addObjective(draft(), "Bridge"));
    expect(objectivesOf(ok(removeObjective(raid, "bridge")).plan)).toEqual(FIXED_OBJECTIVES);

    const assigned = ok(assign(raid, { tag: "ABC", objective: "Bridge", phase: undefined, task: undefined }, TAGS));
    const result = removeObjective(assigned, "Bridge");
    expect(result.ok).toBe(false);
    if (!result.ok && result.refusal.kind === "still-assigned") expect(result.refusal.assignments[0]?.tag).toBe("ABC");
    else throw new Error("expected still-assigned");
  });
});

describe("Phases", () => {
  test("a Phase typed as 20:00 on Raid day is Saturday 22:00 UTC", () => {
    expect(ok(addPhase(draft(), "Opening", "20:00")).plan.phases[0]?.at.toISOString()).toBe("2026-11-21T22:00:00.000Z");
  });

  test("a Phase before the Raid start is refused, and a bad time too", () => {
    expect(refusalOf(addPhase(draft(), "Early", "19:59"))).toBe("phase-before-start");
    expect(refusalOf(addPhase(draft(), "Late", "24:00"))).toBe("invalid-time");
    expect(refusalOf(addPhase(draft(), "Late", "8 pm"))).toBe("invalid-time");
  });

  test("Phases are kept sorted by time, unique ignoring case, at most eight", () => {
    let raid = ok(addPhase(draft(), "Second", "21:00"));
    raid = ok(addPhase(raid, "First", "20:30"));
    expect(raid.plan.phases.map((phase) => phase.name)).toEqual(["First", "Second"]);
    expect(refusalOf(addPhase(raid, "first", "22:00"))).toBe("phase-exists");
    for (const [index, time] of ["22:00", "22:10", "22:20", "22:30", "22:40", "22:50"].entries()) {
      raid = ok(addPhase(raid, `P${index.toString()}`, time));
    }
    expect(refusalOf(addPhase(raid, "Ninth", "23:00"))).toBe("too-many-phases");
  });

  test("a Phase with Assignments can't be removed; one without can", () => {
    expect(refusalOf(removePhase(planned(), "opening"))).toBe("still-assigned");
    expect(ok(removePhase(ok(addPhase(draft(), "Opening", "20:00")), "opening")).plan.phases).toEqual([]);
  });
});

describe("Assignments", () => {
  test("an Alliance with an Assignment is on the plan", () => {
    const raid = ok(assign(planned(), { tag: "[ABC]", objective: "enemy sanctuaries", phase: undefined, task: undefined }, TAGS));
    expect(onPlan(raid)).toEqual(["ABC", "NML"]);
    expect(raid.plan.assignments[1]).toEqual({ tag: "ABC", objective: "Enemy sanctuaries", phase: undefined, task: undefined });
  });

  test("one Assignment per Alliance, Objective and Phase", () => {
    expect(refusalOf(assign(planned(), { tag: "NML", objective: "Royal City", phase: "Opening", task: undefined }, TAGS))).toBe(
      "assignment-exists",
    );
    expect(assign(planned(), { tag: "NML", objective: "Royal City", phase: undefined, task: undefined }, TAGS).ok).toBe(true);
  });

  test("the Alliance, Objective and Phase must exist, and the task is at most 100 characters", () => {
    const base = { tag: "NML", objective: "Royal City", phase: undefined, task: undefined };
    expect(refusalOf(assign(draft(), { ...base, tag: "FOO" }, TAGS))).toBe("unknown-alliance");
    expect(refusalOf(assign(draft(), { ...base, objective: "Moon" }, TAGS))).toBe("unknown-objective");
    expect(refusalOf(assign(draft(), { ...base, phase: "Nope" }, TAGS))).toBe("unknown-phase");
    expect(refusalOf(assign(draft(), { ...base, task: "x".repeat(101) }, TAGS))).toBe("task-too-long");
  });

  test("at most 40 Assignments", () => {
    let raid = draft();
    for (let index = 0; index < 40; index += 1) {
      const tag = `T${index.toString()}`;
      raid = ok(assign(raid, { tag, objective: "Royal City", phase: undefined, task: undefined }, [tag]));
    }
    expect(refusalOf(assign(raid, { tag: "NML", objective: "Royal City", phase: undefined, task: undefined }, TAGS))).toBe(
      "too-many-assignments",
    );
  });

  test("unassign removes exactly that Assignment", () => {
    expect(ok(unassign(planned(), { tag: "nml", objective: "Royal City", phase: "Opening" }, TAGS)).plan.assignments).toEqual([]);
    expect(refusalOf(unassign(planned(), { tag: "NML", objective: "Royal City", phase: undefined }, TAGS))).toBe(
      "no-such-assignment",
    );
  });
});

describe("notes, publish and cancel", () => {
  test("notes up to 1000 characters; empty clears them", () => {
    expect(ok(setNotes(draft(), "Shields up by 19:00")).plan.notes).toBe("Shields up by 19:00");
    expect(ok(setNotes(ok(setNotes(draft(), "x")), "")).plan.notes).toBe("");
    expect(refusalOf(setNotes(draft(), "x".repeat(1001)))).toBe("notes-too-long");
  });

  test("publishing needs a Phase, an Assignment and a start ahead; publishing again marks it amended", () => {
    const now = new Date("2026-11-20T10:00:00.000Z");
    expect(refusalOf(publish(ok(addPhase(draft(), "Opening", "20:00")), now))).toBe("nothing-to-publish");
    expect(refusalOf(publish(planned(), START))).toBe("start-passed");
    const published = ok(publish(planned(), now));
    expect(published.state).toEqual({ kind: "published", publishedAt: now, amendedAt: undefined });
    const later = new Date("2026-11-20T12:00:00.000Z");
    expect(ok(publish(published, later)).state).toEqual({ kind: "published", publishedAt: now, amendedAt: later });
  });

  test("a cancel is final: no change, no publish, no second cancel", () => {
    const cancelled = ok(cancel(planned(), new Date("2026-11-20T10:00:00.000Z")));
    expect(cancelled.state.kind).toBe("cancelled");
    expect(refusalOf(publish(cancelled, new Date("2026-11-20T11:00:00.000Z")))).toBe("cancelled");
    expect(refusalOf(setNotes(cancelled, "x"))).toBe("cancelled");
    expect(refusalOf(cancel(cancelled, new Date()))).toBe("cancelled");
  });
});

describe("confirmPlan", () => {
  const at = new Date("2026-11-20T12:00:00.000Z");
  const published = ok(publish(planned(), new Date("2026-11-20T10:00:00.000Z")));

  test("the first Plan Confirmation per Alliance wins", () => {
    expect(confirmPlan(published, [], { tag: "NML", memberId: "1", at }).ok).toBe(true);
    const earlier = { tag: "NML", memberId: "1", at };
    expect(confirmPlan(published, [earlier], { tag: "NML", memberId: "2", at })).toEqual({
      ok: false,
      refusal: { kind: "already-confirmed", confirmation: earlier },
    });
  });

  test("a draft or a cancelled Raid takes none", () => {
    expect(confirmPlan(planned(), [], { tag: "NML", memberId: "1", at })).toEqual({ ok: false, refusal: { kind: "not-published" } });
    expect(confirmPlan(ok(cancel(published, at)), [], { tag: "NML", memberId: "1", at })).toEqual({
      ok: false,
      refusal: { kind: "cancelled" },
    });
  });
});

describe("dueNotices", () => {
  const publishedAt = new Date("2026-11-19T12:00:00.000Z");
  const published = ok(publish(planned(), publishedAt));
  const confirmationDeadline = minutesBefore(START, 120);
  const keysOf = (notices: readonly { key: string }[]) => notices.map((notice) => notice.key);

  test("the Plan Deadline mention is due while the Raid is a draft, not once it is published", () => {
    const at = minutesBefore(START, 24 * 60);
    expect(keysOf(dueNotices(draft(), DEADLINES, new Set(), at).send)).toEqual(["plan-deadline"]);
    expect(keysOf(dueNotices(draft(), DEADLINES, new Set(["plan-deadline"]), at).send)).toEqual([]);
    expect(keysOf(dueNotices(published, DEADLINES, new Set(), new Date(at.getTime() - 1)).send)).toEqual([]);
  });

  test("chases 12 h and 2 h before the Confirmation Deadline, then the deadline list", () => {
    const chase12 = minutesBefore(confirmationDeadline, 12 * 60);
    expect(keysOf(dueNotices(published, DEADLINES, new Set(), chase12).send)).toEqual(["chase:12h"]);
    const chase2 = minutesBefore(confirmationDeadline, 2 * 60);
    expect(keysOf(dueNotices(published, DEADLINES, new Set(["chase:12h"]), chase2).send)).toEqual(["chase:2h"]);
    expect(keysOf(dueNotices(published, DEADLINES, new Set(["chase:12h", "chase:2h"]), confirmationDeadline).send)).toEqual([
      "confirmation-deadline",
    ]);
  });

  test("chases due before the first publish are recorded, not sent", () => {
    const late = ok(publish(planned(), minutesBefore(confirmationDeadline, 60)));
    const plan = dueNotices(late, DEADLINES, new Set(), minutesBefore(confirmationDeadline, 59));
    expect(keysOf(plan.send)).toEqual([]);
    expect(keysOf(plan.record).sort()).toEqual(["chase:12h", "chase:2h", "plan-deadline"]);
  });

  test("missed while off: only the latest due one goes out, the others are recorded", () => {
    const plan = dueNotices(published, DEADLINES, new Set(["plan-deadline"]), new Date(confirmationDeadline.getTime() + 60_000));
    expect(keysOf(plan.send)).toEqual(["confirmation-deadline"]);
    expect(keysOf(plan.record).sort()).toEqual(["chase:12h", "chase:2h"]);
  });

  test("Raid Reminders 30 minutes before the start and at each Phase; more than 10 minutes late is recorded", () => {
    const handled = new Set(["plan-deadline", "chase:12h", "chase:2h", "confirmation-deadline"]);
    expect(keysOf(dueNotices(published, DEADLINES, handled, minutesBefore(START, 30)).send)).toEqual(["reminder:start"]);
    const atPhase = dueNotices(published, DEADLINES, new Set([...handled, "reminder:start"]), START);
    expect(atPhase.send).toEqual([expect.objectContaining({ kind: "reminder", phase: published.plan.phases[0] })]);
    const late = dueNotices(published, DEADLINES, handled, new Date(START.getTime() + 11 * 60_000));
    expect(late.send).toEqual([]);
    expect(late.record).toHaveLength(2);
  });

  test("a cancelled Raid has no notices", () => {
    const cancelled = ok(cancel(published, publishedAt));
    expect(dueNotices(cancelled, DEADLINES, new Set(), START)).toEqual({ send: [], record: [] });
  });

  test("a draft gets no reminders and its chases are recorded unsent", () => {
    const plan = dueNotices(planned(), DEADLINES, new Set(["plan-deadline"]), confirmationDeadline);
    expect(plan.send).toEqual([]);
    expect(keysOf(plan.record).sort()).toEqual(["chase:12h", "chase:2h", "confirmation-deadline"]);
  });
});
