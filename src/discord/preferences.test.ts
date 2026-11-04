import { describe, expect, test, vi } from "vitest";
import type { RankOnLink } from "../domain/link.js";
import { EMPTY_PREFERENCES, type GameLanguageCode, type Preferences } from "../domain/preferences.js";
import type { MemberId } from "../domain/rank-approval.js";
import { FakeLinkStore } from "./__fakes__/link-store.js";
import { FakePreferenceStore } from "./__fakes__/preference-store.js";
import { FakeRolesGuild, type FakeRolesMember } from "./__fakes__/roles-guild.js";
import { FakeServerMembers } from "./__fakes__/server-members.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import { createPreferenceRoles } from "./preferences.js";

const OWNER = "900000000000000001";
const ALICE: MemberId = "111111111111111111";
const BOB: MemberId = "222222222222222222";
const APPROVER: MemberId = "555555555555555555";
const ALICE_THREAD = "333333333333333301";
/** The Officer role of the Moderators, as the configuration gives it. */
const OFFICER_ROLE_ID = "700000000000000001";
/** The Administrator permission bit: a role with it is refused. */
const ADMINISTRATOR = 8n;
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

/** A gate a test holds closed until it opens it: a change waiting on the gate finishes only after `open`. */
function gate(): { readonly closed: Promise<void>; readonly open: () => void } {
  let openGate: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  return {
    closed,
    open: () => {
      openGate();
    },
  };
}

/** The onboarding channels as the Preference Roles use them: records every thread deleted; can refuse a delete. */
class FakeThreads implements Pick<OnboardingChannels, "deleteThread"> {
  readonly deleted: string[] = [];
  failDelete = false;

  deleteThread(threadId: string): Promise<void> {
    if (this.failDelete) return Promise.reject(new Error("Discord refused to delete the thread"));
    this.deleted.push(threadId);
    return Promise.resolve();
  }
}

function setUp(officerRoleIds: readonly string[] = []) {
  const guild = new FakeRolesGuild(OWNER);
  const members = new FakeServerMembers();
  const preferences = new FakePreferenceStore();
  const links = new FakeLinkStore();
  const channels = new FakeThreads();
  const logError = vi.fn<(line: string) => void>();
  const log = vi.fn<(line: string) => void>();
  const service = createPreferenceRoles({ members, preferences, links, channels, logError, log, officerRoleIds });
  /**
   * Puts a Member on the server, holding the given roles, as the discord.js adapter would find them, and Links them at
   * the given rank. A Member put on the server is Linked too, unless the test unlinks them.
   */
  const join = (memberId: MemberId, roles: readonly string[] = [], rank: RankOnLink = R3): FakeRolesMember => {
    const member = guild.member(memberId, roles);
    members.join(memberId, guild, member);
    links.link(memberId, rank);
    return member;
  };
  return { guild, members, preferences, links, channels, logError, log, service, join };
}

