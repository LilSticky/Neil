import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BaseMessageOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AllianceRef } from "../domain/daily-sync.js";
import { utcDayOf } from "../domain/daily-quota.js";
import type { RankOnLink } from "../domain/link.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Alliance, AllianceRank, LookupResult, Player, RosterEntry } from "../domain/player.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { GameLanguageCode } from "../domain/preferences.js";
import { AppliedStore } from "../storage/applied-store.js";
import { DailySyncStore } from "../storage/daily-sync-store.js";
import { openDatabase } from "../storage/database.js";
import { LinkStore } from "../storage/link-store.js";
import { createPreferenceStore, type PreferenceStore } from "../storage/preference-store.js";
import type { DailySyncRecord } from "../storage/daily-sync-store.js";
import { FakeDailySyncGameApi } from "./__fakes__/daily-sync-game-api.js";
import { FakePreferenceRoles } from "./__fakes__/preference-roles.js";
import { FakeRolesGuild, type FakeRolesMember } from "./__fakes__/roles-guild.js";
import { FakeUnlink } from "./__fakes__/unlink.js";
import { FakeServerMembers } from "./__fakes__/server-members.js";
import { runDailySync, startDailySync, type DailySyncDeps } from "./daily-sync.js";
import { createNameAndRoles } from "./name-and-roles.js";
import { createPreferenceRoles } from "./preferences.js";
import type { Schedule } from "./interview-sweeper.js";

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

const NOW = new Date("2026-11-02T10:00:00Z");
const TOMORROW = new Date("2026-11-03T10:00:00Z");
const OWNER: MemberId = "900000000000000001";
const ANA: MemberId = "111111111111111111";
const BEN: MemberId = "222222222222222222";
const CAL: MemberId = "333333333333333333";
const LEADER: MemberId = "444444444444444444";
const OFFICER: MemberId = "555555555555555555";
const ANA_UID = uidOf("145563254785");
const BEN_UID = uidOf("145563254786");
const CAL_UID = uidOf("145563254787");
const HOME = kingdomOf(330);
const KINGDOM_12 = kingdomOf(12);
const MODERATOR_ROLE_ID = "700000000000000001";
const OFFICER_KING_ROLE_ID = "700000000000000002";
const TROOP_BRACKET_LEVELS = [1, 3, 6, 10, 14, 17, 20, 24, 27, 30] as const;
const QUOTA_RESERVE = 100;
const SYNC_HOUR_UTC = 3;
const TEN_MINUTES_MS = 10 * 60_000;

const NML: AllianceRef = { kingdom: HOME, tag: "NML" };
const ABC: AllianceRef = { kingdom: HOME, tag: "ABC" };
const DEF: AllianceRef = { kingdom: HOME, tag: "DEF" };

/** The rank the Game API gave with the Link. */
const GAME_R3: RankOnLink = { source: "game-api", rank: "R3" };
const GAME_R4: RankOnLink = { source: "game-api", rank: "R4" };
const APPROVED_R3: RankOnLink = { source: "rank-approval", rank: "R3", approvedBy: LEADER, approvedAt: NOW };
const UNKNOWN_RANK: RankOnLink = { source: "unknown" };

function found<T>(value: T): LookupResult<T> {
  return { kind: "found", value, fetchedAt: NOW };
}

function allianceOf(tag: string, kingdom: KingdomNumber, roster: readonly RosterEntry[]): Alliance {
  return {
    tag,
    name: `${tag} Alliance`,
    kingdom,
    might: 1_000_000,
    memberCount: roster.length,
    capacity: 100,
    leaderName: undefined,
    roster,
  };
}

/** A roster row: the Player's uid, name, rank in the Alliance, Kingdom and sanctuary level, as the Game API gives them. */
function rosterRow(
  uid: Uid,
  name: string,
  allianceRank: AllianceRank,
  sanctuaryLevel = 21,
  kingdom: KingdomNumber = HOME,
): RosterEntry {
  return {
    uid,
    name,
    allianceRank,
    kingdom,
    sanctuaryLevel,
    weeklyActivity: undefined,
    dailyHonor: undefined,
    dailyTech: undefined,
    online: undefined,
    lastOnlineAt: undefined,
  };
}

/** A Player as a uid lookup gives it: in the Alliance given with its rank, or in no Alliance. */
function playerOf(
  uid: Uid,
  name: string,
  kingdom: KingdomNumber,
  sanctuaryLevel: number,
  alliance?: { readonly tag: string; readonly rank: AllianceRank },
): Player {
  const profile = { uid, name, kingdom, might: 15_902_728, sanctuaryLevel };
  if (alliance === undefined) return { ...profile, alliance: undefined, allianceRank: undefined };
  return {
    ...profile,
    alliance: { tag: alliance.tag, name: `${alliance.tag} Alliance`, leaderUid: undefined },
    allianceRank: alliance.rank,
  };
}

/** The text of a log message. */
function contentOf(message: BaseMessageOptions | undefined): string {
  return message?.content ?? "";
}

/** The text of the last log message: the summary of a run. */
function summaryOf(h: Harness): string {
  return contentOf(h.logs[h.logs.length - 1]);
}

/** The log lines that name a Member. */
function linesAbout(h: Harness, memberId: MemberId): string[] {
  return h.logs.map(contentOf).filter((text) => text.includes(`<@${memberId}>`));
}

/** The names of the roles a member holds, sorted. */
function heldNames(member: FakeRolesMember): string[] {
  return member.roles.map((role) => role.name).sort();
}

/** The Alliance tags of the roster requests the Daily Sync sent, in order. */
function rosterTags(h: Harness): string[] {
  return h.gameApi.requests.flatMap((request) => (request.kind === "roster" ? [request.tag] : []));
}

