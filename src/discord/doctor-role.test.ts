import type { BaseMessageOptions } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import type { Link } from "../domain/link.js";
import { parseUid, type Uid } from "../domain/lookup-input.js";
import type { MemberId } from "../domain/rank-approval.js";
import { FakeRolesGuild, type FakeRolesMember } from "./__fakes__/roles-guild.js";
import { FakeServerMembers } from "./__fakes__/server-members.js";
import { createDoctorRole } from "./doctor-role.js";
import { doctorRoleStartupLogLine } from "./doctor-role-texts.js";

const OWNER = "900000000000000001";
const ALICE: MemberId = "111111111111111111";
const BOB: MemberId = "222222222222222222";
const CAROL: MemberId = "333333333333333333";
const BOT: MemberId = "444444444444444444";
const UID = uidOf("145563254785");
/** The name of the Doctor Role, as the server has it. */
const DOCTOR = "Doctor";
/** The Administrator permission bit: a role with it is refused. */
const ADMINISTRATOR = 8n;
/** The id of an Officer role of the server, as the configuration gives it: Neil never gives or takes it. */
const OFFICER_ROLE_ID = "700000000000000001";
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

function setUp(officerRoleIds: readonly string[] = []) {
  const guild = new FakeRolesGuild(OWNER);
  const members = new FakeServerMembers();
  const links = new FakeLinks();
  const logError = vi.fn<(line: string) => void>();
  const log = vi.fn<(message: BaseMessageOptions) => Promise<void>>(() => Promise.resolve());
  const service = createDoctorRole({ members, links, logError, log, officerRoleIds });
  /** Puts a Member on the server, holding the given roles, as the discord.js adapter would find them. */
  const join = (memberId: MemberId, roles: readonly string[] = [], bot = false): FakeRolesMember => {
    const member = guild.member(memberId, roles);
    member.bot = bot;
    members.join(memberId, guild, member);
    return member;
  };
  return { guild, links, logError, log, service, join, members };
}

describe("give", () => {
  test("gives the Doctor Role to a Member on the server, creating it once, and logs nothing", async () => {
    const { guild, logError, service, join } = setUp();
    const alice = join(ALICE);

    await service.give(ALICE);

    expect(guild.createdRoleNames()).toEqual([DOCTOR]);
    expect(heldNames(alice)).toEqual([DOCTOR]);
    expect(logError).not.toHaveBeenCalled();
  });

  test("never gives an Officer role named Doctor", async () => {
    const { guild, service, join } = setUp([OFFICER_ROLE_ID]);
    guild.defineRole(DOCTOR, { id: OFFICER_ROLE_ID });
    const alice = join(ALICE);

    await service.give(ALICE);

    expect(heldNames(alice)).toEqual([]);
  });

  test("changes nothing for a Member who is not on the server", async () => {
    const { guild, logError, service } = setUp();

    await service.give(BOB);

    expect(guild.createdRoleNames()).toEqual([]);
    expect(logError).not.toHaveBeenCalled();
  });

  test("logs a skip once with the Member and its reason when the Doctor Role has permissions, and does not throw", async () => {
    const { guild, logError, service, join } = setUp();
    guild.defineRole(DOCTOR, { permissions: ADMINISTRATOR });
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
  test("takes the Doctor Role off a Member who holds it", async () => {
    const { guild, service, join } = setUp();
    guild.defineRole(DOCTOR);
    const alice = join(ALICE, [DOCTOR]);

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
  test("gives the Doctor Role to a Linked Member who does not hold it", async () => {
    const { guild, links, service, join } = setUp();
    guild.defineRole(DOCTOR);
    const alice = join(ALICE);
    links.link(ALICE);

    await service.atStartup();

    expect(heldNames(alice)).toEqual([DOCTOR]);
  });

  test("takes the Doctor Role off a Member who is not Linked and holds it", async () => {
    const { guild, service, join } = setUp();
    guild.defineRole(DOCTOR);
    const bob = join(BOB, [DOCTOR]);

    await service.atStartup();

    expect(heldNames(bob)).toEqual([]);
  });

  test("leaves a bot alone, whether or not it holds the Doctor Role", async () => {
    const { guild, links, service, join } = setUp();
    guild.defineRole(DOCTOR);
    const bot = join(BOT, [], true);
    const botHolding = join(CAROL, [DOCTOR], true);
    links.link(BOT);
    links.link(CAROL);
    const botAdd = vi.spyOn(bot, "addRole");

    await service.atStartup();

    expect(botAdd).not.toHaveBeenCalled();
    expect(heldNames(bot)).toEqual([]);
    expect(heldNames(botHolding)).toEqual([DOCTOR]);
  });

  test("a failure for one Member is logged and does not stop the others", async () => {
    const { guild, links, logError, service, join } = setUp();
    guild.defineRole(DOCTOR);
    const alice = join(ALICE);
    const bob = join(BOB);
    links.link(ALICE);
    links.link(BOB);
    vi.spyOn(alice, "addRole").mockRejectedValueOnce(new Error("socket hang up"));

    await expect(service.atStartup()).resolves.toBeUndefined();

    expect(heldNames(alice)).toEqual([]);
    expect(heldNames(bob)).toEqual([DOCTOR]);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining(ALICE));
  });

  test("gives nothing to a Member who Unlinked after the listing, when the Link is gone before the give", async () => {
    const { guild, links, service, join } = setUp();
    guild.defineRole(DOCTOR);
    const alice = join(ALICE);
    links.link(ALICE);
    // The sweep reads ALICE as Linked when it lists the Members; by the time it gives the role, the Link is gone.
    const linkAtListing = links.linkFor(ALICE);
    vi.spyOn(links, "linkFor").mockReturnValueOnce(linkAtListing).mockReturnValue(undefined);

    await service.atStartup();

    expect(heldNames(alice)).toEqual([]);
  });
});

describe("atStartup: the summary line", () => {
  test("posts one line with the counts when a Member is given the role", async () => {
    const { guild, links, log, service, join } = setUp();
    guild.defineRole(DOCTOR);
    const alice = join(ALICE);
    links.link(ALICE);

    await service.atStartup();

    expect(heldNames(alice)).toEqual([DOCTOR]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(doctorRoleStartupLogLine({ given: 1, takenOff: 0, skipped: 0 }));
  });

  test("posts one line with the counts when a Member has the role taken off", async () => {
    const { guild, log, service, join } = setUp();
    guild.defineRole(DOCTOR);
    join(BOB, [DOCTOR]);

    await service.atStartup();

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(doctorRoleStartupLogLine({ given: 0, takenOff: 1, skipped: 0 }));
  });

  test("counts a give refused for permissions as skipped", async () => {
    const { guild, links, log, service, join } = setUp();
    guild.defineRole(DOCTOR, { permissions: ADMINISTRATOR });
    join(ALICE);
    links.link(ALICE);

    await service.atStartup();

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(doctorRoleStartupLogLine({ given: 0, takenOff: 0, skipped: 1 }));
  });

  test("posts nothing when every Member is already in the right state", async () => {
    const { guild, links, log, service, join } = setUp();
    guild.defineRole(DOCTOR);
    const alice = join(ALICE, [DOCTOR]);
    links.link(ALICE);
    const carol = join(CAROL);

    await service.atStartup();

    expect(heldNames(alice)).toEqual([DOCTOR]);
    expect(heldNames(carol)).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });
});
