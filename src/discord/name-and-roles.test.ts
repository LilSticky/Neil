import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BaseMessageOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { RequestPurpose } from "../domain/daily-quota.js";
import type { RankOnLink } from "../domain/link.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { LookupResult, Player } from "../domain/player.js";
import type { MemberId } from "../domain/rank-approval.js";
import { AppliedStore } from "../storage/applied-store.js";
import { openDatabase } from "../storage/database.js";
import { LinkStore } from "../storage/link-store.js";
import type { ApplyReport } from "./member-roles.js";
import { FakeDiscordError, FakeRolesGuild, type FakeRolesMember, MISSING_PERMISSIONS } from "./__fakes__/roles-guild.js";
import { FakeServerMembers } from "./__fakes__/server-members.js";
import { FakeUnlink } from "./__fakes__/unlink.js";
import { createNameAndRoles } from "./name-and-roles.js";
import { nameAndRolesLogLine } from "./name-and-roles-texts.js";

function uidOf(digits: string): Uid {
  const parsed = parseUid(digits);
  if (!parsed.ok) throw new Error(`the test uid ${digits} is not a valid uid`);
  return parsed.value;
}

function kingdomOf(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`the test Kingdom ${number.toString()} is not a valid Kingdom`);
  return parsed.value;
}

/** The Administrator permission bit: a role with it is refused. */
const ADMINISTRATOR = 8n;
const NOW = new Date("2026-10-31T10:00:00Z");
const OWNER: MemberId = "900000000000000001";
const ALICE: MemberId = "111111111111111111";
const OFFICER: MemberId = "555555555555555555";
const BOB: MemberId = "222222222222222222";
const CAROL: MemberId = "333333333333333333";
const UID = uidOf("145563254785");
const BOB_UID = uidOf("145563254786");
const CAROL_UID = uidOf("145563254787");
const LEADER_UID = uidOf("145563254700");
const HOME_KINGDOM = kingdomOf(330);
const MODERATOR_ROLE_ID = "700000000000000001";
const OFFICER_KING_ROLE_ID = "700000000000000002";
const TROOP_BRACKET_LEVELS = [1, 3, 6, 10, 14, 17, 20, 24, 27, 30] as const;

/** A Home Kingdom Alliance member in R4, level 21: nickname `[NML|R4] Rogue`, roles NML, R4, #330, T7. */
const ROGUE_R4: Player = {
  uid: UID,
  name: "Rogue",
  kingdom: HOME_KINGDOM,
  power: 15_902_728,
  sanctuaryLevel: 21,
  alliance: { tag: "NML", name: "Neil's Men", leaderUid: LEADER_UID },
  allianceRank: "R4",
};

/** The Alliance Rank the Game API gave with the Link. */
const GAME_RANK_R4: RankOnLink = { source: "game-api", rank: "R4" };

/** The Player that is in no Alliance, in the Home Kingdom, level 21: nickname `Rogue`, roles #330, T7. */
const ROGUE_NO_ALLIANCE: Player = {
  uid: UID,
  name: "Rogue",
  kingdom: HOME_KINGDOM,
  power: 15_902_728,
  sanctuaryLevel: 21,
  alliance: undefined,
  allianceRank: undefined,
};

/** A Guest in Kingdom 12 from the Alliance ABC: nickname `[ABC|R5] Rogue | #12`, roles #12, T7 and no Alliance role. */
const ROGUE_GUEST: Player = {
  uid: UID,
  name: "Rogue",
  kingdom: kingdomOf(12),
  power: 15_902_728,
  sanctuaryLevel: 21,
  alliance: { tag: "ABC", name: "Abc", leaderUid: undefined },
  allianceRank: "R5",
};

/** The Game API as the name and roles use it: records each lookup and answers with the prepared result. */
class FakeGameApi {
  readonly lookups: { readonly uid: Uid; readonly purpose: RequestPurpose }[] = [];
  private answer: LookupResult<Player> = { kind: "not-found" };
  private readonly answers = new Map<string, LookupResult<Player>>();

  answerWith(result: LookupResult<Player>): void {
    this.answer = result;
  }