interface HarnessOptions {
  /** Wires the real Preference Roles service over the real Preference store, instead of the fake. */
  readonly realPreferenceRoles?: boolean;
}

interface Harness {
  readonly guild: FakeRolesGuild;
  readonly server: FakeServerMembers;
  readonly applied: AppliedStore;
  readonly links: LinkStore;
  readonly preferences: PreferenceStore;
  readonly runs: DailySyncStore;
  readonly gameApi: FakeDailySyncGameApi;
  readonly unlink: FakeUnlink;
  readonly logs: BaseMessageOptions[];
  readonly errors: string[];
  readonly clock: { now: Date };
  readonly deps: DailySyncDeps;
  readonly close: () => void;
}

/** The Daily Sync with fakes at the Discord and Game API ports, the real stores and the real name and roles. */
function makeHarness(options: HarnessOptions = {}): Harness {
  const dataDir = mkdtempSync(join(tmpdir(), "neil-daily-sync-"));
  const db: DatabaseSync = openDatabase(dataDir);
  const clock = { now: NOW };
  const now = (): Date => clock.now;
  const guild = new FakeRolesGuild(OWNER);
  const server = new FakeServerMembers();
  const applied = new AppliedStore(db);
  const links = new LinkStore(db);
  const preferences = createPreferenceStore(db, () => undefined);
  const runs = new DailySyncStore(db);
  const gameApi = new FakeDailySyncGameApi(now);
  const unlink = new FakeUnlink();
  const logs: BaseMessageOptions[] = [];
  const errors: string[] = [];
  const log = (message: BaseMessageOptions): Promise<void> => {
    logs.push(message);
    return Promise.resolve();
  };
  const logError = (line: string): void => {
    errors.push(line);
  };
  const officerRoleIds = [MODERATOR_ROLE_ID, OFFICER_KING_ROLE_ID];
  const preferenceRoles =
    options.realPreferenceRoles === true
      ? createPreferenceRoles({
          members: server,
          links,
          preferences,
          applied,
          homeKingdom: HOME,
          channels: { deleteThread: () => Promise.resolve() },
          logError,
          log: (line) => {
            logs.push({ content: line });
          },
          officerRoleIds,
        })
      : new FakePreferenceRoles();
  const nameAndRoles = createNameAndRoles({
    members: server,
    applied,
    links,
    gameApi,
    unlink,
    preferenceRoles,
    homeKingdom: HOME,
    troopBracketLevels: TROOP_BRACKET_LEVELS,
    officerRoleIds: [MODERATOR_ROLE_ID, OFFICER_KING_ROLE_ID],
    log,
    now,
    logError,
  });
  const deps: DailySyncDeps = {
    links,
    applied,
    runs,
    members: server,
    gameApi,
    nameAndRoles,
    unlink,
    preferenceRoles,
    share: 500,
    quotaReserve: QUOTA_RESERVE,
    log,
    logError,
    now,
  };
  return {
    guild,
    server,
    applied,
    links,
    preferences,
    runs,
    gameApi,
    unlink,
    logs,
    errors,
    clock,
    deps,
    close: () => {
      db.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/**
 * A Linked Member as Neil left them: the Link with its rank, and the Applied State of the last apply, with the
 * Alliance it was in, the nickname and the roles.
 */
function linkMember(
  h: Harness,
  memberId: MemberId,
  uid: Uid,
  state: {
    readonly rank: RankOnLink;
    readonly alliance: AllianceRef | undefined;
    readonly nickname: string;
    readonly roles: readonly string[];
  },
): void {
  h.links.confirm({ link: { memberId, uid, linkedAt: NOW, allianceRank: state.rank, madeBy: { kind: "in-game-proof" } } }, () => undefined);
  h.applied.record({
    memberId,
    nickname: state.nickname,
    roles: state.roles,
    appliedAt: NOW,
    complete: true,
    alliance: state.alliance,
  });
}

/** The Member is on the server with the named roles (defined first when new) and the nickname given. */
function joinMember(h: Harness, memberId: MemberId, held: readonly string[] = [], nickname?: string): FakeRolesMember {
  for (const name of held) {
    if (h.guild.rolesNamed(name).length === 0) h.guild.defineRole(name);
  }
  const member = h.guild.member(memberId, held);
  member.nickname = nickname;
  h.server.join(memberId, h.guild, member);
  return member;
}

/** A Member linked in NML at R4 level 21, applied as "[NML|R4] Rogue", and on the server holding what Neil set. */
function syncedAnaInNml(h: Harness): FakeRolesMember {
  linkMember(h, ANA, ANA_UID, {
    rank: GAME_R4,
    alliance: NML,
    nickname: "[NML|R4] Rogue",
    roles: ["NML", "R4", "#330", "T7"],
  });
  return joinMember(h, ANA, ["NML", "R4", "#330", "T7"], "[NML|R4] Rogue");
}

describe("runDailySync", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  afterEach(() => {
    h.close();
  });

  test("reads one roster per Alliance for all its Linked Members, with the sync purpose", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R3, alliance: NML, nickname: "[NML] Rogue", roles: ["NML", "R3", "#330", "T7"] });
    linkMember(h, BEN, BEN_UID, { rank: GAME_R3, alliance: NML, nickname: "[NML] Lupa", roles: ["NML", "R3", "#330", "T7"] });
    joinMember(h, ANA, ["NML", "R3", "#330", "T7"], "[NML] Rogue");
    joinMember(h, BEN, ["NML", "R3", "#330", "T7"], "[NML] Lupa");
    h.gameApi.answerRoster(
      HOME,
      "NML",
      found(
        allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R3"), rosterRow(BEN_UID, "Lupa", "R3")]),
      ),
    );

    await runDailySync(h.deps);

    expect(h.gameApi.requests).toEqual([{ kind: "roster", kingdom: 330, tag: "NML", purpose: "sync" }]);
  });

  test("looks up by uid a Linked Player who is no longer in the roster of their last Alliance", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R3, alliance: NML, nickname: "[NML] Rogue", roles: ["NML", "R3", "#330", "T7"] });
    joinMember(h, ANA, ["NML", "R3", "#330", "T7"], "[NML] Rogue");
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(BEN_UID, "Lupa", "R3")])));
    h.gameApi.answerPlayer(ANA_UID, found(playerOf(ANA_UID, "Rogue", HOME, 21)));

    await runDailySync(h.deps);

    expect(h.gameApi.requests.filter((request) => request.kind === "player")).toEqual([
      { kind: "player", uid: String(ANA_UID), purpose: "sync" },
    ]);
  });

  test("looks up by uid a Linked Member who was in no Alliance at the last apply, and reads no roster for them", async () => {
    linkMember(h, ANA, ANA_UID, { rank: { source: "no-alliance" }, alliance: undefined, nickname: "Rogue", roles: ["#330", "T7"] });
    joinMember(h, ANA, ["#330", "T7"], "Rogue");
    h.gameApi.answerPlayer(ANA_UID, found(playerOf(ANA_UID, "Rogue", HOME, 21)));

    await runDailySync(h.deps);

    expect(h.gameApi.requests).toEqual([{ kind: "player", uid: String(ANA_UID), purpose: "sync" }]);
  });

  test("applies a promoted Player's new rank to the nickname and roles, and logs the change", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R3, alliance: NML, nickname: "[NML] Rogue", roles: ["NML", "R3", "#330", "T7"] });
    const member = joinMember(h, ANA, ["NML", "R3", "#330", "T7"], "[NML] Rogue");
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R4")])));

    await runDailySync(h.deps);

    expect(member.nickname).toBe("[NML|R4] Rogue");
    expect(heldNames(member)).toEqual(["#330", "NML", "R4", "T7"]);
    expect(h.links.linkFor(ANA)?.allianceRank).toEqual(GAME_R4);
    expect(linesAbout(h, ANA)).toHaveLength(1);
    expect(linesAbout(h, ANA)[0]).toContain("R4");
  });

  test("applies a changed Player Name to the nickname", async () => {
    const member = syncedAnaInNml(h);
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Scout", "R4")])));

    await runDailySync(h.deps);

    expect(member.nickname).toBe("[NML|R4] Scout");
  });

  test("applies a changed sanctuary level to the Troop Bracket role", async () => {
    const member = syncedAnaInNml(h);
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R4", 27)])));

    await runDailySync(h.deps);

    expect(heldNames(member)).toEqual(["#330", "NML", "R4", "T9"]);
  });

  test("gives a Player who moved Kingdom the Guest nickname and roles, and drops the old Alliance roles", async () => {
    const member = syncedAnaInNml(h);
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(BEN_UID, "Lupa", "R3")])));
    h.gameApi.answerPlayer(ANA_UID, found(playerOf(ANA_UID, "Rogue", KINGDOM_12, 21, { tag: "ABC", rank: "R5" })));

    await runDailySync(h.deps);

    expect(member.nickname).toBe("[ABC|R5] Rogue | #12");
    expect(heldNames(member)).toEqual(["#12", "T7"]);
  });

  test("logs nothing for a Member whose nickname and roles are as Neil set them, and still ends with a summary", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R4, alliance: NML, nickname: "", roles: [] });
    joinMember(h, ANA, []);
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R4")])));
    await runDailySync(h.deps);
    h.logs.splice(0);

    await runDailySync(h.deps);

    expect(h.logs).toHaveLength(1);
    expect(linesAbout(h, ANA)).toHaveLength(0);
  });

  test("restores a nickname the Member changed by hand, and logs it", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R4, alliance: NML, nickname: "", roles: [] });
    const member = joinMember(h, ANA, []);
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R4")])));
    await runDailySync(h.deps);
    member.nickname = "Ana the Hacker";
    h.logs.splice(0);

    await runDailySync(h.deps);

    expect(member.nickname).toBe("[NML|R4] Rogue");
    expect(linesAbout(h, ANA)).toHaveLength(1);
  });

  test("keeps an approved rank while the Player stays in that Alliance and the Game API still gives no rank", async () => {
    linkMember(h, ANA, ANA_UID, { rank: APPROVED_R3, alliance: NML, nickname: "[NML] Rogue", roles: ["NML", "R3", "#330", "T7"] });
    const member = joinMember(h, ANA, ["NML", "R3", "#330", "T7"], "[NML] Rogue");
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "unknown")])));

    await runDailySync(h.deps);

    expect(h.links.linkFor(ANA)?.allianceRank).toEqual(APPROVED_R3);
    expect(heldNames(member)).toContain("R3");
  });

  test("uses the rank the Game API now gives in place of an approved rank", async () => {
    linkMember(h, ANA, ANA_UID, { rank: APPROVED_R3, alliance: NML, nickname: "[NML] Rogue", roles: ["NML", "R3", "#330", "T7"] });
    joinMember(h, ANA, ["NML", "R3", "#330", "T7"], "[NML] Rogue");
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R4")])));

    await runDailySync(h.deps);

    expect(h.links.linkFor(ANA)?.allianceRank).toEqual(GAME_R4);
  });

  test("keeps a rank an Officer gave while the Player stays in that Alliance and the Game API still gives no rank (SC-004)", async () => {
    const byOfficer: RankOnLink = { source: "rank-approval", rank: "R2", approvedBy: OFFICER, approvedAt: NOW };
    linkMember(h, ANA, ANA_UID, { rank: byOfficer, alliance: NML, nickname: "[NML|R2] Rogue", roles: ["NML", "R2", "#330", "T7"] });
    const member = joinMember(h, ANA, ["NML", "R2", "#330", "T7"], "[NML|R2] Rogue");
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "unknown")])));

    await runDailySync(h.deps);

    expect(h.links.linkFor(ANA)?.allianceRank).toEqual(byOfficer);
    expect(heldNames(member)).toContain("R2");
  });

  test("replaces a rank an Officer gave with the rank the Game API now lists (SC-004)", async () => {
    const byOfficer: RankOnLink = { source: "rank-approval", rank: "R2", approvedBy: OFFICER, approvedAt: NOW };
    linkMember(h, ANA, ANA_UID, { rank: byOfficer, alliance: NML, nickname: "[NML|R2] Rogue", roles: ["NML", "R2", "#330", "T7"] });
    joinMember(h, ANA, ["NML", "R2", "#330", "T7"], "[NML|R2] Rogue");
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R4")])));

    await runDailySync(h.deps);

    expect(h.links.linkFor(ANA)?.allianceRank).toEqual(GAME_R4);
  });

  test("drops an approved rank when a moved Player's new Alliance gives none, and logs that Officers should check", async () => {
    linkMember(h, ANA, ANA_UID, { rank: APPROVED_R3, alliance: NML, nickname: "[NML] Rogue", roles: ["NML", "R3", "#330", "T7"] });
    const member = joinMember(h, ANA, ["NML", "R3", "#330", "T7"], "[NML] Rogue");
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(BEN_UID, "Lupa", "R3")])));
    h.gameApi.answerPlayer(ANA_UID, found(playerOf(ANA_UID, "Rogue", HOME, 21, { tag: "ABC", rank: "unknown" })));

    await runDailySync(h.deps);

    expect(h.links.linkFor(ANA)?.allianceRank).toEqual(UNKNOWN_RANK);
    expect(heldNames(member)).toEqual(["#330", "ABC", "T7"]);
    expect(linesAbout(h, ANA)).toHaveLength(1);
    expect(linesAbout(h, ANA)[0]).toMatch(/check/i);
  });

  test("skips a Linked Member who is not on the server, with no request for them, and still reads the roster for the others", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R4, alliance: NML, nickname: "", roles: [] });
    linkMember(h, BEN, BEN_UID, { rank: GAME_R4, alliance: NML, nickname: "", roles: [] });
    joinMember(h, BEN, []);
    h.gameApi.answerRoster(
      HOME,
      "NML",
      found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R4"), rosterRow(BEN_UID, "Lupa", "R4")])),
    );

    await runDailySync(h.deps);

    expect(h.gameApi.requests).toEqual([{ kind: "roster", kingdom: 330, tag: "NML", purpose: "sync" }]);
  });

  test("Unlinks a Linked Member who is not on the server as missing, with no request for them", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R4, alliance: NML, nickname: "", roles: [] });
    linkMember(h, BEN, BEN_UID, { rank: GAME_R4, alliance: NML, nickname: "", roles: [] });
    joinMember(h, BEN, []);
    h.gameApi.answerRoster(
      HOME,
      "NML",
      found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R4"), rosterRow(BEN_UID, "Lupa", "R4")])),
    );

    await runDailySync(h.deps);

    expect(h.unlink.calls).toEqual([{ memberId: ANA, reason: "missing" }]);
    expect(h.gameApi.requests).toEqual([{ kind: "roster", kingdom: 330, tag: "NML", purpose: "sync" }]);
  });

  test("counts a Member Unlinked as missing as skipped, and does not leave them over for the next day", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R4, alliance: NML, nickname: "", roles: [] });
    linkMember(h, BEN, BEN_UID, { rank: GAME_R4, alliance: NML, nickname: "", roles: [] });
    joinMember(h, BEN, []);
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(BEN_UID, "Lupa", "R4")])));

    await runDailySync(h.deps);

    expect(summaryOf(h)).toMatch(/\b1 skipped\b/);
    expect(h.runs.load()?.leftOver).not.toContain(ANA);
  });

  test("does not Unlink a Linked Member whose fetch fails for another reason, and the run ends with that failure", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R4, alliance: NML, nickname: "", roles: [] });
    h.server.failFor(ANA, new Error("Discord is unavailable"));

    await expect(runDailySync(h.deps)).rejects.toThrow("Discord is unavailable");

    expect(h.unlink.calls).toEqual([]);
    expect(h.links.linkFor(ANA)).toBeDefined();
  });

  test("looks up by uid each Member of an Alliance whose roster the Game API does not find", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R4, alliance: NML, nickname: "", roles: [] });
    linkMember(h, BEN, BEN_UID, { rank: GAME_R4, alliance: NML, nickname: "", roles: [] });
    joinMember(h, ANA, []);
    joinMember(h, BEN, []);
    h.gameApi.answerRoster(HOME, "NML", { kind: "not-found" });

    await runDailySync(h.deps);

    expect(h.gameApi.requests.filter((request) => request.kind === "player")).toEqual([
      { kind: "player", uid: String(ANA_UID), purpose: "sync" },
      { kind: "player", uid: String(BEN_UID), purpose: "sync" },
    ]);
  });

  test("charges no Member for its requests: a run that reads a roster and a Player leaves every charge with nobody (US1 scenario 9)", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R3, alliance: NML, nickname: "[NML] Rogue", roles: ["NML", "R3", "#330", "T7"] });
    joinMember(h, ANA, ["NML", "R3", "#330", "T7"], "[NML] Rogue");
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(BEN_UID, "Lupa", "R3")])));
    h.gameApi.answerPlayer(ANA_UID, found(playerOf(ANA_UID, "Rogue", HOME, 21)));

    await runDailySync(h.deps);

    expect(h.gameApi.requests.length).toBeGreaterThan(0);
    expect(h.gameApi.charges).toEqual([]);
    expect(h.errors).toEqual([]);
  });

  test("logs a Player the Game API does not find by uid once, and keeps the Link", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R3, alliance: NML, nickname: "[NML] Rogue", roles: ["NML", "R3", "#330", "T7"] });
    joinMember(h, ANA, ["NML", "R3", "#330", "T7"], "[NML] Rogue");
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [])));

    await runDailySync(h.deps);

    expect(linesAbout(h, ANA)).toHaveLength(1);
    expect(h.links.linkFor(ANA)).toBeDefined();
  });

  test("stops at the Sync Share, leaves the rest for the next day, and that day starts with them", async () => {
    for (const [memberId, uid, alliance, tag] of [
      [ANA, ANA_UID, NML, "NML"],
      [BEN, BEN_UID, ABC, "ABC"],
      [CAL, CAL_UID, DEF, "DEF"],
    ] as const) {
      linkMember(h, memberId, uid, { rank: GAME_R4, alliance, nickname: "", roles: [] });
      joinMember(h, memberId, []);
      h.gameApi.answerRoster(HOME, tag, found(allianceOf(tag, HOME, [rosterRow(uid, "Rogue", "R4")])));
    }

    await runDailySync({ ...h.deps, share: 2 });

    expect(rosterTags(h)).toEqual(["NML", "ABC"]);
    expect(h.runs.load()?.leftOver).toEqual([CAL]);
    expect(summaryOf(h)).toMatch(/\b1 left\b/);

    h.gameApi.requests.splice(0);
    h.clock.now = TOMORROW;
    await runDailySync({ ...h.deps, share: 2 });

    expect(rosterTags(h)[0]).toBe("DEF");
  });

  test("sends no request when the Daily Quota left is the Quota Reserve, and leaves every Member for the next day", async () => {
    syncedAnaInNml(h);
    h.gameApi.setQuota(1000 - QUOTA_RESERVE, 1000);

    await runDailySync(h.deps);

    expect(h.gameApi.requests).toEqual([]);
    expect(h.runs.load()?.leftOver).toEqual([ANA]);
    expect(summaryOf(h)).toMatch(/\b1 left\b/);
  });

  test("ends with a summary of the changed, skipped and requests used", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R3, alliance: NML, nickname: "[NML] Rogue", roles: ["NML", "R3", "#330", "T7"] });
    joinMember(h, ANA, ["NML", "R3", "#330", "T7"], "[NML] Rogue");
    linkMember(h, BEN, BEN_UID, { rank: GAME_R4, alliance: NML, nickname: "[NML|R4] Lupa", roles: ["NML", "R4", "#330", "T7"] });
    joinMember(h, BEN, ["NML", "R4", "#330", "T7"], "[NML|R4] Lupa");
    linkMember(h, CAL, CAL_UID, { rank: GAME_R4, alliance: NML, nickname: "", roles: [] });
    h.gameApi.answerRoster(
      HOME,
      "NML",
      found(
        allianceOf("NML", HOME, [
          rosterRow(ANA_UID, "Rogue", "R4"),
          rosterRow(BEN_UID, "Lupa", "R4"),
          rosterRow(CAL_UID, "Vex", "R4"),
        ]),
      ),
    );

    await runDailySync(h.deps);

    expect(summaryOf(h)).toMatch(/\b1 changed\b/);
    expect(summaryOf(h)).toMatch(/\b1 skipped\b/);
    expect(summaryOf(h)).toMatch(/\b1 requests?\b/);
  });

  test("records the UTC day it ran, with no Member left over when every Member was checked", async () => {
    syncedAnaInNml(h);
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R4")])));

    await runDailySync(h.deps);

    expect(h.runs.load()).toEqual({ day: utcDayOf(NOW), leftOver: [] });
  });

  test("counts every request a call sends, retries included, against the Sync Share", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R4, alliance: NML, nickname: "", roles: [] });
    joinMember(h, ANA, []);
    linkMember(h, BEN, BEN_UID, { rank: GAME_R4, alliance: ABC, nickname: "", roles: [] });
    joinMember(h, BEN, []);
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R4")])));
    h.gameApi.answerRoster(HOME, "ABC", found(allianceOf("ABC", HOME, [rosterRow(BEN_UID, "Lupa", "R4")])));
    h.gameApi.chargePerCall(3);

    await runDailySync({ ...h.deps, share: 3 });

    expect(rosterTags(h)).toEqual(["NML"]);
    expect(h.runs.load()?.leftOver).toEqual([BEN]);
    expect(summaryOf(h)).toMatch(/\b3 requests\b/);
  });

  test("records the day, with every planned Member left over, before the first request, so a run cut short is not repeated", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R4, alliance: NML, nickname: "", roles: [] });
    joinMember(h, ANA, []);
    linkMember(h, BEN, BEN_UID, { rank: GAME_R4, alliance: ABC, nickname: "", roles: [] });
    joinMember(h, BEN, []);
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R4")])));
    h.gameApi.answerRoster(HOME, "ABC", found(allianceOf("ABC", HOME, [rosterRow(BEN_UID, "Lupa", "R4")])));
    const recordsAtRequests: (DailySyncRecord | undefined)[] = [];
    h.gameApi.onRequest(() => {
      recordsAtRequests.push(h.runs.load());
    });

    await runDailySync(h.deps);

    expect(recordsAtRequests[0]).toEqual({ day: utcDayOf(NOW), leftOver: [ANA, BEN] });
  });

  test.each([
    ["unavailable", { kind: "unavailable", reason: "unexpected" }],
    ["try-again", { kind: "try-again" }],
  ] as const)(
    "stops the run at a %s Alliance roster: no uid lookup follows, the Members not reached are left over, and only the summary is logged",
    async (_label, outage) => {
      linkMember(h, ANA, ANA_UID, { rank: GAME_R4, alliance: NML, nickname: "", roles: [] });
      joinMember(h, ANA, []);
      linkMember(h, BEN, BEN_UID, { rank: GAME_R4, alliance: ABC, nickname: "", roles: [] });
      joinMember(h, BEN, []);
      h.gameApi.answerRoster(HOME, "NML", outage);
      h.gameApi.answerRoster(HOME, "ABC", found(allianceOf("ABC", HOME, [rosterRow(BEN_UID, "Lupa", "R4")])));

      await runDailySync(h.deps);

      expect(h.gameApi.requests).toHaveLength(1);
      expect(rosterTags(h)).toEqual(["NML"]);
      expect(h.runs.load()?.leftOver).toEqual([ANA, BEN]);
      expect(h.logs).toHaveLength(1);
    },
  );

  test.each([
    ["unavailable", { kind: "unavailable", reason: "unexpected" }],
    ["try-again", { kind: "try-again" }],
  ] as const)(
    "stops the run at a %s uid lookup, leaves the Members not reached for the next day, and logs no line for them",
    async (_label, outage) => {
      linkMember(h, ANA, ANA_UID, { rank: { source: "no-alliance" }, alliance: undefined, nickname: "", roles: [] });
      joinMember(h, ANA, []);
      linkMember(h, BEN, BEN_UID, { rank: { source: "no-alliance" }, alliance: undefined, nickname: "", roles: [] });
      joinMember(h, BEN, []);
      h.gameApi.answerPlayer(ANA_UID, outage);
      h.gameApi.answerPlayer(BEN_UID, found(playerOf(BEN_UID, "Lupa", HOME, 21)));

      await runDailySync(h.deps);

      expect(h.gameApi.requests).toEqual([{ kind: "player", uid: String(ANA_UID), purpose: "sync" }]);
      expect(h.runs.load()?.leftOver).toEqual([ANA, BEN]);
      expect(h.logs).toHaveLength(1);
    },
  );

  test("checks a Member left over by the last run first, by uid ahead of the rosters", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R4, alliance: NML, nickname: "", roles: [] });
    joinMember(h, ANA, []);
    linkMember(h, BEN, BEN_UID, { rank: { source: "no-alliance" }, alliance: undefined, nickname: "Lupa", roles: ["#330", "T7"] });
    joinMember(h, BEN, ["#330", "T7"], "Lupa");
    h.runs.save({ day: utcDayOf(new Date("2026-11-01T10:00:00Z")), leftOver: [BEN] });
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R4")])));
    h.gameApi.answerPlayer(BEN_UID, found(playerOf(BEN_UID, "Lupa", HOME, 21)));

    await runDailySync(h.deps);

    expect(h.gameApi.requests[0]).toEqual({ kind: "player", uid: String(BEN_UID), purpose: "sync" });
  });

  test("applies the Link as it is when the Member is reached, so a Rank Approval given during the run is kept", async () => {
    linkMember(h, ANA, ANA_UID, { rank: UNKNOWN_RANK, alliance: NML, nickname: "[NML] Rogue", roles: ["NML", "#330", "T7"] });
    const member = joinMember(h, ANA, ["NML", "#330", "T7"], "[NML] Rogue");
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "unknown")])));
    h.gameApi.onRequest(() => {
      h.links.updateRank(ANA, APPROVED_R3);
    });

    await runDailySync(h.deps);

    expect(h.links.linkFor(ANA)?.allianceRank).toEqual(APPROVED_R3);
    expect(heldNames(member)).toContain("R3");
  });

  test("fetches each Member on the server once in a run", async () => {
    syncedAnaInNml(h);
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R4")])));

    await runDailySync(h.deps);

    expect(h.server.lookups.filter((memberId) => memberId === ANA)).toHaveLength(1);
  });

  test("starts no Rank Approval and removes no Link when the Game API gives no rank for a Linked Member", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R3, alliance: NML, nickname: "[NML] Rogue", roles: ["NML", "R3", "#330", "T7"] });
    joinMember(h, ANA, ["NML", "R3", "#330", "T7"], "[NML] Rogue");
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "unknown")])));

    await runDailySync(h.deps);

    expect(h.links.linkFor(ANA)?.allianceRank).toEqual(UNKNOWN_RANK);
    expect(h.links.pendingFor(ANA)).toBeUndefined();
  });

  test("stops after the request in flight once aborted: the Members not reached are left over and the summary is logged", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R4, alliance: NML, nickname: "", roles: [] });
    joinMember(h, ANA, []);
    linkMember(h, BEN, BEN_UID, { rank: GAME_R4, alliance: ABC, nickname: "", roles: [] });
    joinMember(h, BEN, []);
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R4")])));
    h.gameApi.answerRoster(HOME, "ABC", found(allianceOf("ABC", HOME, [rosterRow(BEN_UID, "Lupa", "R4")])));
    const controller = new AbortController();
    h.gameApi.onRequest(() => {
      controller.abort();
    });

    await runDailySync({ ...h.deps, signal: controller.signal });

    expect(rosterTags(h)).toEqual(["NML"]);
    expect(h.runs.load()?.leftOver).toContain(BEN);
    expect(summaryOf(h)).toMatch(/Daily Sync/);
  });

  test("reads 100 Linked Members in 10 Alliances with one roster each, plus one lookup per mover: at most 12 requests", async () => {
    const tagOf = (group: number): string => `A${String.fromCharCode(65 + group)}`;
    const memberIdOf = (index: number): MemberId => `3${String(index).padStart(17, "0")}`;
    const uidAt = (index: number): Uid => uidOf(String(145563254000 + index));
    const rowsByTag = new Map<string, RosterEntry[]>();
    for (let index = 0; index < 100; index += 1) {
      const tag = tagOf(Math.floor(index / 10));
      const memberId = memberIdOf(index);
      linkMember(h, memberId, uidAt(index), { rank: GAME_R4, alliance: { kingdom: HOME, tag }, nickname: "", roles: [] });
      joinMember(h, memberId, []);
      // The first two Members have moved: the roster of their Alliance does not list them.
      if (index >= 2) {
        rowsByTag.set(tag, [...(rowsByTag.get(tag) ?? []), rosterRow(uidAt(index), `Rogue ${index.toString()}`, "R4")]);
      } else {
        h.gameApi.answerPlayer(uidAt(index), found(playerOf(uidAt(index), `Rogue ${index.toString()}`, HOME, 21)));
      }
    }
    for (let group = 0; group < 10; group += 1) {
      const tag = tagOf(group);
      h.gameApi.answerRoster(HOME, tag, found(allianceOf(tag, HOME, rowsByTag.get(tag) ?? [])));
    }

    await runDailySync(h.deps);

    expect(h.gameApi.requests.filter((request) => request.kind === "roster")).toHaveLength(10);
    expect(h.gameApi.requests.length).toBeLessThanOrEqual(12);
  }, 20_000); // 100 Members: slow under full-suite load on Windows
});

