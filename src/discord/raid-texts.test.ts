import { describe, expect, test } from "vitest";
import { addPhase, assign, cancel, newRaid, publish, setNotes, type Raid, type RaidResult } from "../domain/raid.js";
import { confirmationCard, confirmRow, fitsDiscord, planCard, raidIdOfButton, confirmButtonId } from "./raid-texts.js";

const RAID_ID = "2026-11-21";
const START = new Date("2026-11-21T22:00:00.000Z");
const TAGS = ["NML", "ABC", "XYZ"];
const UNIX_START = (START.getTime() / 1000).toString();

function ok(result: RaidResult): Raid {
  if (!result.ok) throw new Error(result.refusal.kind);
  return result.raid;
}

function planned(): Raid {
  let raid = ok(addPhase(newRaid(RAID_ID, START), "Opening", "20:00"));
  raid = ok(assign(raid, { tag: "NML", objective: "Royal City", phase: "Opening", task: "Hold the gate" }, TAGS));
  raid = ok(assign(raid, { tag: "ABC", objective: "Enemy sanctuaries", phase: undefined, task: undefined }, TAGS));
  return ok(setNotes(raid, "Shields up by 19:00"));
}

describe("planCard", () => {
  test("titles it Battle Plan, with the start in Server Time and as a Discord timestamp in the description", () => {
    const card = planCard(planned());

    expect(card.title).toBe("Battle Plan");
    expect(card.description).toContain("20:00 Server Time");
    expect(card.description).toContain(`<t:${UNIX_START}:f>`);
  });

  test("shows a Phase typed as 20:00 as 20:00 Server Time with a Discord timestamp in its field value, never in the name", () => {
    const phase = planCard(planned()).fields?.find((field) => field.name === "Phase: Opening");

    expect(phase?.value).toContain(`20:00 Server Time, <t:${UNIX_START}:f>`);
    expect(phase?.value).toContain("[NML] -> Royal City (Hold the gate)");
    for (const field of planCard(planned()).fields ?? []) expect(field.name).not.toContain("<t:");
  });

  test("lists the Objectives, the whole-Raid Assignments and the notes", () => {
    const fields = planCard(planned()).fields ?? [];

    expect(fields.map((field) => field.name)).toEqual(["Objectives", "Phase: Opening", "Whole Raid", "Notes"]);
    expect(fields[0]?.value.split("\n")).toHaveLength(6);
    expect(fields[2]?.value).toBe("[ABC] -> Enemy sanctuaries");
    expect(fields[3]?.value).toBe("Shields up by 19:00");
  });

  test("marks an amended plan and a cancelled one", () => {
    const published = ok(publish(planned(), new Date("2026-11-20T10:00:00.000Z")));
    const amended = ok(publish(published, new Date("2026-11-20T11:00:00.000Z")));
    expect(planCard(amended).description).toContain("Amended <t:");

    const cancelled = planCard(ok(cancel(amended, new Date("2026-11-20T12:00:00.000Z"))));
    expect(cancelled.title).toBe("Battle Plan (cancelled)");
    expect(cancelled.description).toContain("Cancelled");
  });

  test("fits Discord's limits for a usual plan, and not for one field value over 1024 characters", () => {
    expect(fitsDiscord(planCard(planned()))).toBe(true);
    expect(fitsDiscord({ title: "x", fields: [{ name: "a", value: "x".repeat(1025) }] })).toBe(false);
    expect(fitsDiscord({ title: "x", description: "x".repeat(4000), fields: [{ name: "a", value: "x".repeat(1024) }, { name: "b", value: "x".repeat(1024) }] })).toBe(false);
  });
});

describe("confirmationCard", () => {
  const published = ok(publish(planned(), new Date("2026-11-20T10:00:00.000Z")));
  const deadline = new Date("2026-11-21T20:00:00.000Z");

  test("shows who confirmed for an on-plan Alliance and when, the missing ones, then the Alliances asked but not on the plan", () => {
    const at = new Date("2026-11-20T12:00:00.000Z");
    const card = confirmationCard(published, [{ tag: "NML", memberId: "111111111111111111", at }], TAGS, deadline);

    expect(card.fields?.[0]).toEqual({
      name: "On the plan",
      value: `[ABC]: **missing**\n[NML]: confirmed by <@111111111111111111> <t:${(at.getTime() / 1000).toString()}:f>`,
    });
    expect(card.fields?.[1]).toEqual({ name: "Asked, not on the plan", value: "[XYZ]: not confirmed" });
  });

  test("the button is Read and confirmed for the Raid, disabled once it is cancelled", () => {
    expect(confirmRow(published).components[0]).toEqual(
      expect.objectContaining({ label: "Read and confirmed", custom_id: "raid:confirm:2026-11-21", disabled: false }),
    );
    expect(confirmRow(ok(cancel(published, deadline))).components[0]?.disabled).toBe(true);
  });

  test("the button's custom id names the Raid", () => {
    expect(raidIdOfButton(confirmButtonId(RAID_ID))).toBe(RAID_ID);
    expect(raidIdOfButton("raid:confirm:nope")).toBeUndefined();
  });
});
