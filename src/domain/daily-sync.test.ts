import { describe, expect, test } from "vitest";
import { utcDayOf } from "./daily-quota.js";
import type { RankOnLink } from "./link.js";
import { allied, approvedRank, gameApiRank, kingdomOf, NO_ALLIANCE, UNKNOWN_RANK, unallied, uidOf } from "./__fixtures__/players.js";
import { isDue, planSync, playerFromRoster, rankAfterSync, type AllianceRef, type SyncLink } from "./daily-sync.js";
import type { Alliance, RosterEntry } from "./player.js";

const MEMBER_ANA = "100000000000000001";
const MEMBER_BEN = "100000000000000002";
const MEMBER_CAL = "100000000000000003";

function allianceRef(tag: string, kingdom: number): AllianceRef {
  return { kingdom: kingdomOf(kingdom), tag };
}

function linkOf(memberId: string, uid: string, lastAlliance: AllianceRef | undefined): SyncLink {
  return { memberId, uid: uidOf(uid), lastAlliance };
}

const NML = allianceRef("NML", 1);
const ABC = allianceRef("ABC", 1);
const NML_IN_OTHER_KINGDOM = allianceRef("NML", 2);

describe("planSync", () => {
  test("asks for one roster per Alliance, covering all of its Linked Members", () => {
    const ana = linkOf(MEMBER_ANA, "145563254785", NML);
    const ben = linkOf(MEMBER_BEN, "93159425", NML);
    const cal = linkOf(MEMBER_CAL, "147744374785", ABC);

    const steps = planSync([ana, ben, cal], []);

    expect(steps).toEqual([
      { kind: "roster", alliance: NML, links: [ana, ben] },
      { kind: "roster", alliance: ABC, links: [cal] },
    ]);
  });

  test("reads the same tag in another Kingdom as another Alliance, with its own roster", () => {
    const ana = linkOf(MEMBER_ANA, "145563254785", NML);
    const ben = linkOf(MEMBER_BEN, "93159425", NML_IN_OTHER_KINGDOM);

    const steps = planSync([ana, ben], []);

    expect(steps.map((step) => (step.kind === "roster" ? step.alliance : undefined))).toEqual([NML, NML_IN_OTHER_KINGDOM]);
  });

  test("looks up by uid the Linked Members in no Alliance, and asks no roster for them", () => {
    const ana = linkOf(MEMBER_ANA, "145563254785", undefined);
    const ben = linkOf(MEMBER_BEN, "93159425", NML);

    const steps = planSync([ana, ben], []);

    expect(steps).toContainEqual({ kind: "uid", link: ana });
    expect(steps.filter((step) => step.kind === "roster")).toEqual([{ kind: "roster", alliance: NML, links: [ben] }]);
  });

  test("puts the Alliance of a left-over Member first, ahead of the Alliances of the others", () => {
    const ana = linkOf(MEMBER_ANA, "145563254785", NML);
    const cal = linkOf(MEMBER_CAL, "147744374785", ABC);

    const steps = planSync([ana, cal], [MEMBER_CAL]);

    expect(steps[0]).toEqual({ kind: "roster", alliance: ABC, links: [cal] });
  });

  test("puts a left-over Member in no Alliance first, ahead of the rosters and the other uid lookups", () => {
    const ana = linkOf(MEMBER_ANA, "145563254785", undefined);
    const ben = linkOf(MEMBER_BEN, "93159425", undefined);
    const cal = linkOf(MEMBER_CAL, "147744374785", NML);

    const steps = planSync([ana, ben, cal], [MEMBER_BEN]);

    expect(steps[0]).toEqual({ kind: "uid", link: ben });
    expect(steps).toHaveLength(3);
  });

  test("puts a left-over Member in no Alliance ahead of a Member whose Alliance comes first in the Links", () => {
    const ana = linkOf(MEMBER_ANA, "145563254785", NML);
    const ben = linkOf(MEMBER_BEN, "93159425", ABC);
    const cal = linkOf(MEMBER_CAL, "147744374785", undefined);

    const steps = planSync([ana, ben, cal], [MEMBER_CAL]);

    expect(steps[0]).toEqual({ kind: "uid", link: cal });
  });
});

describe("playerFromRoster", () => {
  test("builds the Player of a roster row in its Alliance, with the Kingdom, sanctuary level and rank the row gives", () => {
    const alliance: Alliance = {
      tag: "NML",
      name: "No Man's Land",
      kingdom: kingdomOf(330),
      power: 208_815_434,
      memberCount: 52,
      capacity: 100,
      leaderName: "DrLOL",
      roster: [],
    };
    const entry: RosterEntry = {
      uid: uidOf("145563254785"),
      name: "DrLOL",
      allianceRank: "R5",
      kingdom: kingdomOf(330),
      sanctuaryLevel: 27,
      weeklyActivity: undefined,
      dailyHonor: undefined,
      dailyTech: undefined,
      online: undefined,
      lastOnlineAt: undefined,
    };

    const player = playerFromRoster(alliance, entry);

    expect(player).toMatchObject({
      uid: uidOf("145563254785"),
      name: "DrLOL",
      kingdom: kingdomOf(330),
      sanctuaryLevel: 27,
      allianceRank: "R5",
      alliance: { tag: "NML", name: "No Man's Land" },
    });
  });
});

