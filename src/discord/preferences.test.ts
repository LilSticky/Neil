import { describe, expect, test, vi } from "vitest";
import type { RankOnLink } from "../domain/link.js";
import { EMPTY_PREFERENCES, type GameLanguageCode, type Preferences } from "../domain/preferences.js";
import type { MemberId } from "../domain/rank-approval.js";
import { FakePreferenceStore } from "./__fakes__/preference-store.js";
import { FakeRolesGuild, type FakeRolesMember } from "./__fakes__/roles-guild.js";
import { FakeServerMembers } from "./__fakes__/server-members.js";
import { createPreferenceRoles } from "./preferences.js";

const OWNER = "900000000000000001";
const ALICE: MemberId = "111111111111111111";
const BOB: MemberId = "222222222222222222";
/** The Administrator permission bit: a role with it is refused. */
const ADMINISTRATOR = 8n;
const APPROVER: MemberId = "555555555555555555";
const NOW = new Date("2026-11-04T10:00:00Z");

const R3: RankOnLink = { source: "game-api", rank: "R3" };
const R4: RankOnLink = { source: "game-api", rank: "R4" };
const R5: RankOnLink = { source: "game-api", rank: "R5" };

/** Preferences with the given changes on top of nothing chosen. */
function preferencesWith(changes: Partial<Preferences>): Preferences {
  return { ...EMPTY_PREFERENCES, ...changes };
}

function languages(...codes: GameLanguageCode[]): ReadonlySet<GameLanguageCode> {
  return new Set<GameLanguageCode>(codes);
}

/** The names of the roles a member holds, sorted. */
function heldNames(member: FakeRolesMember): string[] {
  return member.roles.map((role) => role.name).sort();
}

function setUp() {
  const guild = new FakeRolesGuild(OWNER);
  const members = new FakeServerMembers();
  const preferences = new FakePreferenceStore();
  const logError = vi.fn<(line: string) => void>();
  const service = createPreferenceRoles({ members, preferences, logError });
  /** Puts a Member on the server, holding the given roles, as the discord.js adapter would find them. */
  const join = (memberId: MemberId, roles: readonly string[] = []): FakeRolesMember => {
    const member = guild.member(memberId, roles);
    members.join(memberId, guild, member);
    return member;
  };
  return { guild, members, preferences, logError, service, join };
}