describe("apply", () => {
  test("gives the Preference Roles the Member's Preferences and rank want", async () => {
    const { guild, preferences, service, join } = setUp();
    guild.defineRole("English");
    guild.defineRole("Americas");
    const alice = join(ALICE);
    preferences.set(ALICE, preferencesWith({ languages: languages("en"), region: "americas" }));

    await service.apply(ALICE);

    expect(heldNames(alice)).toEqual(["Americas", "English"]);
  });

  test("creates a missing Preference Role without permissions", async () => {
    const { guild, preferences, service, join } = setUp();
    join(ALICE);
    preferences.set(ALICE, preferencesWith({ languages: languages("en") }));

    await service.apply(ALICE);

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

    await service.apply(ALICE);

    expect(heldNames(alice)).toEqual(["English", "Onboarding"]);
  });

  test("gives NaP discussions to an R5 who chose nothing", async () => {
    const { guild, service, join } = setUp();
    guild.defineRole("NaP discussions");
    const alice = join(ALICE, [], R5);

    await service.apply(ALICE);

    expect(heldNames(alice)).toEqual(["NaP discussions"]);
  });

  test("gives NaP discussions to an R4 who chose it", async () => {
    const { guild, preferences, service, join } = setUp();
    guild.defineRole("NaP discussions");
    const alice = join(ALICE, [], R4);
    preferences.set(ALICE, preferencesWith({ interests: new Set(["nap"]) }));

    await service.apply(ALICE);

    expect(heldNames(alice)).toEqual(["NaP discussions"]);
  });

  test("takes NaP discussions off an R4 who chose it and became R3", async () => {
    const { guild, preferences, service, join } = setUp();
    guild.defineRole("NaP discussions");
    const alice = join(ALICE, ["NaP discussions"], R3);
    preferences.set(ALICE, preferencesWith({ interests: new Set(["nap"]) }));

    await service.apply(ALICE);

    expect(heldNames(alice)).toEqual([]);
  });

  test("reads the rank a Rank Approval recorded: an approved R5 is given NaP discussions", async () => {
    const { guild, service, join } = setUp();
    guild.defineRole("NaP discussions");
    const approved: RankOnLink = { source: "rank-approval", rank: "R5", approvedBy: APPROVER, approvedAt: NOW };
    const alice = join(ALICE, [], approved);

    await service.apply(ALICE);

    expect(heldNames(alice)).toEqual(["NaP discussions"]);
  });

  test("stores NaP discussions as the Member's Interest when an R5 is applied", async () => {
    const { guild, preferences, service, join } = setUp();
    guild.defineRole("NaP discussions");
    join(ALICE, [], R5);

    await service.apply(ALICE);

    expect(preferences.get(ALICE).interests.has("nap")).toBe(true);
  });

  test("keeps NaP discussions for an R5 demoted to R4, since they were stored as the Member's Interest", async () => {
    const { guild, service, links, join } = setUp();
    guild.defineRole("NaP discussions");
    const alice = join(ALICE, [], R5);
    await service.apply(ALICE);

    links.link(ALICE, R4);
    await service.apply(ALICE);

    expect(heldNames(alice)).toEqual(["NaP discussions"]);
  });

  test("takes NaP discussions off an R5 demoted to R3, and keeps them stored as the Member's Interest", async () => {
    const { guild, preferences, service, links, join } = setUp();
    guild.defineRole("NaP discussions");
    const alice = join(ALICE, [], R5);
    await service.apply(ALICE);

    links.link(ALICE, R3);
    await service.apply(ALICE);

    expect(heldNames(alice)).toEqual([]);
    expect(preferences.get(ALICE).interests.has("nap")).toBe(true);
  });

  test("changes nothing for a Member who is not on the server", async () => {
    const { guild, preferences, logError, service } = setUp();
    preferences.set(BOB, preferencesWith({ languages: languages("en") }));

    await expect(service.apply(BOB)).resolves.toBeUndefined();

    expect(guild.createdRoleNames()).toEqual([]);
    expect(logError).not.toHaveBeenCalled();
  });

  test("logs a skipped Preference Role with the Member and the role, and still gives the other roles", async () => {
    const { guild, preferences, logError, service, join } = setUp();
    guild.defineRole("English", { permissions: ADMINISTRATOR });
    guild.defineRole("Americas");
    const alice = join(ALICE);
    preferences.set(ALICE, preferencesWith({ languages: languages("en"), region: "americas" }));

    await expect(service.apply(ALICE)).resolves.toBeUndefined();

    expect(heldNames(alice)).toEqual(["Americas"]);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining(ALICE));
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("English"));
  });

  test("gives no Preference Role to a Member who is not Linked, and takes off every one they hold", async () => {
    const { guild, preferences, links, service, join } = setUp();
    guild.defineRole("English");
    guild.defineRole("NaP discussions");
    guild.defineRole("Onboarding");
    const alice = join(ALICE, ["English", "NaP discussions", "Onboarding"], R5);
    preferences.set(ALICE, preferencesWith({ languages: languages("en") }));
    links.unlink(ALICE);

    await service.apply(ALICE);

    expect(heldNames(alice)).toEqual(["Onboarding"]);
  });

  test("gives nothing to a Member who is not Linked, even an R5 who would get NaP discussions", async () => {
    const { guild, links, service, join } = setUp();
    guild.defineRole("NaP discussions");
    const alice = join(ALICE, [], R5);
    links.unlink(ALICE);

    await service.apply(ALICE);

    expect(heldNames(alice)).toEqual([]);
  });

  test("logs one line naming the Member, the roles given and the roles taken off", async () => {
    const { guild, preferences, log, service, join } = setUp();
    guild.defineRole("English");
    guild.defineRole("French");
    join(ALICE, ["French"]);
    preferences.set(ALICE, preferencesWith({ languages: languages("en") }));

    await service.apply(ALICE);

    expect(log).toHaveBeenCalledTimes(1);
    const [line] = log.mock.calls[0] ?? [];
    expect(line).toEqual(expect.stringContaining(ALICE));
    expect(line).toEqual(expect.stringContaining("English"));
    expect(line).toEqual(expect.stringContaining("French"));
  });

  test("logs nothing when the apply changes no role", async () => {
    const { guild, preferences, log, service, join } = setUp();
    guild.defineRole("English");
    join(ALICE, ["English"]);
    preferences.set(ALICE, preferencesWith({ languages: languages("en") }));

    await service.apply(ALICE);

    expect(log).not.toHaveBeenCalled();
  });

  test("logs a failure to reach the server and does not throw", async () => {
    const { members, logError, service } = setUp();
    members.failWith(new Error("socket hang up"));

    await expect(service.apply(ALICE)).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining(ALICE));
  });
});

