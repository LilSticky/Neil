import { describe, expect, test, vi } from "vitest";
import type { Link } from "../domain/link.js";
import { parseUid, type Uid } from "../domain/lookup-input.js";
import type { MemberId } from "../domain/rank-approval.js";
import { FakeRolesGuild, type FakeRolesMember } from "./__fakes__/roles-guild.js";
import { FakeServerMembers } from "./__fakes__/server-members.js";
import { createOnboardingRole } from "./onboarding-role.js";

const OWNER = "900000000000000001";
const ALICE: MemberId = "111111111111111111";
const BOB: MemberId = "222222222222222222";
const CAROL: MemberId = "333333333333333333";
const BOT: MemberId = "444444444444444444";
const UID = uidOf("145563254785");
/** The Administrator permission bit: a role with it is refused. */
const ADMINISTRATOR = 8n;
const NOW = new Date("2026-11-04T10:00:00Z");

function uidOf(digits: string): Uid {
  const parsed = parseUid(digits);
  if (!parsed.ok) throw new Error(`the test uid ${digits} is not a valid uid`);
  return parsed.value;
}

/** The names of the roles a member holds, sorted. */
function heldNames(member: FakeRolesMember): string[] {
  return member.roles.map((role) => role.name).sort();
}

/** The Links the service reads: a Member is Linked when a Link is recorded for them. */
class FakeLinks {
  private readonly linked = new Set<MemberId>();

  link(memberId: MemberId): void {
    this.linked.add(memberId);
  }

  linkFor(memberId: MemberId): Link | undefined {
    if (!this.linked.has(memberId)) return undefined;
    return {
      memberId,
      uid: UID,
      linkedAt: NOW,
      allianceRank: { source: "game-api", rank: "R4" },
      madeBy: { kind: "in-game-proof" },
    };
  }
}

function setUp() {
  const guild = new FakeRolesGuild(OWNER);
  const members = new FakeServerMembers();
  const links = new FakeLinks();
  const logError = vi.fn<(line: string) => void>();
  const service = createOnboardingRole({ members, links, logError });
  /** Puts a Member on the server, holding the given roles, as the discord.js adapter would find them. */
  const join = (memberId: MemberId, roles: readonly string[] = [], bot = false): FakeRolesMember => {
    const member = guild.member(memberId, roles);
    member.bot = bot;
    members.join(memberId, guild, member);
    return member;
  };
  return { guild, links, logError, service, join, members };
}

describe("give", () => {
  test("gives the Onboarding Role to a Member on the server, creating it once, and logs nothing", async () => {
    const { guild, logError, service, join } = setUp();
    const alice = join(ALICE);

    await service.give(ALICE);

    expect(guild.createdRoleNames()).toEqual(["Onboarding"]);
    expect(heldNames(alice)).toEqual(["Onboarding"]);
    expect(logError).not.toHaveBeenCalled();
  });

  test("changes nothing for a Member who is not on the server", async () => {
    const { guild, logError, service } = setUp();

    await service.give(BOB);

    expect(guild.createdRoleNames()).toEqual([]);
    expect(logError).not.toHaveBeenCalled();
  });

  test("logs a skip once with the Member and its reason, and does not throw", async () => {
    const { guild, logError, service, join } = setUp();
    guild.defineRole("Onboarding", { permissions: ADMINISTRATOR });
    const alice = join(ALICE);

    await expect(service.give(ALICE)).resolves.toBeUndefined();

    expect(heldNames(alice)).toEqual([]);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining(ALICE));
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("has-permissions"));
  });

  test("never throws: a Member that cannot be fetched is logged and the call resolves", async () => {
    const { logError, service, members } = setUp();
    members.failFor(ALICE, new Error("socket hang up"));

    await expect(service.give(ALICE)).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining(ALICE));
  });
});

describe("takeOff", () => {
  test("takes the Onboarding Role off a Member who holds it", async () => {
    const { guild, service, join } = setUp();
    guild.defineRole("Onboarding");
    const alice = join(ALICE, ["Onboarding"]);

    await service.takeOff(ALICE);

    expect(heldNames(alice)).toEqual([]);
  });

  test("changes nothing for a Member who is not on the server", async () => {
    const { guild, logError, service } = setUp();

    await expect(service.takeOff(BOB)).resolves.toBeUndefined();

    expect(guild.createdRoleNames()).toEqual([]);
    expect(logError).not.toHaveBeenCalled();
  });
});

describe("atStartup", () => {
  test("takes the Onboarding Role off a Linked Member who holds it", async () => {
    const { guild, links, service, join } = setUp();
    guild.defineRole("Onboarding");
    const alice = join(ALICE, ["Onboarding"]);
    links.link(ALICE);

    await service.atStartup();

    expect(heldNames(alice)).toEqual([]);
  });

  test("gives the Onboarding Role to a Member who is not Linked and does not hold it", async () => {
    const { guild, service, join } = setUp();
    guild.defineRole("Onboarding");
    const bob = join(BOB);

    await service.atStartup();

    expect(heldNames(bob)).toEqual(["Onboarding"]);
  });

  test("leaves a Member already in the right state alone", async () => {
    const { guild, links, service, join } = setUp();
    guild.defineRole("Onboarding");
    const alice = join(ALICE);
    links.link(ALICE);
    const bob = join(BOB, ["Onboarding"]);
    const aliceAdd = vi.spyOn(alice, "addRole");
    const bobRemove = vi.spyOn(bob, "removeRole");

    await service.atStartup();

    expect(aliceAdd).not.toHaveBeenCalled();
    expect(bobRemove).not.toHaveBeenCalled();
    expect(heldNames(alice)).toEqual([]);
    expect(heldNames(bob)).toEqual(["Onboarding"]);
  });

  test("leaves a bot alone, whether or not it holds the Onboarding Role", async () => {
    const { guild, service, join } = setUp();
    guild.defineRole("Onboarding");
    const bot = join(BOT, [], true);
    const botHolding = join(CAROL, ["Onboarding"], true);
    const botAdd = vi.spyOn(bot, "addRole");

    await service.atStartup();

    expect(botAdd).not.toHaveBeenCalled();
    expect(heldNames(bot)).toEqual([]);
    expect(heldNames(botHolding)).toEqual(["Onboarding"]);
  });

  test("a failure for one Member is logged and does not stop the others", async () => {
    const { guild, logError, service, join } = setUp();
    guild.defineRole("Onboarding");
    const alice = join(ALICE);
    const bob = join(BOB);
    vi.spyOn(alice, "addRole").mockRejectedValueOnce(new Error("socket hang up"));

    await expect(service.atStartup()).resolves.toBeUndefined();

    expect(heldNames(alice)).toEqual([]);
    expect(heldNames(bob)).toEqual(["Onboarding"]);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining(ALICE));
  });

  test("a failed listing of the server is logged once and changes nothing", async () => {
    const { guild, links, logError, service, join, members } = setUp();
    guild.defineRole("Onboarding");
    const alice = join(ALICE, ["Onboarding"]);
    links.link(ALICE);
    members.failListing(new Error("socket hang up"));

    await expect(service.atStartup()).resolves.toBeUndefined();

    expect(heldNames(alice)).toEqual(["Onboarding"]);
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
