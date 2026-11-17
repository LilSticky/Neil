import { describe, expect, test } from "vitest";
import type { Editor } from "./exile.js";
import { kingdomOf } from "./__fixtures__/players.js";
import {
  cooldownEndOf,
  isNapCouncilMember,
  isNapMember,
  linkedR5AllianceOf,
  mayAskToJoin,
  mayKeepReaper,
  mayDecide,
  mayLeave,
  NAP_COOLDOWN_MS,
  NAP_VOTE_MS,
  napFormerMembers,
  napMembers,
  napStatusOf,
  runningCooldownOf,
  voteResult,
  type NapEvent,
  type NapVote,
} from "./nap.js";

const HOME = kingdomOf(330);

function joined(tag: string, at: string, decidedAs: "council" | "officer" = "council"): NapEvent {
  return {
    kind: "joined",
    tag,
    requestedBy: "111111111111111111",
    requestedAt: new Date(new Date(at).getTime() - 60_000),
    decision: { as: decidedAs, by: "222222222222222222" },
    at: new Date(at),
  };
}

function declined(tag: string, at: string): NapEvent {
  return {
    kind: "declined",
    tag,
    requestedBy: "111111111111111111",
    requestedAt: new Date(new Date(at).getTime() - NAP_VOTE_MS),
    decision: { as: "vote", approve: 0, decline: 1 },
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

  test("a decline changes nothing about who is in the NaP", () => {
    const history = [joined("NML", "2026-11-01T10:00:00Z"), declined("ABC", "2026-11-02T10:00:00Z")];
    expect(napMembers(history)).toEqual([{ tag: "NML", since: new Date("2026-11-01T10:00:00Z") }]);
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

describe("who may ask, decide and leave", () => {
  const history = [joined("NML", "2026-11-01T10:00:00Z", "officer")];

  test("a Linked R5 of an Alliance outside the NaP may ask, unless a request for it is open", () => {
    const now = new Date("2026-11-16T10:00:00Z");
    expect(mayAskToJoin("ABC", history, [], now)).toBe(true);
    expect(mayAskToJoin("ABC", history, ["abc"], now)).toBe(false);
    expect(mayAskToJoin("NML", history, [], now)).toBe(false);
    expect(mayAskToJoin(undefined, history, [], now)).toBe(false);
  });

  test("the NaP Council is the Linked R5s of the Alliances in the NaP", () => {
    expect(isNapCouncilMember("nml", history)).toBe(true);
    expect(isNapCouncilMember("ABC", history)).toBe(false);
    expect(isNapCouncilMember(undefined, history)).toBe(false);
  });

  test("a council member votes as council, also when they are an Officer", () => {
    expect(mayDecide({ allianceTag: "NML", officer: false }, history)).toBe("council");
    expect(mayDecide({ allianceTag: "NML", officer: true }, history)).toBe("council");
  });

  test("an Officer decides alone only while the NaP has no members", () => {
    expect(mayDecide({ allianceTag: undefined, officer: true }, [])).toBe("officer");
    expect(mayDecide({ allianceTag: undefined, officer: true }, history)).toBeUndefined();
    expect(mayDecide({ allianceTag: "ABC", officer: false }, history)).toBeUndefined();
    expect(mayDecide({ allianceTag: undefined, officer: false }, [])).toBeUndefined();
  });

  test("once every Alliance has left, an Officer decides again", () => {
    expect(mayDecide({ allianceTag: undefined, officer: true }, [...history, left("NML", "2026-11-02T10:00:00Z")])).toBe(
      "officer",
    );
  });

  test("only the Linked R5 of an Alliance in the NaP may take it out", () => {
    expect(mayLeave("NML", history)).toBe(true);
    expect(mayLeave("ABC", history)).toBe(false);
    expect(mayLeave(undefined, history)).toBe(false);
  });
});

describe("mayKeepReaper", () => {
  const history = [joined("NML", "2026-11-01T10:00:00Z")];
  const r5 = (tag: string | undefined, kingdom = 330): Editor => ({
    allianceRank: { source: "game-api", rank: "R5" },
    allianceKingdom: kingdomOf(kingdom),
    allianceTag: tag,
  });

  test("a member of the NaP Council may keep REAPER", () => {
    expect(mayKeepReaper({ allianceTag: linkedR5AllianceOf(r5("NML"), HOME), officer: false }, history)).toBe(true);
  });

  test("the R5 of a Home Kingdom Alliance outside the NaP may not", () => {
    expect(mayKeepReaper({ allianceTag: linkedR5AllianceOf(r5("ABC"), HOME), officer: false }, history)).toBe(false);
  });

  test("the R5 of an Alliance of another Kingdom with a NaP member's tag may not", () => {
    expect(mayKeepReaper({ allianceTag: linkedR5AllianceOf(r5("NML", 331), HOME), officer: false }, history)).toBe(false);
  });

  test("an Officer may while the NaP has no members", () => {
    expect(mayKeepReaper({ allianceTag: undefined, officer: true }, [])).toBe(true);
  });

  test("an Officer may not while the NaP has members", () => {
    expect(mayKeepReaper({ allianceTag: undefined, officer: true }, history)).toBe(false);
  });

  test("an Officer who is also on the NaP Council may", () => {
    expect(mayKeepReaper({ allianceTag: "NML", officer: true }, history)).toBe(true);
  });

  test("a NaP emptied by leaves counts as empty", () => {
    const emptied = [...history, left("NML", "2026-11-02T10:00:00Z")];
    expect(mayKeepReaper({ allianceTag: undefined, officer: true }, emptied)).toBe(true);
    expect(mayKeepReaper({ allianceTag: "NML", officer: false }, emptied)).toBe(false);
  });

  test("a Member who is neither on the NaP Council nor an Officer may not, even while the NaP is empty", () => {
    expect(mayKeepReaper({ allianceTag: undefined, officer: false }, [])).toBe(false);
  });
});

describe("the NaP Vote", () => {
  const members = [
    { tag: "NML", since: new Date("2026-11-01T10:00:00Z") },
    { tag: "ABC", since: new Date("2026-11-02T10:00:00Z") },
    { tag: "XYZ", since: new Date("2026-11-03T10:00:00Z") },
  ];
  const vote = (allianceTag: string, choice: "approve" | "decline"): NapVote => ({
    allianceTag,
    voterId: "333333333333333333",
    vote: choice,
    at: new Date("2026-11-10T10:00:00Z"),
  });

  test("runs 48 hours", () => {
    expect(NAP_VOTE_MS).toBe(172_800_000);
  });

  test("more Approve than Decline votes approve", () => {
    expect(voteResult([vote("NML", "approve"), vote("ABC", "approve"), vote("XYZ", "decline")], members)).toEqual({
      outcome: "approved",
      approve: 2,
      decline: 1,
    });
  });

  test("a tie declines, and so do no votes at all", () => {
    expect(voteResult([vote("NML", "approve"), vote("ABC", "decline")], members)).toEqual({
      outcome: "declined",
      approve: 1,
      decline: 1,
    });
    expect(voteResult([], members)).toEqual({ outcome: "declined", approve: 0, decline: 0 });
  });

  test("ignores the votes of Alliances no longer in the NaP, and counts one vote per Alliance", () => {
    const votes = [vote("NML", "approve"), vote("OLD", "decline"), vote("OLD", "decline"), vote("nml", "approve")];
    expect(voteResult(votes, members)).toEqual({ outcome: "approved", approve: 1, decline: 0 });
  });
});

describe("the NaP Cooldown", () => {
  const declinedAt = "2026-11-01T10:00:00Z";
  const history = [joined("NML", "2026-10-01T10:00:00Z"), declined("ABC", declinedAt)];
  const endsAt = new Date(new Date(declinedAt).getTime() + NAP_COOLDOWN_MS);

  test("runs 30 days from the latest decline", () => {
    expect(NAP_COOLDOWN_MS).toBe(2_592_000_000);
    expect(cooldownEndOf(history, "abc")).toEqual({ declinedAt: new Date(declinedAt), endsAt });
    expect(cooldownEndOf(history, "XYZ")).toBeUndefined();
  });

  test("refuses a new request while it runs, and allows it from its end", () => {
    const during = new Date(endsAt.getTime() - 1);
    expect(runningCooldownOf(history, "ABC", during)).toEqual({ declinedAt: new Date(declinedAt), endsAt });
    expect(mayAskToJoin("ABC", history, [], during)).toBe(false);
    expect(runningCooldownOf(history, "ABC", endsAt)).toBeUndefined();
    expect(mayAskToJoin("ABC", history, [], endsAt)).toBe(true);
  });

  test("ends once the Alliance joined after the decline", () => {
    expect(cooldownEndOf([...history, joined("ABC", "2026-11-02T10:00:00Z", "officer")], "ABC")).toBeUndefined();
  });
});

describe("napFormerMembers", () => {
  test("is empty without history and while every Alliance is in the NaP", () => {
    expect(napFormerMembers([])).toEqual([]);
    expect(napFormerMembers([joined("NML", "2026-11-01T10:00:00Z")])).toEqual([]);
  });

  test("holds every Alliance whose latest event is a leave, newest leave first, ignoring letter case", () => {
    const history = [
      joined("NML", "2026-11-01T10:00:00Z"),
      joined("ABC", "2026-11-02T10:00:00Z"),
      joined("XYZ", "2026-11-03T10:00:00Z"),
      left("nml", "2026-11-04T10:00:00Z"),
      left("ABC", "2026-11-05T10:00:00Z"),
      left("XYZ", "2026-11-06T10:00:00Z"),
      joined("XYZ", "2026-11-07T10:00:00Z"),
    ];

    expect(napFormerMembers(history)).toEqual([
      { tag: "ABC", leftAt: new Date("2026-11-05T10:00:00Z") },
      { tag: "nml", leftAt: new Date("2026-11-04T10:00:00Z") },
    ]);
  });
});

describe("napStatusOf", () => {
  const history = [
    joined("NML", "2026-11-01T10:00:00Z"),
    joined("ABC", "2026-11-02T10:00:00Z"),
    left("ABC", "2026-11-03T10:00:00Z"),
    joined("XYZ", "2026-11-04T10:00:00Z"),
    left("XYZ", "2026-11-05T10:00:00Z"),
    joined("xyz", "2026-11-06T10:00:00Z"),
  ];

  test("a Home Kingdom Alliance in the NaP is a member since it joined, ignoring letter case", () => {
    expect(napStatusOf(history, HOME, { kingdom: HOME, tag: "nml" })).toEqual({
      kind: "member",
      since: new Date("2026-11-01T10:00:00Z"),
    });
  });

  test("an Alliance that rejoined is a member since it joined again", () => {
    expect(napStatusOf(history, HOME, { kingdom: HOME, tag: "XYZ" })).toEqual({
      kind: "member",
      since: new Date("2026-11-06T10:00:00Z"),
    });
  });

  test("an Alliance that left is not a member, with when it left", () => {
    expect(napStatusOf(history, HOME, { kingdom: HOME, tag: "ABC" })).toEqual({
      kind: "not-member",
      leftAt: new Date("2026-11-03T10:00:00Z"),
    });
  });

  test("an Alliance that never joined is not a member, with no leave", () => {
    expect(napStatusOf(history, HOME, { kingdom: HOME, tag: "QQQ" })).toEqual({ kind: "not-member", leftAt: undefined });
  });

  test("another Kingdom's Alliance with the same tag has no status", () => {
    expect(napStatusOf(history, HOME, { kingdom: kingdomOf(331), tag: "NML" })).toBeUndefined();
  });
});