describe("one change at a time for a Member", () => {
  test("a forget that starts while an apply is giving a role takes that role off once the apply is done", async () => {
    const { guild, preferences, links, service, join } = setUp();
    guild.defineRole("English");
    const alice = join(ALICE);
    preferences.set(ALICE, preferencesWith({ languages: languages("en") }));
    const addRole = alice.addRole.bind(alice);
    const roleGiven = gate();
    const addRoleSpy = vi.spyOn(alice, "addRole").mockImplementationOnce(async (role) => {
      await roleGiven.closed;
      await addRole(role);
    });

    const applying = service.apply(ALICE);
    await vi.waitFor(() => {
      expect(addRoleSpy).toHaveBeenCalledTimes(1);
    });
    links.unlink(ALICE);
    const forgetting = service.forget(ALICE);
    roleGiven.open();
    await Promise.all([applying, forgetting]);

    expect(heldNames(alice)).toEqual([]);
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

  test("never takes off an Officer role named like a Preference Role", async () => {
    const { guild, service, join } = setUp([OFFICER_ROLE_ID]);
    guild.defineRole("English", { id: OFFICER_ROLE_ID });
    const alice = join(ALICE, ["English"]);

    await service.forget(ALICE);

    expect(heldNames(alice)).toEqual(["English"]);
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

describe("forget: the open Preferences message", () => {
  test("deletes the thread of the open Preferences message when no Rank Approval is pending", async () => {
    const { preferences, channels, service } = setUp();
    preferences.openPrompt(ALICE, ALICE_THREAD, NOW);

    await service.forget(ALICE);

    expect(channels.deleted).toEqual([ALICE_THREAD]);
    expect(preferences.prompt(ALICE)).toBeUndefined();
  });

  test("deletes the thread of the open Preferences message even when the Member is not on the server", async () => {
    const { preferences, channels, service } = setUp();
    preferences.openPrompt(ALICE, ALICE_THREAD, NOW);

    await service.forget(ALICE);

    expect(channels.deleted).toEqual([ALICE_THREAD]);
  });

  test("keeps the thread while a Rank Approval of the Member is pending, which deletes it when it ends", async () => {
    const { preferences, links, channels, service } = setUp();
    links.pendingApproval(ALICE, ALICE_THREAD);
    preferences.openPrompt(ALICE, ALICE_THREAD, NOW);

    await service.forget(ALICE);

    expect(channels.deleted).toEqual([]);
    expect(preferences.forgotten).toEqual([ALICE]);
  });

  test("a refused thread deletion is logged, and the Preferences are still forgotten", async () => {
    const { preferences, channels, logError, service } = setUp();
    preferences.openPrompt(ALICE, ALICE_THREAD, NOW);
    channels.failDelete = true;

    await service.forget(ALICE);

    expect(logError).toHaveBeenCalledOnce();
    expect(preferences.forgotten).toEqual([ALICE]);
    expect(preferences.prompt(ALICE)).toBeUndefined();
  });
});