describe("runDailySync: a Member who moves Kingdom with Preferences", () => {
  let h: Harness;
  const DAY_BACK_IN_HOME = new Date("2026-11-04T10:00:00Z");

  beforeEach(() => {
    h = makeHarness({ realPreferenceRoles: true });
  });

  afterEach(() => {
    h.close();
  });

  test("a sync out of the Home Kingdom takes the Preference Roles off, and a sync back gives the same roles without any new Preference", async () => {
    const member = syncedAnaInNml(h);
    h.preferences.setLanguages(ANA, new Set<GameLanguageCode>(["en"]));
    h.preferences.setRegion(ANA, "americas");
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R4")])));
    await runDailySync(h.deps);
    const heldAtHome = heldNames(member);
    expect(heldAtHome).toEqual(expect.arrayContaining(["Americas", "English"]));

    h.clock.now = TOMORROW;
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(BEN_UID, "Lupa", "R3")])));
    h.gameApi.answerPlayer(ANA_UID, found(playerOf(ANA_UID, "Rogue", KINGDOM_12, 21, { tag: "ABC", rank: "R5" })));
    await runDailySync(h.deps);
    expect(heldNames(member)).not.toContain("English");
    expect(heldNames(member)).not.toContain("Americas");
    expect(h.preferences.get(ANA).languages).toEqual(new Set<GameLanguageCode>(["en"]));

    h.clock.now = DAY_BACK_IN_HOME;
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R4")])));
    h.gameApi.answerPlayer(ANA_UID, found(playerOf(ANA_UID, "Rogue", HOME, 21, { tag: "NML", rank: "R4" })));
    await runDailySync(h.deps);

    expect(heldNames(member)).toEqual(heldAtHome);
    expect(h.errors).toEqual([]);
  });
});

