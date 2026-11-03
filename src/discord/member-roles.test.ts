import { describe, expect, test } from "vitest";
import { applyNameAndRoles, type RolesGuild } from "./member-roles.js";
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

/** A second object for the same guild, as the discord.js adapter makes for each call. */
function viewOf(guild: FakeRolesGuild): RolesGuild {
  return {
    id: guild.id,
    ownerId: guild.ownerId,
    botTopRolePosition: guild.botTopRolePosition,
    get roles() {
      return guild.roles;
    },
    createRole: (options) => guild.createRole(options),
  };
}

describe("applyNameAndRoles", () => {
  test("sets the nickname and reports it as set", async () => {
    const guild = new FakeRolesGuild(OWNER);
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, {
      nickname: "[NML] Rogue",
      roles: [],
      managedTags: ["NML"], officerRoleIds: [],
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
      managedTags: ["NML"], officerRoleIds: [],
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

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML|R4] Rogue", roles: ["R4"], managedTags: [], officerRoleIds: [] });

    expect(report.created).toEqual([]);
    expect(guild.createdRoleNames()).toEqual([]);
    expect(guild.rolesNamed("R4")).toHaveLength(1);
    expect(heldNames(alice)).toEqual(["R4"]);
  });

  test("does not take a role whose name differs only in letter case", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("r5");
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML|R5] Rogue", roles: ["R5"], managedTags: [], officerRoleIds: [] });

    expect(report.created).toEqual(["R5"]);
    expect(guild.createdRoleNames()).toEqual(["R5"]);
    expect(heldNames(alice)).toEqual(["R5"]);
  });

  test("creates a missing role with no permissions, not hoisted and not mentionable, and reports it as created", async () => {
    const guild = new FakeRolesGuild(OWNER);
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["T1"], managedTags: [], officerRoleIds: [] });

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
      applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["T1"], managedTags: [], officerRoleIds: [] }),
      applyNameAndRoles(guild, bob, { nickname: "[NML] Bob", roles: ["T1"], managedTags: [], officerRoleIds: [] }),
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

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["NML"], managedTags: ["NML"], officerRoleIds: [] });

    expect(report.added).toEqual([]);
    expect(report.skipped).toEqual([{ what: "NML", reason: "has-permissions" }]);
    expect(heldNames(alice)).toEqual([]);
  });

  test("adds a new Managed Role and removes the one it replaces", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("R3");
    guild.defineRole("R4");
    const alice = guild.member(ALICE, ["R3"]);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML|R4] Rogue", roles: ["R4"], managedTags: [], officerRoleIds: [] });

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

    const report = await applyNameAndRoles(guild, alice, { nickname: "Rogue", roles: [], managedTags: [], officerRoleIds: [] });

    expect(report.removed).toEqual(["R3"]);
    expect(heldNames(alice)).toEqual(["Officer", "Scout"]);
  });

  test("keeps an Alliance tag it does not manage, even when the Member holds it", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("NML");
    guild.defineRole("OTHER");
    const alice = guild.member(ALICE, ["NML", "OTHER"]);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["NML"], managedTags: ["NML"], officerRoleIds: [] });

    expect(report.removed).toEqual([]);
    expect(heldNames(alice)).toEqual(["NML", "OTHER"]);
  });

  test("removes a held Alliance tag that is a managed tag and no longer wanted", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("NML");
    guild.defineRole("OLD");
    const alice = guild.member(ALICE, ["NML", "OLD"]);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["NML"], managedTags: ["NML", "OLD"], officerRoleIds: [] });

    expect(report.removed).toEqual(["OLD"]);
    expect(heldNames(alice)).toEqual(["NML"]);
  });

  test("skips the nickname of the guild owner and still applies the roles", async () => {
    const guild = new FakeRolesGuild(ALICE);
    guild.defineRole("NML");
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["NML"], managedTags: ["NML"], officerRoleIds: [] });

    expect(report.nickname).toBe("skipped");
    expect(alice.nickname).toBeUndefined();
    expect(report.skipped).toEqual([{ what: "nickname", reason: "owner" }]);
    expect(heldNames(alice)).toEqual(["NML"]);
  });

  test("skips a role above the bot's highest role with reason hierarchy", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("T9", { position: 12 });
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["T9"], managedTags: [], officerRoleIds: [] });

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

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML|R4] Rogue", roles: ["NML", "R4"], managedTags: ["NML"], officerRoleIds: [] });

    expect(report.skipped).toEqual([{ what: "NML", reason: "missing-permissions" }]);
    expect(report.added).toEqual(["R4"]);
    expect(heldNames(alice)).toEqual(["R4"]);
  });

  test("skips the nickname Discord refuses with 50013 and still applies the roles", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("NML");
    guild.failNickname(new FakeDiscordError(MISSING_PERMISSIONS, "Missing Permissions"));
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["NML"], managedTags: ["NML"], officerRoleIds: [] });

    expect(report.nickname).toBe("skipped");
    expect(report.skipped).toEqual([{ what: "nickname", reason: "missing-permissions" }]);
    expect(heldNames(alice)).toEqual(["NML"]);
  });

  test("skips a role whose creation Discord refuses at the role limit, and reports it as an error", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.failCreating("T1", new FakeDiscordError(MAXIMUM_ROLES_REACHED, "Maximum number of guild roles reached"));
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML] Rogue", roles: ["T1"], managedTags: [], officerRoleIds: [] });

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

    const report = await applyNameAndRoles(guild, alice, { nickname: "[NML|R4] Rogue", roles: ["NML", "R4"], managedTags: ["NML"], officerRoleIds: [] });

    expect(report.skipped).toEqual([{ what: "NML", reason: "error" }]);
    expect(heldNames(alice)).toEqual(["R4"]);
  });

  test("creates a role missing for two applies that hold separate objects of one guild only once", async () => {
    const guild = new FakeRolesGuild(OWNER);
    const alice = guild.member(ALICE);
    const bob = guild.member(BOB);

    await Promise.all([
      applyNameAndRoles(viewOf(guild), alice, { nickname: "[NML] Rogue", roles: ["T1"], managedTags: [], officerRoleIds: [] }),
      applyNameAndRoles(viewOf(guild), bob, { nickname: "[NML] Bob", roles: ["T1"], managedTags: [], officerRoleIds: [] }),
    ]);

    expect(guild.createdRoleNames()).toEqual(["T1"]);
    expect(heldNames(alice)).toEqual(["T1"]);
    expect(heldNames(bob)).toEqual(["T1"]);
  });

  test("never removes a held role of a Managed Role name that grants permissions", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("R3", { permissions: ADMINISTRATOR });
    const alice = guild.member(ALICE, ["R3"]);

    const report = await applyNameAndRoles(guild, alice, { nickname: "Rogue", roles: [], managedTags: [], officerRoleIds: [] });

    expect(report.removed).toEqual([]);
    expect(heldNames(alice)).toEqual(["R3"]);
  });

  test("never removes an Officer role, even when an Alliance tag of its name was applied before", async () => {
    const guild = new FakeRolesGuild(OWNER);
    const king = guild.defineRole("King");
    const alice = guild.member(ALICE, ["King"]);

    const report = await applyNameAndRoles(guild, alice, {
      nickname: "Rogue",
      roles: [],
      managedTags: ["King"],
      officerRoleIds: [king.id],
    });

    expect(report.removed).toEqual([]);
    expect(heldNames(alice)).toEqual(["King"]);
  });

  test("never gives an Alliance tag that resolves to an Officer role, and skips it as not a Managed Role", async () => {
    const guild = new FakeRolesGuild(OWNER);
    const king = guild.defineRole("King");
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, {
      nickname: "[King] Rogue",
      roles: ["King"],
      managedTags: ["King"],
      officerRoleIds: [king.id],
    });

    expect(report.added).toEqual([]);
    expect(report.skipped).toEqual([{ what: "King", reason: "not-managed" }]);
    expect(heldNames(alice)).toEqual([]);
  });

  test("never gives an Alliance tag that resolves to the @everyone role, and skips it as not a Managed Role", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("NML", { id: guild.id });
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, {
      nickname: "[NML] Rogue",
      roles: ["NML"],
      managedTags: ["NML"],
      officerRoleIds: [],
    });

    expect(report.added).toEqual([]);
    expect(report.skipped).toEqual([{ what: "NML", reason: "not-managed" }]);
    expect(heldNames(alice)).toEqual([]);
  });

  test("never gives an Alliance tag that resolves to an integration role, and skips it as not a Managed Role", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("NML", { managed: true });
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, {
      nickname: "[NML] Rogue",
      roles: ["NML"],
      managedTags: ["NML"],
      officerRoleIds: [],
    });

    expect(report.added).toEqual([]);
    expect(report.skipped).toEqual([{ what: "NML", reason: "not-managed" }]);
    expect(heldNames(alice)).toEqual([]);
  });

  test("gives the permission-free role when two roles share a wanted name, even if one with permissions comes first", async () => {
    const guild = new FakeRolesGuild(OWNER);
    guild.defineRole("NML", { permissions: ADMINISTRATOR });
    const free = guild.defineRole("NML");
    const alice = guild.member(ALICE);

    const report = await applyNameAndRoles(guild, alice, {
      nickname: "[NML] Rogue",
      roles: ["NML"],
      managedTags: ["NML"],
      officerRoleIds: [],
    });

    expect(report.skipped).toEqual([]);
    expect(report.added).toEqual(["NML"]);
    expect(alice.roles.map((role) => role.id)).toEqual([free.id]);
  });

  test("removes the lower of two held roles of one Managed Role name when the higher is out of reach, and skips the higher once", async () => {
    const guild = new FakeRolesGuild(OWNER);
    const high = guild.defineRole("R3", { position: 12 });
    const low = guild.defineRole("R3", { position: 1 });
    const alice = guild.member(ALICE, [high, low]);

    const report = await applyNameAndRoles(guild, alice, { nickname: "Rogue", roles: [], managedTags: [], officerRoleIds: [] });

    expect(alice.roles.map((role) => role.id)).toEqual([high.id]);
    expect(report.skipped).toEqual([{ what: "R3", reason: "hierarchy" }]);
  });
});
