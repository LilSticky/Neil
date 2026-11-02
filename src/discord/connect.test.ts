import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChannelType, Events, PermissionFlagsBits } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { todaysQuota, utcDayOf, type RequestPurpose } from "../domain/daily-quota.js";
import { parseUid, parseKingdom, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Alliance, LookupResult, Player } from "../domain/player.js";
import { recordStart } from "../domain/start-record.js";
import { AppliedStore } from "../storage/applied-store.js";
import { DailySyncStore } from "../storage/daily-sync-store.js";
import { openDatabase } from "../storage/database.js";
import { InterviewStore } from "../storage/interview-store.js";
import { KnownAllianceStore } from "../storage/known-alliance-store.js";
import { LinkStore } from "../storage/link-store.js";
import { FakeConnectGuild } from "./__fakes__/connect-guild.js";
import { FakeClient } from "./__fakes__/discord-client.js";
import { connect, type ConnectOptions } from "./client.js";
import { unlinkedLogLine, unlinkedPrivateMessage } from "./unlink-texts.js";

// connect creates a discord.js Client; the test replaces it with a fake that serves the guild the test sets.
vi.mock("discord.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("discord.js")>();
  const { FakeClient: Replacement } = await import("./__fakes__/discord-client.js");
  return { ...actual, Client: Replacement };
});

const GUILD_ID = "123456789012345678";
const ONBOARDING_CHANNEL_ID = "1000000000000000001";
const LOG_CHANNEL_ID = "1000000000000000002";
const MODERATOR_ROLE_ID = "1000000000000000003";
const KING_ROLE_ID = "1000000000000000004";
const ALICE = "111111111111111111";
const BOB = "222222222222222222";
/** Discord's code for a user it cannot find. */
const UNKNOWN_USER = 10013;
const TOKEN = "fake-token-connect-test";
const INTERVIEW_TIMEOUT_MS = 1440 * 60_000;
const NOW = new Date("2026-11-02T10:00:00Z");

const ONBOARDING_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.CreatePrivateThreads,
  PermissionFlagsBits.ManageThreads,
];
const LOG_PERMISSIONS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
const SERVER_PERMISSIONS = [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageNicknames];

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

const UID = uidOf("145563254785");
const BOB_UID = uidOf("145563254786");
const HOME_KINGDOM = kingdomOf(330);

/** The Game API as connect uses it: records each Player lookup and finds no Player. */
class FakeGameApi {
  readonly lookups: { readonly uid: Uid; readonly purpose: RequestPurpose }[] = [];
  private gate: Promise<void> | undefined = undefined;
  private openGate: (() => void) | undefined = undefined;

  /** Makes every Player lookup wait, once recorded, until release is called. */
  hold(): void {
    this.gate = new Promise<void>((resolve) => {
      this.openGate = resolve;
    });
  }

  release(): void {
    this.openGate?.();
    this.gate = undefined;
    this.openGate = undefined;
  }

  async getPlayer(uid: Uid, purpose: RequestPurpose): Promise<LookupResult<Player>> {
    this.lookups.push({ uid, purpose });
    if (this.gate !== undefined) await this.gate;
    return { kind: "not-found" };
  }

  findPlayer(): Promise<LookupResult<Player>> {
    return Promise.resolve({ kind: "not-found" });
  }

  getAlliance(): Promise<LookupResult<Alliance>> {
    return Promise.resolve({ kind: "not-found" });
  }

  findAlliance(): Promise<LookupResult<Alliance>> {
    return Promise.resolve({ kind: "not-found" });
  }

  quotaToday() {
    return todaysQuota(undefined, NOW);
  }
}

/** A guild with both channels, the bot holding the given server permissions, and the given log channel. */
function serverWith(serverPermissions: readonly bigint[], withLog = true): FakeConnectGuild {
  const guild = new FakeConnectGuild(serverPermissions);
  guild.addChannel(ONBOARDING_CHANNEL_ID, { type: ChannelType.GuildText, botPermissions: ONBOARDING_PERMISSIONS });
  if (withLog) guild.addChannel(LOG_CHANNEL_ID, { type: ChannelType.GuildText, botPermissions: LOG_PERMISSIONS });
  return guild;
}