describe("runDailySync: a Member whose Player is not found", () => {
  let h: Harness;
  const ABC_IN_12: AllianceRef = { kingdom: KINGDOM_12, tag: "ABC" };

  beforeEach(() => {
    h = makeHarness({ realPreferenceRoles: true });
  });

  afterEach(() => {
    h.close();
  });

  test("a known Guest whose Player is not found loses the Preference Roles held, and keeps the Preferences stored", async () => {
    linkMember(h, ANA, ANA_UID, {
      rank: GAME_R4,
      alliance: ABC_IN_12,
      nickname: "[ABC|R4] Rogue | #12",
      roles: ["#12", "ABC", "R4", "T7"],
    });
    const member = joinMember(h, ANA, ["#12", "ABC", "R4", "T7", "English", "Americas"], "[ABC|R4] Rogue | #12");
    h.preferences.setLanguages(ANA, new Set<GameLanguageCode>(["en"]));
    h.preferences.setRegion(ANA, "americas");
    h.gameApi.answerRoster(KINGDOM_12, "ABC", found(allianceOf("ABC", KINGDOM_12, [])));
    h.gameApi.answerPlayer(ANA_UID, { kind: "not-found" });

    await runDailySync(h.deps);

    expect(heldNames(member)).not.toContain("English");
    expect(heldNames(member)).not.toContain("Americas");
    expect(h.preferences.get(ANA).languages).toEqual(new Set<GameLanguageCode>(["en"]));
    expect(h.errors).toEqual([]);
  });

  test("a Home Kingdom Member whose Player is not found keeps the Preference Roles held", async () => {
    linkMember(h, ANA, ANA_UID, { rank: GAME_R4, alliance: NML, nickname: "[NML|R4] Rogue", roles: ["NML", "R4", "#330", "T7"] });
    const member = joinMember(h, ANA, ["NML", "R4", "#330", "T7", "English", "Americas"], "[NML|R4] Rogue");
    h.preferences.setLanguages(ANA, new Set<GameLanguageCode>(["en"]));
    h.preferences.setRegion(ANA, "americas");
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [])));
    h.gameApi.answerPlayer(ANA_UID, { kind: "not-found" });

    await runDailySync(h.deps);

    expect(heldNames(member)).toEqual(expect.arrayContaining(["Americas", "English"]));
    expect(h.errors).toEqual([]);
  });
});