  /** The answer for one uid; other uids get the answer from answerWith. */
  answerFor(uid: Uid, result: LookupResult<Player>): void {
    this.answers.set(String(uid), result);
  }

  getPlayer(uid: Uid, purpose: RequestPurpose): Promise<LookupResult<Player>> {
    this.lookups.push({ uid, purpose });
    return Promise.resolve(this.answers.get(String(uid)) ?? this.answer);
  }
}

interface Harness {
  readonly guild: FakeRolesGuild;
  readonly server: FakeServerMembers;
  readonly applied: AppliedStore;
  readonly links: LinkStore;
  readonly gameApi: FakeGameApi;
  readonly unlink: FakeUnlink;
  readonly logs: BaseMessageOptions[];
  readonly errors: string[];
  readonly service: ReturnType<typeof createNameAndRoles>;
}

/** The Link of Alice is stored, as the Interview stores it before the name and roles are applied. */
function linkAlice(h: Harness, rank: RankOnLink = GAME_RANK_R4): void {
  h.links.confirm({ link: { memberId: ALICE, uid: UID, linkedAt: NOW, allianceRank: rank } }, () => undefined);
}

/** A Link of the Member to the uid, as the Interview stores it. */
function linkMember(h: Harness, memberId: MemberId, uid: Uid, rank: RankOnLink = GAME_RANK_R4): void {
  h.links.confirm({ link: { memberId, uid, linkedAt: NOW, allianceRank: rank } }, () => undefined);
}

/** The Member is on the server holding the named roles; roles that do not exist yet are defined first. */
function joinMember(h: Harness, memberId: MemberId, held: readonly string[] = []): FakeRolesMember {
  for (const name of held) {
    if (h.guild.rolesNamed(name).length === 0) h.guild.defineRole(name);
  }
  const member = h.guild.member(memberId, held);
  h.server.join(memberId, h.guild, member);
  return member;
}

/** Alice is on the server holding the named roles; roles that do not exist yet are defined first. */
function joinAlice(h: Harness, held: readonly string[] = []): FakeRolesMember {
  return joinMember(h, ALICE, held);
}

/** The text of a log message. */
function contentOf(message: BaseMessageOptions): string {
  return message.content ?? "";
}

/** The names of the roles a member holds, sorted. */
function heldNames(member: FakeRolesMember): string[] {
  return member.roles.map((role) => role.name).sort();
}