describe("apply", () => {
  test("gives the Preference Roles the Member's Preferences and rank want", async () => {
    const { guild, preferences, service, join } = setUp();
    guild.defineRole("English");
    guild.defineRole("Americas");
    const alice = join(ALICE);
    preferences.set(ALICE, preferencesWith({ languages: languages("en"), region: "americas" }));

    await service.apply(ALICE, R3);

    expect(heldNames(alice)).toEqual(["Americas", "English"]);
  });

  test("creates a missing Preference Role without permissions", async () => {
    const { guild, preferences, service, join } = setUp();
    join(ALICE);
    preferences.set(ALICE, preferencesWith({ languages: languages("en") }));

    await service.apply(ALICE, R3);

    expect(guild.createdRoleNames()).toEqual(["English"]);
    expect(guild.createdOptions[0]?.permissions).toBe(0n);
  });

  test("takes off a Preference Role the Member no longer wants and leaves the other roles alone", async () => {
    const { guild, preferences, service, join } = setUp();
    guild.defineRole("English");
    guild.defineRole("French");
    guild.defineRole("Onboarding");
    const alice = join(ALICE, ["French", "Onboarding"]);
    preferences.set(ALICE, preferencesWith({ languages: languages("en") }));

    await service.apply(ALICE, R3);

    expect(heldNames(alice)).toEqual(["English", "Onboarding"]);
  });

  test("gives NaP discussions to an R5 who chose nothing", async () => {
    const { guild, service, join } = setUp();
    guild.defineRole("NaP discussions");
    const alice = join(ALICE);

    await service.apply(ALICE, R5);

    expect(heldNames(alice)).toEqual(["NaP discussions"]);
  });

  test("gives NaP discussions to an R4 who chose it", async () => {
    const { guild, preferences, service, join } = setUp();
    guild.defineRole("NaP discussions");
    const alice = join(ALICE);
    preferences.set(ALICE, preferencesWith({ interests: new Set(["nap"]) }));

    await service.apply(ALICE, R4);

    expect(heldNames(alice)).toEqual(["NaP discussions"]);
  });

  test("takes NaP discussions off an R4 who chose it and became R3", async () => {
    const { guild, preferences, service, join } = setUp();
    guild.defineRole("NaP discussions");
    const alice = join(ALICE, ["NaP discussions"]);
    preferences.set(ALICE, preferencesWith({ interests: new Set(["nap"]) }));

    await service.apply(ALICE, R3);

    expect(heldNames(alice)).toEqual([]);
  });

  test("reads the rank a Rank Approval recorded: an approved R5 is given NaP discussions", async () => {
    const { guild, service, join } = setUp();
    guild.defineRole("NaP discussions");
    const alice = join(ALICE);
    const approved: RankOnLink = { source: "rank-approval", rank: "R5", approvedBy: APPROVER, approvedAt: NOW };

    await service.apply(ALICE, approved);

    expect(heldNames(alice)).toEqual(["NaP discussions"]);
  });

  test("changes nothing for a Member who is not on the server", async () => {
    const { guild, preferences, logError, service } = setUp();
    preferences.set(BOB, preferencesWith({ languages: languages("en") }));

    await expect(service.apply(BOB, R5)).resolves.toBeUndefined();

    expect(guild.createdRoleNames()).toEqual([]);
    expect(logError).not.toHaveBeenCalled();
  });

  test("logs a skipped Preference Role with the Member and the role, and still gives the other roles", async () => {
    const { guild, preferences, logError, service, join } = setUp();
    guild.defineRole("English", { permissions: ADMINISTRATOR });
    guild.defineRole("Americas");
    const alice = join(ALICE);
    preferences.set(ALICE, preferencesWith({ languages: languages("en"), region: "americas" }));

    await expect(service.apply(ALICE, R3)).resolves.toBeUndefined();

    expect(heldNames(alice)).toEqual(["Americas"]);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining(ALICE));
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("English"));
  });

  test("logs a failure to reach the server and does not throw", async () => {
    const { members, logError, service } = setUp();
    members.failWith(new Error("socket hang up"));

    await expect(service.apply(ALICE, R5)).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining(ALICE));
  });
});

describe("forget", () => {
  test("takes every Preference Role off a Member on the server, keeps the other roles, and deletes the Preferences", async () => {
    const { guild, preferences, service, join } = setUp();
    guild.defineRole("English");
    guild.defineRole("Americas");
    guild.defineRole("Onboarding");
    const alice = join(ALICE, ["English", "Americas", "Onboarding"]);
    preferences.set(ALICE, preferencesWith({ languages: languages("en"), region: "americas" }));

    await service.forget(ALICE);

    expect(heldNames(alice)).toEqual(["Onboarding"]);
    expect(preferences.forgotten).toEqual([ALICE]);
  });

  test("deletes the Preferences of a Member who is not on the server, and does not throw", async () => {
    const { preferences, logError, service } = setUp();

    await expect(service.forget(BOB)).resolves.toBeUndefined();

    expect(preferences.forgotten).toEqual([BOB]);
    expect(logError).not.toHaveBeenCalled();
  });

  test("deletes the Preferences even when the server cannot be reached, and logs the failure", async () => {
    const { members, preferences, logError, service } = setUp();
    members.failFor(ALICE, new Error("socket hang up"));

    await expect(service.forget(ALICE)).resolves.toBeUndefined();

    expect(preferences.forgotten).toEqual([ALICE]);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining(ALICE));
  });
});