describe("rankAfterSync", () => {
  test.each<[string, RankOnLink]>([
    ["an unknown rank", UNKNOWN_RANK],
    ["an approved rank", approvedRank("R3")],
    ["a rank the Game API gave before", gameApiRank("R3")],
  ])("replaces %s with the rank the Game API now gives", (_label, before) => {
    const now = allied({ name: "etranger", kingdom: 1, sanctuaryLevel: 22, tag: "NML", rank: "R4" });

    expect(rankAfterSync(before, NML, now)).toEqual(gameApiRank("R4"));
  });

  test("keeps an approved rank while the Player stays in that Alliance and the Game API still gives no rank", () => {
    const now = allied({ name: "etranger", kingdom: 1, sanctuaryLevel: 22, tag: "NML", rank: "unknown" });

    expect(rankAfterSync(approvedRank("R3"), NML, now)).toEqual(approvedRank("R3"));
  });

  test("keeps an approved rank when the Alliance last applied is unrecorded and the Game API gives no rank", () => {
    const now = allied({ name: "etranger", kingdom: 1, sanctuaryLevel: 22, tag: "NML", rank: "unknown" });

    expect(rankAfterSync(approvedRank("R3"), "unrecorded", now)).toEqual(approvedRank("R3"));
  });

  test("drops an approved rank when the Player moved to another Alliance where the rank is unknown", () => {
    const now = allied({ name: "etranger", kingdom: 1, sanctuaryLevel: 22, tag: "ABC", rank: "unknown" });

    expect(rankAfterSync(approvedRank("R3"), NML, now)).toEqual(UNKNOWN_RANK);
  });

  test("drops an approved rank when the Alliance has the same tag but is in another Kingdom", () => {
    const now = allied({ name: "etranger", kingdom: 2, sanctuaryLevel: 22, tag: "NML", rank: "unknown" });

    expect(rankAfterSync(approvedRank("R3"), NML, now)).toEqual(UNKNOWN_RANK);
  });

  test("gives no rank to a Player who is in no Alliance any more, whatever the Link carried", () => {
    const now = unallied("etranger", 1, 22);

    expect(rankAfterSync(approvedRank("R3"), NML, now)).toEqual(NO_ALLIANCE);
  });

  test("drops a rank the Game API gave before and no longer gives, in the same Alliance", () => {
    const now = allied({ name: "etranger", kingdom: 1, sanctuaryLevel: 22, tag: "NML", rank: "unknown" });

    expect(rankAfterSync(gameApiRank("R3"), NML, now)).toEqual(UNKNOWN_RANK);
  });

  test("gives an unknown rank to a Player who joins an Alliance from none, when the Game API gives no rank", () => {
    const now = allied({ name: "etranger", kingdom: 1, sanctuaryLevel: 22, tag: "ABC", rank: "unknown" });

    expect(rankAfterSync(NO_ALLIANCE, undefined, now)).toEqual(UNKNOWN_RANK);
  });
});

describe("isDue", () => {
  const yesterday = utcDayOf(new Date("2026-11-01T12:00:00Z"));
  const today = utcDayOf(new Date("2026-11-02T12:00:00Z"));

  test("is false before the hour today, when today's run has not happened", () => {
    expect(isDue(yesterday, new Date("2026-11-02T02:59:59Z"), 3)).toBe(false);
  });

  test("is true at the hour today, when today's run has not happened", () => {
    expect(isDue(yesterday, new Date("2026-11-02T03:00:00Z"), 3)).toBe(true);
  });

  test("is true after the hour when no run is recorded at all", () => {
    expect(isDue(undefined, new Date("2026-11-02T10:00:00Z"), 3)).toBe(true);
  });

  test("is false after the hour once today's run is recorded, so it does not run twice a day", () => {
    expect(isDue(today, new Date("2026-11-02T23:00:00Z"), 3)).toBe(false);
  });

  test("is true after a missed hour, when a restart comes after it and today's run is not recorded", () => {
    expect(isDue(yesterday, new Date("2026-11-02T14:00:00Z"), 3)).toBe(true);
  });

  test("an hour of 0 is due from midnight UTC", () => {
    expect(isDue(yesterday, new Date("2026-11-02T00:00:00Z"), 0)).toBe(true);
  });
});
