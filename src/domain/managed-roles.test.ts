import { describe, expect, test } from "vitest";
import { allianceRoleName, tagOfAllianceRole, isManagedRoleName, planApply, rolesFor } from "./managed-roles.js";
import {
  allied,
  approvedRank,
  gameApiRank,
  kingdomOf,
  NO_ALLIANCE,
  UNKNOWN_RANK,
  unallied,
} from "./__fixtures__/players.js";

const HOME_KINGDOM = kingdomOf(330);
/** The default Troop Bracket table: first levels of T1…T10. */
const LEVELS = [1, 3, 6, 10, 14, 17, 20, 24, 27, 30] as const;

describe("rolesFor", () => {
  test("gives the Alliance, Alliance Rank, Kingdom and Troop Bracket roles to a Home Kingdom Player", () => {
    const player = allied({ name: "Rogue", kingdom: 330, sanctuaryLevel: 21, tag: "NML", rank: "R4" });

    expect(rolesFor(player, gameApiRank("R4"), HOME_KINGDOM, LEVELS)).toEqual(["[NML]", "R4", "#330", "T7"]);
  });

  test("gives the Alliance Rank from a Rank Approval", () => {
    const player = allied({ name: "Rogue", kingdom: 330, sanctuaryLevel: 6, tag: "NML", rank: "unknown" });

    expect(rolesFor(player, approvedRank("R3"), HOME_KINGDOM, LEVELS)).toEqual(["[NML]", "R3", "#330", "T3"]);
  });

  test("gives no Alliance Rank role while the rank is unknown", () => {
    const player = allied({ name: "Rogue", kingdom: 330, sanctuaryLevel: 21, tag: "NML", rank: "unknown" });

    expect(rolesFor(player, UNKNOWN_RANK, HOME_KINGDOM, LEVELS)).toEqual(["[NML]", "#330", "T7"]);
  });

  test("gives the Kingdom and Troop Bracket roles only to a Player in no Alliance", () => {
    const player = unallied("Rogue", 330, 21);

    expect(rolesFor(player, NO_ALLIANCE, HOME_KINGDOM, LEVELS)).toEqual(["#330", "T7"]);
  });

  test("gives a Guest the Kingdom and Troop Bracket roles, but no Alliance or Alliance Rank role", () => {
    const player = allied({ name: "Rogue", kingdom: 331, sanctuaryLevel: 21, tag: "ABC", rank: "R5" });

    expect(rolesFor(player, gameApiRank("R5"), HOME_KINGDOM, LEVELS)).toEqual(["#331", "T7"]);
  });

  test("gives no Troop Bracket role for sanctuary level 0", () => {
    const player = unallied("Rogue", 331, 0);

    expect(rolesFor(player, NO_ALLIANCE, HOME_KINGDOM, LEVELS)).toEqual(["#331"]);
  });
});

describe("isManagedRoleName", () => {
  test.each(["R1", "R2", "R3", "R4", "R5"])("recognises the Alliance Rank role %s", (name) => {
    expect(isManagedRoleName(name, [])).toBe(true);
  });

  test.each(["R0", "R6", "R10"])("does not recognise %s as an Alliance Rank role", (name) => {
    expect(isManagedRoleName(name, [])).toBe(false);
  });

  test("recognises the Kingdom role #330", () => {
    expect(isManagedRoleName("#330", [])).toBe(true);
  });

  test.each(["#", "#abc", "330", "#330 "])("does not recognise %j as a Kingdom role", (name) => {
    expect(isManagedRoleName(name, [])).toBe(false);
  });

  test.each(["T1", "T7", "T10"])("recognises the Troop Bracket role %s", (name) => {
    expect(isManagedRoleName(name, [])).toBe(true);
  });

  test.each(["T0", "T11", "t1"])("does not recognise %s as a Troop Bracket role", (name) => {
    expect(isManagedRoleName(name, [])).toBe(false);
  });

  test("recognises an Alliance role whose tag is in the given tags", () => {
    expect(isManagedRoleName("NML", ["NML", "ABC"])).toBe(true);
  });

  test("does not recognise a tag that is not in the given tags", () => {
    expect(isManagedRoleName("NML", ["ABC"])).toBe(false);
  });

  test("recognises the bracketed Alliance role [NML] when the given tags hold NML", () => {
    expect(isManagedRoleName("[NML]", ["NML", "ABC"])).toBe(true);
  });

  test("does not recognise the bracketed Alliance role [NML] when the given tags do not hold NML", () => {
    expect(isManagedRoleName("[NML]", ["ABC"])).toBe(false);
  });

  test("does not recognise a role that is not a convention name", () => {
    expect(isManagedRoleName("Moderator", ["NML"])).toBe(false);
  });
});

describe("allianceRoleName", () => {
  test("gives the Alliance tag in square brackets, the name of the Alliance role", () => {
    expect(allianceRoleName("NML")).toBe("[NML]");
    expect(tagOfAllianceRole("[NML]")).toBe("NML");
    expect(tagOfAllianceRole("R4")).toBeUndefined();
  });
});

describe("planApply", () => {
  test("adds the wanted roles the Member lacks and removes the held Managed Roles that no longer fit", () => {
    const plan = planApply(["R3", "T2", "#330"], ["[NML]", "R4", "#330", "T7"]);

    expect(plan).toEqual({ add: ["[NML]", "R4", "T7"], remove: ["R3", "T2"] });
  });

  test("changes nothing when the Member already holds exactly the wanted roles", () => {
    const plan = planApply(["[NML]", "R4", "#330", "T7"], ["[NML]", "R4", "#330", "T7"]);

    expect(plan).toEqual({ add: [], remove: [] });
  });

  test("adds every wanted role when the Member holds no Managed Roles", () => {
    const plan = planApply([], ["#331", "T7"]);

    expect(plan).toEqual({ add: ["#331", "T7"], remove: [] });
  });
});
