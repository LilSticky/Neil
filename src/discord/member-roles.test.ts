import { describe, expect, test } from "vitest";
import { applyNameAndRoles } from "./member-roles.js";
import {
  FakeDiscordError,
  FakeRolesGuild,
  type FakeRolesMember,
  MAXIMUM_ROLES_REACHED,
  MISSING_PERMISSIONS,
} from "./__fakes__/roles-guild.js";

const OWNER = "900000000000000001";
const ALICE = "111111111111111111";
const BOB = "222222222222222222";
/** The Administrator permission bit: a role with it is refused. */
const ADMINISTRATOR = 8n;

/** The names of the roles a member holds, sorted. */
function heldNames(member: FakeRolesMember): string[] {
  return member.roles.map((role) => role.name).sort();
}

describe("applyNameAndRoles", () => {
  test("sets the nickname and reports it as set", async () => {
    const guild = new FakeRolesGuild(OWNER);
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, {
      nickname: "[NML] Rogue",
      roles: [],
      managedTags: ["NML"],
    });

    expect(report.nickname).toBe("set");
    expect(alice.nickname).toBe("[NML] Rogue");
  });

  test("adds a wanted role the Member does not hold and reports it as added", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("NML");
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, {
      nickname: "[NML] Rogue",
      roles: ["NML"],
      managedTags: ["NML"],
    });

    expect(report.added).toEqual(["NML"]);
    expect(report.created).toEqual([]);
    expect(report.removed).toEqual([]);
    expect(heldNames(alice)).toEqual(["NML"]);
  });

  test("finds an existing role by its exact name and creates nothing", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("R4");
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML|R4] Rogue", roles: ["R4"], managedTags: [] });

    expect(report.created).toEqual([]);
    expect(guild.createdRoleNames()).toEqual([]);
    expect(guild.rolesNamed("R4")).toHaveLength(1);
    expect(heldNames(alice)).toEqual(["R4"]);
  });

  test("does not take a role whose name differs only in letter case", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("r5");
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML|R5] Rogue", roles: ["R5"], managedTags: [] });

    expect(report.created).toEqual(["R5"]);
    expect(guild.createdRoleNames()).toEqual(["R5"]);
    expect(heldNames(alice)).toEqual(["R5"]);
  });

  test("creates a missing role with no permissions, not hoisted and not mentionable, and reports it as created", async () => {
    const guild = new FakeRolesGuild(OWNER);
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["T1"], managedTags: [] });

    expect(guild.createdOptions).toEqual([{ name: "T1", permissions: 0n, hoist: false, mentionable: false }]);
    expect(report.created).toEqual(["T1"]);
    expect(report.added).toEqual(["T1"]);
    expect(heldNames(alice)).toEqual(["T1"]);
  });

  test("creates a role missing for two concurrent applies only once", async () => {
    const guild = new FakeRolesGuild(OWNER);
    const alice = guild.member(ALICE);
    const bob = guild.member(BOB);

    await Promise.all([
      applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["T1"], managedTags: [] }),
      applyNameAndRoles(guild, bob, { nickname: "[NML] Bob", roles: ["T1"], managedTags: [] }),
    ]);

    expect(guild.createdRoleNames()).toEqual(["T1"]);
    expect(guild.rolesNamed("T1")).toHaveLength(1);
    expect(heldNames(alice)).toEqual(["T1"]);
    expect(heldNames(bob)).toEqual(["T1"]);
  });

  test("refuses an existing role that grants permissions and does not give it to the Member", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("NML", { permissions: ADMINISTRATOR });
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["NML"], managedTags: ["NML"] });

    expect(report.added).toEqual([]);
    expect(report.skipped).toEqual([{ what: "NML", reason: "has-permissions" }]);
    expect(heldNames(alice)).toEqual([]);
  });

  test("adds a new Managed Role and removes the one it replaces", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("R3");
    guild.defineRole("R4");
    const alice = guild.member(ALICE, ["R3"]);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML|R4] Rogue", roles: ["R4"], managedTags: [] });

    expect(report.added).toEqual(["R4"]);
    expect(report.removed).toEqual(["R3"]);
    expect(heldNames(alice)).toEqual(["R4"]);
  });

  test("never removes a role that is not a Managed Role", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("R3");
    guild.defineRole("Scout");
    guild.defineRole("Officer", { permissions: ADMINISTRATOR, position: 5 });
    const alice = guild.member(ALICE, ["R3", "Scout", "Officer"]);

    const report = await applyNameAndRoles(guild, alice, { nickname: "Rogue", roles: [], managedTags: [] });

    expect(report.removed).toEqual(["R3"]);
    expect(heldNames(alice)).toEqual(["Officer", "Scout"]);
  });

  test("keeps an Alliance tag it does not manage, even when the Member holds it", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("NML");
    guild.defineRole("OTHER");
    const alice = guild.member(ALICE, ["NML", "OTHER"]);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["NML"], managedTags: ["NML"] });

    expect(report.removed).toEqual([]);
    expect(heldNames(alice)).toEqual(["NML", "OTHER"]);
  });

  test("removes a held Alliance tag that is a managed tag and no longer wanted", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("NML");
    guild.defineRole("OLD");
    const alice = guild.member(ALICE, ["NML", "OLD"]);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["NML"], managedTags: ["NML", "OLD"] });

    expect(report.removed).toEqual(["OLD"]);
    expect(heldNames(alice)).toEqual(["NML"]);
  });

  test("skips the nickname of the guild owner and still applies the roles", async () => {
    const guild = new FakeRolesGuild(ALICE);
    guild.defineRole("NML");
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["NML"], managedTags: ["NML"] });

    expect(report.nickname).toBe("skipped");
    expect(alice.nickname).toBeUndefined();
    expect(report.skipped).toEqual([{ what: "nickname", reason: "owner" }]);
    expect(heldNames(alice)).toEqual(["NML"]);
  });

  test("skips a role above the bot's highest role with reason hierarchy", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("T9", { position: 12 });
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["T9"], managedTags: [] });

    expect(report.added).toEqual([]);
    expect(report.skipped).toEqual([{ what: "T9", reason: "hierarchy" }]);
    expect(heldNames(alice)).toEqual([]);
  });

  test("skips a role Discord refuses with 50013 and still applies the other roles", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("NML");
    guild.defineRole("R4");
    guild.failAdding("NML", new FakeDiscordError(MISSING_PERMISSIONS, "Missing Permissions"));
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML|R4] Rogue", roles: ["NML", "R4"], managedTags: ["NML"] });

    expect(report.skipped).toEqual([{ what: "NML", reason: "missing-permissions" }]);
    expect(report.added).toEqual(["R4"]);
    expect(heldNames(alice)).toEqual(["R4"]);
  });

  test("skips the nickname Discord refuses with 50013 and still applies the roles", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("NML");
    guild.failNickname(new FakeDiscordError(MISSING_PERMISSIONS, "Missing Permissions"));
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["NML"], managedTags: ["NML"] });

    expect(report.nickname).toBe("skipped");
    expect(report.skipped).toEqual([{ what: "nickname", reason: "missing-permissions" }]);
    expect(heldNames(alice)).toEqual(["NML"]);
  });

  test("skips a role whose creation Discord refuses at the role limit, and reports it as an error", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.failCreating("T1", new FakeDiscordError(MAXIMUM_ROLES_REACHED, "Maximum number of guild roles reached"));
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["T1"], managedTags: [] });

    expect(report.created).toEqual([]);
    expect(report.skipped).toEqual([{ what: "T1", reason: "error" }]);
    expect(heldNames(alice)).toEqual([]);
  });

  test("never throws: an unexpected failure becomes a skipped entry", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("NML");
    guild.defineRole("R4");
    guild.failAdding("NML", new Error("socket hang up"));
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML|R4] Rogue", roles: ["NML", "R4"], managedTags: ["NML"] });

    expect(report.skipped).toEqual([{ what: "NML", reason: "error" }]);
    expect(heldNames(alice)).toEqual(["R4"]);
  });
});
