import { describe, expect, test } from "vitest";
import { allianceMembersOf, holdersOfRole, leadersOf, type RaidMember } from "./raid-server.js";

const WAR_COUNCIL = "900000000000000000";

function member(id: string, ...names: string[]): RaidMember {
  return { id, roles: names.map((name) => ({ id: name === "War Council" ? WAR_COUNCIL : `role-${name}`, name })) };
}

const MEMBERS: RaidMember[] = [
  member("1", "[NML]", "R5"),
  member("2", "[NML]", "R4"),
  member("3", "[NML]", "R3"),
  member("4", "[ABC]", "R5", "War Council"),
  member("5", "R5"),
  member("6", "War Council"),
];

describe("the Raid's mentions", () => {
  test("the leaders of Alliances are the holders of their Alliance role and R5 or R4", () => {
    expect(leadersOf(MEMBERS, ["NML", "ABC"])).toEqual(["1", "2", "4"]);
    expect(leadersOf(MEMBERS, ["NML"])).toEqual(["1", "2"]);
  });

  test("the War Council are the holders of its role, by id", () => {
    expect(holdersOfRole(MEMBERS, WAR_COUNCIL)).toEqual(["4", "6"]);
  });

  test("an Alliance's Members are the holders of its role", () => {
    expect(allianceMembersOf(MEMBERS, "NML")).toEqual(["1", "2", "3"]);
  });
});