describe("connect", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let links: LinkStore;
  let applied: AppliedStore;
  let interviews: InterviewStore;
  let dailySync: DailySyncStore;
  let gameApi: FakeGameApi;
  let connection: { disconnect(): Promise<void> } | undefined;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-connect-"));
    db = openDatabase(dataDir);
    links = new LinkStore(db);
    applied = new AppliedStore(db);
    interviews = new InterviewStore(db, INTERVIEW_TIMEOUT_MS);
    dailySync = new DailySyncStore(db);
    gameApi = new FakeGameApi();
    connection = undefined;
    FakeClient.served = undefined;
    FakeClient.directMessages = [];
    FakeClient.refuseDirectMessages = false;
  });

  afterEach(async () => {
    gameApi.release();
    await connection?.disconnect();
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  /** Alice is Linked and has no applied name and roles: the startup apply has work to do. */
  function linkAlice(): void {
    links.confirm(
      { link: { memberId: ALICE, uid: UID, linkedAt: NOW, allianceRank: { source: "game-api", rank: "R4" } } },
      () => undefined,
    );
  }

  /** Alice is Linked and applied: her nickname is the one Neil gave her. */
  function linkAppliedAlice(): void {
    linkAlice();
    applied.record({ memberId: ALICE, nickname: "Rogue", roles: [], appliedAt: NOW, complete: true, alliance: undefined });
  }

  /** The member leaves the guild, as Discord reports it. */
  function leave(memberId: string): void {
    const client = FakeClient.latest;
    if (client === undefined) throw new Error("connect created no client");
    client.emit(Events.GuildMemberRemove, { id: memberId, user: { username: "vex" }, guild: { id: GUILD_ID } });
  }

  /** The log line Unlink writes for Alice, as the channel holds it. */
  function aliceUnlinkLine(reason: "left" | "missing"): string {
    return unlinkedLogLine(ALICE, UID, "Rogue", reason).content;
  }

  /** Today's Daily Sync is recorded as run, so connect does not start one: the lookups of these tests are the startup apply's only. */
  function recordDailySyncRunToday(): void {
    dailySync.save({ day: utcDayOf(NOW), leftOver: [] });
  }

  function connectOptions(): ConnectOptions {
    return {
      buildInfo: "dev",
      now: () => NOW,
      startRecord: recordStart(undefined, NOW),
      gameApi,
      quotaReserve: 50,
      officerRoleIds: [MODERATOR_ROLE_ID, KING_ROLE_ID],
      guildId: GUILD_ID,
      onboardingChannelId: ONBOARDING_CHANNEL_ID,
      logChannelId: LOG_CHANNEL_ID,
      interviewTimeoutMs: INTERVIEW_TIMEOUT_MS,
      interviews,
      links,
      applied,
      knownAlliances: new KnownAllianceStore(db),
      homeKingdom: HOME_KINGDOM,
      troopBracketLevels: [1, 3, 6, 10, 14, 17, 20, 24, 27, 30],
      dailySync,
      syncHourUtc: 3,
      syncShare: 500,
    };
  }

  test("looks each Linked Member without a complete apply up once, after the channels are checked", async () => {
    const guild = serverWith(SERVER_PERMISSIONS);
    guild.join(ALICE);
    FakeClient.served = guild;
    linkAlice();
    recordDailySyncRunToday();

    connection = await connect(TOKEN, connectOptions());

    await vi.waitFor(() => {
      expect(gameApi.lookups).toEqual([{ uid: UID, purpose: "lookup" }]);
    });
  });

  test("does not look anyone up when the channel check fails", async () => {
    const guild = serverWith(SERVER_PERMISSIONS, false);
    guild.join(ALICE);
    FakeClient.served = guild;
    linkAlice();

    await expect(connect(TOKEN, connectOptions())).rejects.toThrow("log channel");

    expect(gameApi.lookups).toEqual([]);
  });

  test("treats a Linked Member Discord cannot find (10013) as not on the server: no lookup for them, no startup error", async () => {
    const guild = serverWith(SERVER_PERMISSIONS);
    guild.join(BOB);
    guild.failFetch(ALICE, UNKNOWN_USER);
    FakeClient.served = guild;
    linkAlice();
    links.confirm({ link: { memberId: BOB, uid: BOB_UID, linkedAt: NOW, allianceRank: { source: "no-alliance" } } }, () => undefined);
    recordDailySyncRunToday();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      connection = await connect(TOKEN, connectOptions());

      await vi.waitFor(() => {
        expect(gameApi.lookups).toEqual([{ uid: BOB_UID, purpose: "lookup" }]);
      });
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("still starts when Neil lacks Manage Roles, and posts the missing permission to the log channel", async () => {
    const guild = serverWith([PermissionFlagsBits.ManageNicknames]);
    FakeClient.served = guild;

    connection = await connect(TOKEN, connectOptions());

    await vi.waitFor(() => {
      expect(guild.messagesIn(LOG_CHANNEL_ID).join("\n")).toContain("Manage Roles");
    });
  });

  test("runs the Daily Sync once the channels are checked, when the Sync hour has come and today's run is not recorded", async () => {
    FakeClient.served = serverWith(SERVER_PERMISSIONS);
    const injected = new Date("2026-10-31T10:00:00Z");

    connection = await connect(TOKEN, { ...connectOptions(), now: () => injected, syncHourUtc: 0 });

    await vi.waitFor(() => {
      expect(dailySync.load()?.day).toBe(utcDayOf(injected));
    });
  });

  test("starts the Daily Sync only after the startup apply has settled, so their lookups do not overlap", async () => {
    const guild = serverWith(SERVER_PERMISSIONS);
    guild.join(ALICE);
    FakeClient.served = guild;
    linkAlice();
    gameApi.hold();

    connection = await connect(TOKEN, connectOptions());

    await vi.waitFor(() => {
      expect(gameApi.lookups.some((lookup) => lookup.purpose === "lookup")).toBe(true);
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(gameApi.lookups.filter((lookup) => lookup.purpose === "sync")).toEqual([]);

    gameApi.release();
    await vi.waitFor(() => {
      expect(gameApi.lookups.filter((lookup) => lookup.purpose === "sync")).toHaveLength(1);
    });
  });

  describe("a Linked Member who leaves", () => {
    test("is Unlinked: the Link ends and the log line names the Member, the uid and the nickname", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(ALICE);
      FakeClient.served = guild;
      linkAppliedAlice();
      recordDailySyncRunToday();
      connection = await connect(TOKEN, connectOptions());

      leave(ALICE);

      await vi.waitFor(() => {
        expect(guild.messagesIn(LOG_CHANNEL_ID)).toContain(aliceUnlinkLine("left"));
      });
      expect(links.linkFor(ALICE)).toBeUndefined();
    });

    test("is sent a private message that their Link ended", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(ALICE);
      FakeClient.served = guild;
      linkAppliedAlice();
      recordDailySyncRunToday();
      connection = await connect(TOKEN, connectOptions());

      leave(ALICE);

      await vi.waitFor(() => {
        expect(FakeClient.directMessages).toEqual([{ userId: ALICE, content: unlinkedPrivateMessage().content }]);
      });
    });

    test("is still Unlinked when Discord refuses the private message, and no error is logged", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(ALICE);
      FakeClient.served = guild;
      FakeClient.refuseDirectMessages = true;
      linkAppliedAlice();
      recordDailySyncRunToday();
      connection = await connect(TOKEN, connectOptions());
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      try {
        leave(ALICE);

        await vi.waitFor(() => {
          expect(guild.messagesIn(LOG_CHANNEL_ID)).toContain(aliceUnlinkLine("left"));
        });
        expect(links.linkFor(ALICE)).toBeUndefined();
        expect(errorSpy).not.toHaveBeenCalled();
      } finally {
        errorSpy.mockRestore();
      }
    });
  });

  test("at startup, a Linked Member Discord reports as not on the server is Unlinked, with no Game API request for them", async () => {
    const guild = serverWith(SERVER_PERMISSIONS);
    FakeClient.served = guild;
    links.confirm(
      { link: { memberId: BOB, uid: BOB_UID, linkedAt: NOW, allianceRank: { source: "no-alliance" } } },
      () => undefined,
    );
    applied.record({ memberId: BOB, nickname: "Lupa", roles: [], appliedAt: NOW, complete: true, alliance: undefined });
    recordDailySyncRunToday();

    connection = await connect(TOKEN, connectOptions());

    await vi.waitFor(() => {
      expect(links.linkFor(BOB)).toBeUndefined();
    });
    expect(gameApi.lookups).toEqual([]);
  });

  test("disconnect stops a Daily Sync run in progress before its next request, and resolves once the run has ended", async () => {
    const guild = serverWith(SERVER_PERMISSIONS);
    guild.join(ALICE);
    guild.join(BOB);
    FakeClient.served = guild;
    linkAlice();
    links.confirm(
      { link: { memberId: BOB, uid: BOB_UID, linkedAt: NOW, allianceRank: { source: "no-alliance" } } },
      () => undefined,
    );
    // Both have a complete apply, so the startup apply has nothing to do and the Daily Sync is the only one looking up.
    for (const memberId of [ALICE, BOB]) {
      applied.record({ memberId, nickname: "Rogue", roles: [], appliedAt: NOW, complete: true, alliance: undefined });
    }
    gameApi.hold();

    const connected = await connect(TOKEN, connectOptions());
    connection = connected;
    await vi.waitFor(() => {
      expect(gameApi.lookups.filter((lookup) => lookup.purpose === "sync")).toHaveLength(1);
    });

    const ending = connected.disconnect();
    gameApi.release();
    await ending;

    expect(gameApi.lookups.filter((lookup) => lookup.purpose === "sync")).toHaveLength(1);
    expect(guild.messagesIn(LOG_CHANNEL_ID).join("\n")).toMatch(/Daily Sync/);
  });
});