describe("startDailySync", () => {
  let h: Harness;
  let timers: { readonly run: () => void; readonly everyMs: number; stopped: boolean }[];
  const schedule: Schedule = (run, everyMs) => {
    const timer = { run, everyMs, stopped: false };
    timers.push(timer);
    return () => {
      timer.stopped = true;
    };
  };

  /** Lets the runs started by a check finish: they only await fakes that answer at once. */
  async function settle(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  /** Ana is Linked in NML and on the server; the roster lists her, so each run makes one roster request. */
  function linkedAnaWithRoster(): void {
    syncedAnaInNml(h);
    h.gameApi.answerRoster(HOME, "NML", found(allianceOf("NML", HOME, [rosterRow(ANA_UID, "Rogue", "R4")])));
  }

  beforeEach(() => {
    h = makeHarness();
    timers = [];
  });

  afterEach(() => {
    h.close();
  });

  test("checks every 10 minutes, and runs the Daily Sync once the Sync hour has come", async () => {
    linkedAnaWithRoster();
    h.clock.now = new Date("2026-11-02T02:00:00Z");
    startDailySync(h.deps, SYNC_HOUR_UTC, schedule);
    await settle();
    expect(timers).toHaveLength(1);
    expect(timers[0]?.everyMs).toBe(TEN_MINUTES_MS);
    expect(h.gameApi.requests).toEqual([]);

    h.clock.now = new Date("2026-11-02T03:00:00Z");
    timers[0]?.run();
    await settle();

    expect(h.gameApi.requests).toEqual([{ kind: "roster", kingdom: 330, tag: "NML", purpose: "sync" }]);
  });

  test("does not run the Daily Sync again the same day, at later checks", async () => {
    linkedAnaWithRoster();
    h.clock.now = new Date("2026-11-02T03:00:00Z");
    startDailySync(h.deps, SYNC_HOUR_UTC, schedule);
    await settle();

    h.clock.now = new Date("2026-11-02T03:10:00Z");
    timers[0]?.run();
    h.clock.now = new Date("2026-11-02T09:00:00Z");
    timers[0]?.run();
    await settle();

    expect(h.gameApi.requests).toHaveLength(1);
  });

  test("runs the Daily Sync again at the Sync hour of the next day", async () => {
    linkedAnaWithRoster();
    h.clock.now = new Date("2026-11-02T03:00:00Z");
    startDailySync(h.deps, SYNC_HOUR_UTC, schedule);
    await settle();

    h.clock.now = new Date("2026-11-03T03:00:00Z");
    timers[0]?.run();
    await settle();

    expect(h.gameApi.requests).toHaveLength(2);
  });

  test("after a missed hour, runs the Daily Sync soon after start, without waiting for a check", async () => {
    linkedAnaWithRoster();
    h.runs.save({ day: utcDayOf(new Date("2026-11-01T10:00:00Z")), leftOver: [] });
    h.clock.now = new Date("2026-11-02T05:00:00Z");

    startDailySync(h.deps, SYNC_HOUR_UTC, schedule);
    await settle();

    expect(h.gameApi.requests).toEqual([{ kind: "roster", kingdom: 330, tag: "NML", purpose: "sync" }]);
  });

  test("a restart after today's run does not run the Daily Sync again today", async () => {
    linkedAnaWithRoster();
    h.runs.save({ day: utcDayOf(NOW), leftOver: [] });
    h.clock.now = new Date("2026-11-02T10:00:00Z");

    startDailySync(h.deps, SYNC_HOUR_UTC, schedule);
    await settle();

    expect(h.gameApi.requests).toEqual([]);
  });

  test("stopping the Daily Sync ends a run in progress before its next request, and resolves once the run has ended", async () => {
    linkedAnaWithRoster();
    linkMember(h, BEN, BEN_UID, { rank: GAME_R4, alliance: ABC, nickname: "", roles: [] });
    joinMember(h, BEN, []);
    h.gameApi.answerRoster(HOME, "ABC", found(allianceOf("ABC", HOME, [rosterRow(BEN_UID, "Lupa", "R4")])));
    h.clock.now = new Date("2026-11-02T03:00:00Z");
    const stop = startDailySync(h.deps, SYNC_HOUR_UTC, schedule);
    const stops: Promise<void>[] = [];
    h.gameApi.onRequest(() => {
      if (stops.length === 0) stops.push(stop());
    });

    await vi.waitFor(() => {
      expect(stops).toHaveLength(1);
    });
    await Promise.all(stops);

    expect(rosterTags(h)).toEqual(["NML"]);
    expect(h.runs.load()?.leftOver).toContain(BEN);
    expect(summaryOf(h)).toMatch(/Daily Sync/);
    expect(timers[0]?.stopped).toBe(true);
  });

  test("stopping the Daily Sync stops its timer", () => {
    const stop = startDailySync(h.deps, SYNC_HOUR_UTC, schedule);

    void stop();

    expect(timers[0]?.stopped).toBe(true);
  });
});
