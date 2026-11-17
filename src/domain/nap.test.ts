import { describe, expect, test } from "vitest";
import type { Editor } from "./exile.js";
import { kingdomOf } from "./__fixtures__/players.js";
import {
  isNapCouncilMember,
  isNapMember,
  linkedR5AllianceOf,
  mayApprove,
  mayAskToJoin,
  mayLeave,
  napMembers,
  type NapEvent,
} from "./nap.js";

const HOME = kingdomOf(330);

function joined(tag: string, at: string, approvedAs: "council" | "officer" = "council"): NapEvent {
  return {
    kind: "joined",
    tag,
    requestedBy: "111111111111111111",
    requestedAt: new Date(new Date(at).getTime() - 60_000),
    approvedBy: "222222222222222222",
    approvedAs,
    at: new Date(at),
  };
}

function left(tag: string, at: string): NapEvent {
  return { kind: "left", tag, leftBy: "111111111111111111", at: new Date(at) };
}

describe("napMembers", () => {
  test("is empty without history", () => {
    expect(napMembers([])).toEqual([]);
  });

  test("holds every Alliance whose latest event is a join, with the time it joined", () => {
    const history = [joined("NML", "2026-11-01T10:00:00Z", "officer"), joined("ABC", "2026-11-02T10:00:00Z")];

    expect(napMembers(history)).toEqual([
      { tag: "NML", since: new Date("2026-11-01T10:00:00Z") },
      { tag: "ABC", since: new Date("2026-11-02T10:00:00Z") },
    ]);
  });

  test("drops an Alliance that left, and takes it back with its new join time when it joins again", () => {
    const history = [
      joined("NML", "2026-11-01T10:00:00Z", "officer"),
      joined("ABC", "2026-11-02T10:00:00Z"),
      left("nml", "2026-11-03T10:00:00Z"),
    ];
    expect(napMembers(history)).toEqual([{ tag: "ABC", since: new Date("2026-11-02T10:00:00Z") }]);
    expect(isNapMember(history, "NML")).toBe(false);

    const again = [...history, joined("NML", "2026-11-04T10:00:00Z")];
    expect(napMembers(again)).toEqual([
      { tag: "ABC", since: new Date("2026-11-02T10:00:00Z") },
      { tag: "NML", since: new Date("2026-11-04T10:00:00Z") },
    ]);
  });

  test("compares tags ignoring letter case", () => {
    expect(isNapMember([joined("NmL", "2026-11-01T10:00:00Z")], "nml")).toBe(true);
  });
});

describe("linkedR5AllianceOf", () => {
  const r5 = (tag: string | undefined, kingdom = 330): Editor => ({
    allianceRank: { source: "game-api", rank: "R5" },
    allianceKingdom: kingdomOf(kingdom),
    allianceTag: tag,
  });

  test("gives the tag of a Game API R5's Home Kingdom Alliance", () => {
    expect(linkedR5AllianceOf(r5("NML"), HOME)).toBe("NML");
  });

  test("accepts an R5 from a Rank Approval", () => {
    const editor: Editor = {
      allianceRank: { source: "rank-approval", rank: "R5", approvedBy: "1", approvedAt: new Date(0) },
      allianceKingdom: HOME,
      allianceTag: "NML",
    };
    expect(linkedR5AllianceOf(editor, HOME)).toBe("NML");
  });

  test("refuses an R4, another Kingdom, and a Member without a recorded Alliance", () => {
    expect(linkedR5AllianceOf({ ...r5("NML"), allianceRank: { source: "game-api", rank: "R4" } }, HOME)).toBeUndefined();
    expect(linkedR5AllianceOf(r5("NML", 331), HOME)).toBeUndefined();
    expect(linkedR5AllianceOf(r5(undefined), HOME)).toBeUndefined();
    expect(linkedR5AllianceOf({ ...r5("NML"), allianceRank: { source: "unknown" } }, HOME)).toBeUndefined();
  });
});

describe("who may ask, approve and leave", () => {
  const history = [joined("NML", "2026-11-01T10:00:00Z", "officer")];

  test("a Linked R5 of an Alliance outside the NaP may ask, unless a request for it is open", () => {
    expect(mayAskToJoin("ABC", history, [])).toBe(true);
    expect(mayAskToJoin("ABC", history, ["abc"])).toBe(false);
    expect(mayAskToJoin("NML", history, [])).toBe(false);
    expect(mayAskToJoin(undefined, history, [])).toBe(false);
  });

  test("the NaP Council is the Linked R5s of the Alliances in the NaP", () => {
    expect(isNapCouncilMember("nml", history)).toBe(true);
    expect(isNapCouncilMember("ABC", history)).toBe(false);
    expect(isNapCouncilMember(undefined, history)).toBe(false);
  });

  test("a council member approves as council, also when they are an Officer", () => {
    expect(mayApprove({ allianceTag: "NML", officer: false }, history)).toBe("council");
    expect(mayApprove({ allianceTag: "NML", officer: true }, history)).toBe("council");
  });

  test("an Officer approves only while the NaP has no members", () => {
    expect(mayApprove({ allianceTag: undefined, officer: true }, [])).toBe("officer");
    expect(mayApprove({ allianceTag: undefined, officer: true }, history)).toBeUndefined();
    expect(mayApprove({ allianceTag: "ABC", officer: false }, history)).toBeUndefined();
    expect(mayApprove({ allianceTag: undefined, officer: false }, [])).toBeUndefined();
  });

  test("once every Alliance has left, an Officer approves again", () => {
    expect(mayApprove({ allianceTag: undefined, officer: true }, [...history, left("NML", "2026-11-02T10:00:00Z")])).toBe(
      "officer",
    );
  });

  test("only the Linked R5 of an Alliance in the NaP may take it out", () => {
    expect(mayLeave("NML", history)).toBe(true);
    expect(mayLeave("ABC", history)).toBe(false);
    expect(mayLeave(undefined, history)).toBe(false);
  });
});