describe("createNameAndRoles", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let h: Harness;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-name-and-roles-"));
    db = openDatabase(dataDir);
    const guild = new FakeRolesGuild(OWNER);
    const server = new FakeServerMembers();
    const applied = new AppliedStore(db);
    const links = new LinkStore(db);
    const gameApi = new FakeGameApi();
    const unlink = new FakeUnlink();
    const logs: BaseMessageOptions[] = [];
    const errors: string[] = [];
    const service = createNameAndRoles({
      members: server,
      applied,
      links,
      gameApi,
      unlink,
      homeKingdom: HOME_KINGDOM,
      troopBracketLevels: TROOP_BRACKET_LEVELS,
      officerRoleIds: [MODERATOR_ROLE_ID, OFFICER_KING_ROLE_ID],
      log: (message: BaseMessageOptions) => {
        logs.push(message);
        return Promise.resolve();
      },
      now: () => NOW,
      logError: (line: string) => {
        errors.push(line);
      },
    });
    h = { guild, server, applied, links, gameApi, unlink, logs, errors, service };
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  describe("onLinked", () => {
    test("sets the nickname and gives exactly the Managed Roles that fit the Player, with no Game API request", async () => {
      const alice = joinAlice(h);
      linkAlice(h);

      await h.service.onLinked(ALICE, ROGUE_R4, GAME_RANK_R4);

      expect(alice.nickname).toBe("[NML|R4] Rogue");
      expect(heldNames(alice)).toEqual(["#330", "NML", "R4", "T7"]);
      expect(h.gameApi.lookups).toEqual([]);
    });

    test("gives a Guest the Kingdom and Troop Bracket roles, no Alliance or rank role, and the Kingdom in the nickname", async () => {
      const alice = joinAlice(h);
      linkAlice(h, { source: "game-api", rank: "R5" });

      await h.service.onLinked(ALICE, ROGUE_GUEST, { source: "game-api", rank: "R5" });

      expect(alice.nickname).toBe("[ABC|R5] Rogue | #12");
      expect(heldNames(alice)).toEqual(["#12", "T7"]);
    });

    test("gives only the Kingdom and Troop Bracket roles to a Player in no Alliance, and no rank", async () => {
      const alice = joinAlice(h);
      linkAlice(h, { source: "no-alliance" });

      await h.service.onLinked(ALICE, ROGUE_NO_ALLIANCE, { source: "no-alliance" });

      expect(alice.nickname).toBe("Rogue");
      expect(heldNames(alice)).toEqual(["#330", "T7"]);
    });

    test("removes the Managed Roles of the Alliance and rank it was last applied with", async () => {
      const alice = joinAlice(h, ["OLD", "R3", "#330", "T2"]);
      linkAlice(h, { source: "no-alliance" });
      h.applied.record({
        memberId: ALICE,
        nickname: "[OLD|R3] Rogue",
        roles: ["OLD", "R3", "#330", "T2"],
        appliedAt: NOW,
        complete: true,
      });

      await h.service.onLinked(ALICE, ROGUE_NO_ALLIANCE, { source: "no-alliance" });

      expect(heldNames(alice)).toEqual(["#330", "T7"]);
    });

    test("leaves a role that is not a Managed Role alone", async () => {
      const alice = joinAlice(h, ["Officer"]);
      linkAlice(h);

      await h.service.onLinked(ALICE, ROGUE_R4, GAME_RANK_R4);

      expect(heldNames(alice)).toEqual(["#330", "NML", "Officer", "R4", "T7"]);
    });

    test("keeps the nickname when the Player Name is empty, and still gives the roles", async () => {
      const alice = joinAlice(h);
      linkAlice(h);

      await h.service.onLinked(ALICE, { ...ROGUE_R4, name: "" }, GAME_RANK_R4);

      expect(alice.nickname).toBeUndefined();
      expect(heldNames(alice)).toEqual(["#330", "NML", "R4", "T7"]);
    });

    test("records the applied state as complete when nothing was skipped", async () => {
      joinAlice(h);
      linkAlice(h);

      await h.service.onLinked(ALICE, ROGUE_R4, GAME_RANK_R4);

      expect(h.applied.get(ALICE)).toEqual({
        memberId: ALICE,
        nickname: "[NML|R4] Rogue",
        roles: ["NML", "R4", "#330", "T7"],
        appliedAt: NOW,
        complete: true,
        alliance: { kingdom: HOME_KINGDOM, tag: "NML" },
      });
    });

    test("records the Alliance of the Player by Kingdom and tag, so the Daily Sync needs no uid lookup for them", async () => {
      joinAlice(h);
      linkAlice(h, { source: "game-api", rank: "R5" });

      await h.service.onLinked(ALICE, ROGUE_GUEST, { source: "game-api", rank: "R5" });

      expect(h.applied.get(ALICE)?.alliance).toEqual({ kingdom: kingdomOf(12), tag: "ABC" });
    });

    test("records the applied state as not complete when a step was skipped", async () => {
      h.guild.defineRole("T7", { permissions: ADMINISTRATOR });
      joinAlice(h);
      linkAlice(h);

      await h.service.onLinked(ALICE, ROGUE_R4, GAME_RANK_R4);

      expect(h.applied.get(ALICE)).toMatchObject({ memberId: ALICE, nickname: "[NML|R4] Rogue", complete: false });
    });

    test("logs one line with the nickname, the roles added and the roles created", async () => {
      joinAlice(h);
      linkAlice(h);
      const report: ApplyReport = {
        nickname: "set",
        added: ["NML", "R4", "#330", "T7"],
        removed: [],
        created: ["NML", "R4", "#330", "T7"],
        skipped: [],
      };

      await h.service.onLinked(ALICE, ROGUE_R4, GAME_RANK_R4);

      expect(h.logs).toEqual([nameAndRolesLogLine(ALICE, report, "[NML|R4] Rogue")]);
    });

    test("logs a step Discord refuses, with its reason, and still applies the others", async () => {
      h.guild.failAdding("R4", new FakeDiscordError(MISSING_PERMISSIONS, "Missing Permissions"));
      const alice = joinAlice(h);
      linkAlice(h);
      const report: ApplyReport = {
        nickname: "set",
        added: ["NML", "#330", "T7"],
        removed: [],
        created: ["NML", "R4", "#330", "T7"],
        skipped: [{ what: "R4", reason: "missing-permissions" }],
      };

      await h.service.onLinked(ALICE, ROGUE_R4, GAME_RANK_R4);

      expect(heldNames(alice)).toEqual(["#330", "NML", "T7"]);
      expect(h.logs).toEqual([nameAndRolesLogLine(ALICE, report, "[NML|R4] Rogue")]);
    });

    test("logs nothing when a Link changes nothing that was not already applied", async () => {
      joinAlice(h);
      linkAlice(h);

      await h.service.onLinked(ALICE, ROGUE_R4, GAME_RANK_R4);
      await h.service.onLinked(ALICE, ROGUE_R4, GAME_RANK_R4);

      expect(h.logs).toHaveLength(1);
    });

    test("does nothing for a Member who is not on the server", async () => {
      linkAlice(h);

      await h.service.onLinked(ALICE, ROGUE_R4, GAME_RANK_R4);

      expect(h.logs).toEqual([]);
      expect(h.errors).toEqual([]);
      expect(h.applied.get(ALICE)).toBeUndefined();
    });

    test("never throws: a server that cannot be reached is logged with the Member, and nothing is recorded", async () => {
      joinAlice(h);
      linkAlice(h);
      h.server.failWith(new Error("Discord is unavailable"));

      await expect(h.service.onLinked(ALICE, ROGUE_R4, GAME_RANK_R4)).resolves.toBeUndefined();

      expect(h.errors).toHaveLength(1);
      expect(h.errors[0]).toContain(ALICE);
      expect(h.applied.get(ALICE)).toBeUndefined();
      expect(h.logs).toEqual([]);
    });

    test("records the applied state as complete when the only skipped step is the owner's nickname", async () => {
      joinMember(h, OWNER);
      linkMember(h, OWNER, UID);

      await h.service.onLinked(OWNER, ROGUE_R4, GAME_RANK_R4);

      expect(h.applied.get(OWNER)).toMatchObject({ memberId: OWNER, complete: true });
    });

    test("never gives an Alliance tag that is an Officer role, and leaves that Member without it", async () => {
      h.guild.defineRole("King", { id: OFFICER_KING_ROLE_ID });
      const alice = joinAlice(h);
      linkAlice(h);
      const kingPlayer: Player = { ...ROGUE_R4, alliance: { tag: "King", name: "Kings", leaderUid: undefined } };

      await h.service.onLinked(ALICE, kingPlayer, GAME_RANK_R4);

      expect(heldNames(alice)).toEqual(["#330", "R4", "T7"]);
      expect(h.applied.get(ALICE)?.complete).toBe(false);
    });

    test("logs that a Managed Role which grants permissions must lose them or be renamed, and still gives the others", async () => {
      h.guild.defineRole("R4", { permissions: ADMINISTRATOR });
      const alice = joinAlice(h);
      linkAlice(h);

      await h.service.onLinked(ALICE, ROGUE_R4, GAME_RANK_R4);

      expect(heldNames(alice)).toEqual(["#330", "NML", "T7"]);
      const lines = h.logs.map(contentOf);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("R4");
      expect(lines[0]).toContain("must lose its permissions");
      expect(lines[0]).toContain("renamed");
    });
  });

  describe("atStartup", () => {
    test("looks each Linked Member without a complete apply up once, with the lookup purpose, and applies the rank of the Link", async () => {
      const alice = joinMember(h, ALICE);
      const bob = joinMember(h, BOB);
      linkMember(h, ALICE, UID, GAME_RANK_R4);
      linkMember(h, BOB, BOB_UID, GAME_RANK_R4);
      h.gameApi.answerWith({ kind: "found", value: ROGUE_R4, fetchedAt: NOW });

      await h.service.atStartup();

      expect(h.gameApi.lookups).toEqual([
        { uid: UID, purpose: "lookup" },
        { uid: BOB_UID, purpose: "lookup" },
      ]);
      expect(alice.nickname).toBe("[NML|R4] Rogue");
      expect(heldNames(alice)).toEqual(["#330", "NML", "R4", "T7"]);
      expect(bob.nickname).toBe("[NML|R4] Rogue");
    });

    test("records the Alliance of each Linked Member it applies to, so the Daily Sync needs no uid lookup for them", async () => {
      joinMember(h, ALICE);
      linkMember(h, ALICE, UID);
      h.gameApi.answerWith({ kind: "found", value: ROGUE_R4, fetchedAt: NOW });

      await h.service.atStartup();

      expect(h.applied.get(ALICE)?.alliance).toEqual({ kingdom: HOME_KINGDOM, tag: "NML" });
    });

    test("skips a Linked Member who is not on the server, with no lookup", async () => {
      joinMember(h, BOB);
      linkMember(h, ALICE, UID);
      linkMember(h, BOB, BOB_UID);
      h.gameApi.answerWith({ kind: "found", value: ROGUE_R4, fetchedAt: NOW });

      await h.service.atStartup();

      expect(h.gameApi.lookups).toEqual([{ uid: BOB_UID, purpose: "lookup" }]);
      expect(h.applied.get(ALICE)).toBeUndefined();
      expect(h.errors).toEqual([]);
    });

    test("leaves a Linked Member whose apply is complete alone, with no lookup", async () => {
      joinMember(h, ALICE);
      joinMember(h, BOB);
      linkMember(h, ALICE, UID);
      linkMember(h, BOB, BOB_UID);
      h.applied.record({
        memberId: ALICE,
        nickname: "[NML|R4] Rogue",
        roles: ["NML", "R4", "#330", "T7"],
        appliedAt: NOW,
        complete: true,
      });
      h.gameApi.answerWith({ kind: "found", value: ROGUE_R4, fetchedAt: NOW });

      await h.service.atStartup();

      expect(h.gameApi.lookups).toEqual([{ uid: BOB_UID, purpose: "lookup" }]);
    });

    test.each(["quota-spent", "reserve-kept"] as const)(
      "stops at a %s from the Game API, leaves the rest for the next start and logs how many are left",
      async (kind) => {
        joinMember(h, ALICE);
        joinMember(h, BOB);
        const carol = joinMember(h, CAROL);
        linkMember(h, ALICE, UID);
        linkMember(h, BOB, BOB_UID);
        linkMember(h, CAROL, CAROL_UID);
        h.gameApi.answerFor(UID, { kind: "found", value: ROGUE_R4, fetchedAt: NOW });
        h.gameApi.answerFor(BOB_UID, { kind, resetsAt: NOW });
        h.gameApi.answerFor(CAROL_UID, { kind: "found", value: ROGUE_R4, fetchedAt: NOW });

        await h.service.atStartup();

        expect(h.gameApi.lookups.map((lookup) => lookup.uid)).toEqual([UID, BOB_UID]);
        expect(h.applied.get(BOB)).toBeUndefined();
        expect(carol.nickname).toBeUndefined();
        expect(h.logs.map(contentOf).some((line) => /(\b2\b.*\bleft\b)|(\bleft\b.*\b2\b)/.test(line))).toBe(true);
      },
    );

    test("logs a Player the Game API does not find, names the Member, and goes on to the next Linked Member", async () => {
      const alice = joinMember(h, ALICE);
      const bob = joinMember(h, BOB);
      linkMember(h, ALICE, UID);
      linkMember(h, BOB, BOB_UID);
      h.gameApi.answerFor(UID, { kind: "not-found" });
      h.gameApi.answerFor(BOB_UID, { kind: "found", value: ROGUE_R4, fetchedAt: NOW });

      await h.service.atStartup();

      expect(alice.nickname).toBeUndefined();
      expect(h.applied.get(ALICE)).toBeUndefined();
      expect(h.logs.map(contentOf).some((line) => line.includes(ALICE))).toBe(true);
      expect(bob.nickname).toBe("[NML|R4] Rogue");
      expect(h.errors).toEqual([]);
    });

    test("goes on to the next Linked Member when the apply for one of them fails", async () => {
      joinMember(h, ALICE);
      const bob = joinMember(h, BOB);
      linkMember(h, ALICE, UID);
      linkMember(h, BOB, BOB_UID);
      h.server.failFor(ALICE, new Error("Discord is unavailable"));
      h.gameApi.answerWith({ kind: "found", value: ROGUE_R4, fetchedAt: NOW });

      await h.service.atStartup();

      expect(bob.nickname).toBe("[NML|R4] Rogue");
      expect(h.errors.some((line) => line.includes(ALICE))).toBe(true);
    });

    test("never throws when Discord cannot be reached: the failure is logged and nothing is recorded", async () => {
      joinMember(h, ALICE);
      linkMember(h, ALICE, UID);
      h.server.failWith(new Error("Discord is unavailable"));

      await expect(h.service.atStartup()).resolves.toBeUndefined();

      expect(h.errors.length).toBeGreaterThan(0);
      expect(h.applied.get(ALICE)).toBeUndefined();
    });
  });

  describe("the startup sweep of Linked Members who left", () => {
    test("Unlinks a Linked Member Discord reports as not on the server, as missing, with no Game API request for them", async () => {
      joinAlice(h);
      linkAlice(h);
      h.applied.record({
        memberId: ALICE,
        nickname: "[NML|R4] Rogue",
        roles: ["NML", "R4", "#330", "T7"],
        appliedAt: NOW,
        complete: true,
      });
      linkMember(h, BOB, BOB_UID);

      await h.service.atStartup();

      expect(h.unlink.calls).toEqual([{ memberId: BOB, reason: "missing" }]);
      expect(h.gameApi.lookups).toEqual([]);
    });

    test("Unlinks a missing Linked Member whose apply is already complete, not only one still to apply", async () => {
      linkMember(h, BOB, BOB_UID);
      h.applied.record({
        memberId: BOB,
        nickname: "[NML|R4] Rogue",
        roles: ["NML", "R4", "#330", "T7"],
        appliedAt: NOW,
        complete: true,
      });

      await h.service.atStartup();

      expect(h.unlink.calls).toEqual([{ memberId: BOB, reason: "missing" }]);
    });

    test("leaves the Linked Members who are on the server alone, and the apply goes on for them", async () => {
      const alice = joinAlice(h);
      linkAlice(h);
      h.gameApi.answerWith({ kind: "found", value: ROGUE_R4, fetchedAt: NOW });

      await h.service.atStartup();

      expect(h.unlink.calls).toEqual([]);
      expect(alice.nickname).toBe("[NML|R4] Rogue");
    });

    test("does not Unlink a Linked Member whose fetch fails for another reason, and logs the failure", async () => {
      linkMember(h, BOB, BOB_UID);
      h.server.failFor(BOB, new Error("Discord is unavailable"));

      await h.service.atStartup();

      expect(h.unlink.calls).toEqual([]);
      expect(h.links.linkFor(BOB)).toBeDefined();
      expect(h.errors.some((line) => line.includes(BOB))).toBe(true);
    });

    test("Unlinks no one when Discord cannot be reached at all", async () => {
      linkMember(h, BOB, BOB_UID);
      linkMember(h, ALICE, UID);
      h.server.failWith(new Error("Discord is unavailable"));

      await h.service.atStartup();

      expect(h.unlink.calls).toEqual([]);
    });

    test("stops the sweep at the first fetch that fails: the later Linked Members are not fetched, and one error is logged", async () => {
      const linked = [
        [BOB, BOB_UID],
        [ALICE, UID],
        [CAROL, CAROL_UID],
      ] as const;
      for (const [memberId, uid] of linked) {
        linkMember(h, memberId, uid);
        h.applied.record({
          memberId,
          nickname: "[NML|R4] Rogue",
          roles: ["NML", "R4", "#330", "T7"],
          appliedAt: NOW,
          complete: true,
        });
      }
      h.server.failWith(new Error("Discord is unavailable"));

      await h.service.atStartup();

      expect(h.server.lookups).toEqual([BOB]);
      expect(h.errors).toHaveLength(1);
      expect(h.unlink.calls).toEqual([]);
    });

    test("the apply still tries each Linked Member without a complete apply after the sweep stops on an outage", async () => {
      linkMember(h, BOB, BOB_UID);
      linkMember(h, ALICE, UID);
      h.server.failWith(new Error("Discord is unavailable"));

      await h.service.atStartup();

      // The sweep stops at its first Member; the apply then tries both, in the store's order.
      expect(h.server.lookups[0]).toBe(BOB);
      expect([...h.server.lookups.slice(1)].sort()).toEqual([ALICE, BOB].sort());
      expect(h.unlink.calls).toEqual([]);
    });
  });

  describe("syncMember", () => {
    test("logs nothing for the owner, whose nickname is always skipped, when nothing else changed", async () => {
      joinMember(h, OWNER, ["#330", "NML", "R4", "T7"]);
      linkMember(h, OWNER, UID);
      await h.service.syncMember(OWNER, ROGUE_R4, GAME_RANK_R4);
      h.logs.splice(0);

      const changed = await h.service.syncMember(OWNER, ROGUE_R4, GAME_RANK_R4);

      expect(changed).toBe(false);
      expect(h.logs).toEqual([]);
    });
  });

  describe("onRankApproved", () => {
    const APPROVED_R4: RankOnLink = { source: "rank-approval", rank: "R4", approvedBy: OFFICER, approvedAt: NOW };

    test("looks the Player up once with the lookup purpose, and gives the rank of the Link", async () => {
      const alice = joinAlice(h);
      linkAlice(h, APPROVED_R4);
      h.gameApi.answerWith({ kind: "found", value: { ...ROGUE_R4, allianceRank: "unknown" }, fetchedAt: NOW });

      await h.service.onRankApproved(ALICE);

      expect(h.gameApi.lookups).toEqual([{ uid: UID, purpose: "lookup" }]);
      expect(alice.nickname).toBe("[NML|R4] Rogue");
      expect(heldNames(alice)).toEqual(["#330", "NML", "R4", "T7"]);
    });

    test("a Player the lookup does not return changes nothing and is logged", async () => {
      const alice = joinAlice(h);
      linkAlice(h, APPROVED_R4);
      h.gameApi.answerWith({ kind: "not-found" });

      await h.service.onRankApproved(ALICE);

      expect(alice.nickname).toBeUndefined();
      expect(heldNames(alice)).toEqual([]);
      expect(h.logs).toHaveLength(1);
    });

    test("a Member with no Link changes nothing and makes no lookup", async () => {
      joinAlice(h);

      await h.service.onRankApproved(ALICE);

      expect(h.gameApi.lookups).toEqual([]);
      expect(h.logs).toEqual([]);
    });

    test("a Member who is not on the server makes no lookup and logs nothing", async () => {
      linkAlice(h, APPROVED_R4);

      await h.service.onRankApproved(ALICE);

      expect(h.gameApi.lookups).toEqual([]);
      expect(h.logs).toEqual([]);
    });

    test.each(["quota-spent", "reserve-kept"] as const)(
      "a %s from the Game API is logged as a quota stop, not as a Player the Game API does not give",
      async (kind) => {
        joinAlice(h);
        linkAlice(h, APPROVED_R4);
        h.gameApi.answerWith({ kind, resetsAt: NOW });

        await h.service.onRankApproved(ALICE);

        const lines = h.logs.map(contentOf);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain(ALICE);
        expect(lines[0]).toMatch(/quota/i);
        expect(lines[0]).not.toContain("gave no Player");
      },
    );
  });
});
