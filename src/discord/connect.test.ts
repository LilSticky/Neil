import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChannelType, Events, GuildScheduledEventStatus, PermissionFlagsBits } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { todaysQuota, utcDayOf, type RequestPurpose } from "../domain/daily-quota.js";
import { ONBOARDING_ROLE_NAME } from "../domain/onboarding-role.js";
import { exileReasonOf, type Exile } from "../domain/exile.js";
import { parseUid, parseKingdom, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Alliance, LookupResult, Match, Player } from "../domain/player.js";
import { timeOut } from "../domain/onboarding-interview.js";
import { recordStart } from "../domain/start-record.js";
import { AppliedStore } from "../storage/applied-store.js";
import { BootyAlertsStore } from "../storage/booty-alerts-store.js";
import { DailySyncStore } from "../storage/daily-sync-store.js";
import { openDatabase } from "../storage/database.js";
import { EventStore } from "../storage/event-store.js";
import { InterviewStore } from "../storage/interview-store.js";
import { KnownAllianceStore } from "../storage/known-alliance-store.js";
import { LinkStore } from "../storage/link-store.js";
import { ReaperStore } from "../storage/reaper-store.js";
import { createPreferenceStore, type PreferenceStore } from "../storage/preference-store.js";
import { FakeConnectGuild, type ConnectScheduledEvent } from "./__fakes__/connect-guild.js";
import { FakeClient } from "./__fakes__/discord-client.js";
import { FakePickInteraction } from "./__fakes__/pick-interaction.js";
import { FakeReaperInteraction } from "./__fakes__/reaper-interaction.js";
import { FakeReaperPageInteraction } from "./__fakes__/reaper-page-interaction.js";
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
const ANNOUNCEMENTS_CHANNEL_ID = "1000000000000000005";
const EVENT_ID = "800000000000000001";
const MODERATOR_ROLE_ID = "1000000000000000003";
const KING_ROLE_ID = "1000000000000000004";
const ALICE = "111111111111111111";
const BOB = "222222222222222222";
const CAROL = "333333333333333333";
/** A Discord refusal to read a Member that is not an unknown user: the Member is there, but cannot be read. */
const UNREADABLE_MEMBER = 50013;
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
const ALICE_UID = uidOf("145563254787");
const HOME_KINGDOM = kingdomOf(330);

/** Vex, a Home Kingdom Player: the Player the pick of the /reaper add pick list reads. */
const VEX: Player = {
  uid: UID,
  name: "Vex",
  kingdom: HOME_KINGDOM,
  might: 15902728,
  sanctuaryLevel: 42,
  alliance: { tag: "ASH", name: "Ashen", leaderUid: undefined },
  allianceRank: "R4",
};

/** Two Players named Vex in two Kingdoms: an ambiguous name. The pick list orders them by Kingdom, so Kingdom 330 is at 1. */
const VEX_MATCHES: readonly Match[] = [
  { uid: "145563254785", name: "Vex", kingdom: 330, tag: "ASH" },
  { uid: "145563254786", name: "Vex", kingdom: 12, tag: "OWL" },
];

/** The Game API as connect uses it: records each Player lookup; finds the Player set, else none. */
class FakeGameApi {
  readonly lookups: { readonly uid: Uid; readonly purpose: RequestPurpose }[] = [];
  /** The Player every uid reads as; undefined reads no Player. */
  player: Player | undefined = undefined;
  /** The matches a name finds, when the name is ambiguous; undefined finds no Player by name. */
  ambiguousMatches: readonly Match[] | undefined = undefined;
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
    if (this.player === undefined) return { kind: "not-found" };
    return { kind: "found", value: this.player, fetchedAt: NOW };
  }

  findPlayer(): Promise<LookupResult<Player>> {
    if (this.ambiguousMatches === undefined) return Promise.resolve({ kind: "not-found" });
    return Promise.resolve({ kind: "ambiguous", matches: this.ambiguousMatches });
  }

  getAlliance(): Promise<LookupResult<Alliance>> {
    return Promise.resolve({ kind: "not-found" });
  }

  findAlliance(): Promise<LookupResult<Alliance>> {
    return Promise.resolve({ kind: "not-found" });
  }

  /** The charged lookups of a Member: connect's tests never look up as a Member, so none is asked for. */
  chargedTo(): never {
    throw new Error("connect's tests do not look up as a Member");
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

/**
 * A presence update for a Member of the served guild, as Discord reports it: the status before (null when there was none)
 * and after. The guild is the served one, so the Member is read with a single-Member fetch.
 */
function presenceUpdate(memberId: string, before: string | null, after: string): void {
  const client = FakeClient.latest;
  const guild = FakeClient.served;
  if (client === undefined || guild === undefined) throw new Error("connect has no client or guild to update");
  const presence = (status: string) => ({ userId: memberId, status, guild, member: null });
  client.emit(Events.PresenceUpdate, before === null ? null : presence(before), presence(after));
}

/** Lets the work the test started run for a moment, so a handler that should do nothing has done it. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

/**
 * Holds every thread the onboarding channel is asked to create until release is called, so a test can have an Interview
 * still being started. `requested` counts the requests so far.
 */
async function holdThreadCreation(guild: FakeConnectGuild): Promise<{ requested(): number; release(): void }> {
  const onboarding = await guild.channels.fetch(ONBOARDING_CHANNEL_ID);
  if (onboarding === null) throw new Error("the fake guild has no onboarding channel");
  const create = onboarding.threads.create;
  let requests = 0;
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  onboarding.threads.create = async (options) => {
    requests += 1;
    await gate;
    return create(options);
  };
  return {
    requested: () => requests,
    release: () => {
      open();
    },
  };
}

describe("connect", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let links: LinkStore;
  let applied: AppliedStore;
  let interviews: InterviewStore;
  let dailySync: DailySyncStore;
  let events: EventStore;
  let reaper: ReaperStore;
  let preferences: PreferenceStore;
  let bootyAlerts: BootyAlertsStore;
  let gameApi: FakeGameApi;
  let connection: { disconnect(): Promise<void> } | undefined;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-connect-"));
    db = openDatabase(dataDir);
    links = new LinkStore(db);
    applied = new AppliedStore(db);
    interviews = new InterviewStore(db, INTERVIEW_TIMEOUT_MS);
    dailySync = new DailySyncStore(db);
    events = new EventStore(db);
    reaper = new ReaperStore(db);
    preferences = createPreferenceStore(db);
    bootyAlerts = new BootyAlertsStore(db);
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
      { link: { memberId: ALICE, uid: UID, linkedAt: NOW, allianceRank: { source: "game-api", rank: "R4" }, madeBy: { kind: "in-game-proof" } } },
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
      allowance: { allowance: () => 3, expected: () => 100, top: () => [], usageOf: () => 0 },
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
      events,
      reaper,
      preferences,
      bootyAlerts,
      guidesForumId: undefined,
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
    links.confirm({ link: { memberId: BOB, uid: BOB_UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);
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

  describe("the Onboarding Role at startup", () => {
    test("gives the Onboarding Role to a non-bot Member who is not Linked", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(BOB);
      FakeClient.served = guild;
      recordDailySyncRunToday();

      connection = await connect(TOKEN, connectOptions());

      await vi.waitFor(() => {
        expect(guild.rolesOf(BOB)).toContain(ONBOARDING_ROLE_NAME);
      });
    });

    test("takes the Onboarding Role off a Linked Member who holds it", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.defineRole(ONBOARDING_ROLE_NAME);
      guild.join(ALICE, [ONBOARDING_ROLE_NAME]);
      FakeClient.served = guild;
      linkAlice();
      recordDailySyncRunToday();

      connection = await connect(TOKEN, connectOptions());

      await vi.waitFor(() => {
        expect(guild.rolesOf(ALICE)).not.toContain(ONBOARDING_ROLE_NAME);
      });
    });

    test("runs the Doctor Role sweep after the Onboarding Role one, so their startup lines come in that order", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(BOB);
      guild.join(ALICE);
      FakeClient.served = guild;
      linkAlice();
      recordDailySyncRunToday();

      connection = await connect(TOKEN, connectOptions());

      /** The startup lines of the two role sweeps, in the order the log channel holds them. */
      const startupLines = (): string[] => guild.messagesIn(LOG_CHANNEL_ID).filter((line) => line.includes(" Role at startup: "));
      await vi.waitFor(() => {
        expect(startupLines()).toHaveLength(2);
      });
      expect(startupLines().map((line) => line.split(" ")[0])).toEqual(["Onboarding", "Doctor"]);
    });
  });

  describe("the Members online when Neil starts", () => {
    const STARTUP_LINE = "Onboarding Interviews at startup: started 1, failed 0, left for later 0.";

    /** The lines of the log channel, in the order the channel holds them. */
    const logLines = (guild: FakeConnectGuild): string[] => guild.messagesIn(LOG_CHANNEL_ID);

    test("opens an Interview for an unlinked Member who is online", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(BOB);
      guild.setPresence(BOB, "online");
      FakeClient.served = guild;
      recordDailySyncRunToday();

      connection = await connect(TOKEN, connectOptions());

      await vi.waitFor(() => {
        expect(interviews.openFor(BOB)).toBeDefined();
      });
    });

    test("opens no Interview for a Linked Member who is online", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(ALICE);
      guild.join(BOB);
      guild.setPresence(ALICE, "online");
      guild.setPresence(BOB, "online");
      FakeClient.served = guild;
      linkAppliedAlice();
      recordDailySyncRunToday();

      connection = await connect(TOKEN, connectOptions());

      await vi.waitFor(() => {
        expect(logLines(guild)).toContain(STARTUP_LINE);
      });
      expect(interviews.openFor(ALICE)).toBeUndefined();
    });

    test("does not count an unlinked Member whose cached presence is offline", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(BOB);
      guild.join(ALICE);
      guild.setPresence(BOB, "online");
      guild.setPresence(ALICE, "offline");
      FakeClient.served = guild;
      recordDailySyncRunToday();

      connection = await connect(TOKEN, connectOptions());

      await vi.waitFor(() => {
        expect(logLines(guild)).toContain(STARTUP_LINE);
      });
      expect(interviews.openFor(ALICE)).toBeUndefined();
    });

    test("starts the Interviews after the Onboarding Role sweep, so the log shows that order", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(BOB);
      guild.setPresence(BOB, "online");
      FakeClient.served = guild;
      recordDailySyncRunToday();

      connection = await connect(TOKEN, connectOptions());

      await vi.waitFor(() => {
        expect(logLines(guild)).toContain(STARTUP_LINE);
      });
      const lines = logLines(guild);
      const onboardingAt = lines.findIndex((line) => line.startsWith("Onboarding Role at startup: "));
      expect(onboardingAt).toBeGreaterThanOrEqual(0);
      expect(onboardingAt).toBeLessThan(lines.indexOf(STARTUP_LINE));
    });

    test("reads each online Member by id, and never asks Discord for every Member at once", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(BOB);
      guild.setPresence(BOB, "online");
      FakeClient.served = guild;
      recordDailySyncRunToday();

      connection = await connect(TOKEN, connectOptions());

      await vi.waitFor(() => {
        expect(logLines(guild)).toContain(STARTUP_LINE);
      });
      expect(guild.unscopedFetches).toBe(0);
    });

    test("is not run when Neil is disconnecting before the Onboarding Role sweep has ended", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(BOB);
      guild.setPresence(BOB, "online");
      FakeClient.served = guild;
      recordDailySyncRunToday();
      guild.holdListing();

      const connected = await connect(TOKEN, connectOptions());
      connection = connected;
      await connected.disconnect();
      guild.releaseListing();

      await vi.waitFor(() => {
        expect(logLines(guild).some((line) => line.startsWith("Doctor Role at startup: ") || line.startsWith("Onboarding Role at startup: "))).toBe(true);
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      expect(logLines(guild)).not.toContain(STARTUP_LINE);
      expect(interviews.openFor(BOB)).toBeUndefined();
    });

    test("a Member whose presence cannot be read is logged and counts as failed, and the next Member's Interview still starts", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(BOB);
      guild.join(CAROL);
      guild.setPresence(BOB, "online");
      guild.setPresence(CAROL, "online");
      guild.failFetch(BOB, UNREADABLE_MEMBER);
      FakeClient.served = guild;
      recordDailySyncRunToday();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      try {
        connection = await connect(TOKEN, connectOptions());

        await vi.waitFor(() => {
          expect(logLines(guild)).toContain("Onboarding Interviews at startup: started 1, failed 1, left for later 0.");
        });
        expect(interviews.openFor(CAROL)).toBeDefined();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(BOB));
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("disconnect waits for the Interview being started, and starts no Interview after it", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(BOB);
      guild.join(CAROL);
      guild.setPresence(BOB, "online");
      guild.setPresence(CAROL, "online");
      FakeClient.served = guild;
      recordDailySyncRunToday();
      const threads = await holdThreadCreation(guild);

      try {
        const connected = await connect(TOKEN, connectOptions());
        connection = connected;
        await vi.waitFor(() => {
          expect(threads.requested()).toBe(1);
        });

        const disconnecting = connected.disconnect();
        threads.release();
        await disconnecting;

        expect(interviews.openFor(BOB)).toBeDefined();
        expect(interviews.openFor(CAROL)).toBeUndefined();
      } finally {
        threads.release();
      }
    });

    test("disconnect stops the listing of the Members online before the next Member is read", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(BOB);
      guild.join(CAROL);
      guild.setPresence(BOB, "online");
      guild.setPresence(CAROL, "online");
      FakeClient.served = guild;
      recordDailySyncRunToday();
      const release = guild.holdFetch(BOB);

      try {
        const connected = await connect(TOKEN, connectOptions());
        connection = connected;
        await vi.waitFor(() => {
          expect(guild.fetchesOf(BOB)).toBeGreaterThan(0);
        });
        const carolFetches = guild.fetchesOf(CAROL);

        const disconnecting = connected.disconnect();
        release();
        await disconnecting;

        expect(guild.fetchesOf(CAROL)).toBe(carolFetches);
        expect(interviews.openFor(BOB)).toBeUndefined();
      } finally {
        release();
      }
    });

    test("a presence update for a Member whose Interview is being started at startup opens one thread", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(BOB);
      guild.setPresence(BOB, "online");
      FakeClient.served = guild;
      recordDailySyncRunToday();
      const threads = await holdThreadCreation(guild);

      try {
        connection = await connect(TOKEN, connectOptions());
        await vi.waitFor(() => {
          expect(threads.requested()).toBe(1);
        });

        presenceUpdate(BOB, "offline", "online");
        await settle();
        threads.release();

        await settle();
        expect(guild.createdThreads()).toHaveLength(1);
        expect(interviews.openFor(BOB)).toBeDefined();
      } finally {
        threads.release();
      }
    });

    test("a Member offline at startup gets no Interview, and one when they come online", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(BOB);
      guild.setPresence(BOB, "offline");
      FakeClient.served = guild;
      recordDailySyncRunToday();

      connection = await connect(TOKEN, connectOptions());
      await vi.waitFor(() => {
        expect(guild.rolesOf(BOB)).toContain(ONBOARDING_ROLE_NAME);
      });
      await settle();
      expect(interviews.openFor(BOB)).toBeUndefined();
      expect(logLines(guild).some((line) => line.startsWith("Onboarding Interviews at startup: "))).toBe(false);

      presenceUpdate(BOB, "offline", "online");

      await vi.waitFor(() => {
        expect(interviews.openFor(BOB)).toBeDefined();
      });
      expect(guild.createdThreads()).toHaveLength(1);
    });

    test("an Interview abandoned while the Member stays online starts nothing until they next come online", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(BOB);
      guild.setPresence(BOB, "online");
      FakeClient.served = guild;
      recordDailySyncRunToday();

      connection = await connect(TOKEN, connectOptions());
      await vi.waitFor(() => {
        expect(interviews.openFor(BOB)).toBeDefined();
      });
      const open = interviews.openFor(BOB);
      if (open === undefined) throw new Error("the test Member has no open Interview");
      interviews.save(timeOut(open, NOW).interview);
      expect(interviews.openFor(BOB)).toBeUndefined();

      presenceUpdate(BOB, "online", "idle");
      await settle();
      expect(interviews.openFor(BOB)).toBeUndefined();

      presenceUpdate(BOB, "idle", "offline");
      presenceUpdate(BOB, "offline", "online");
      await vi.waitFor(() => {
        expect(interviews.openFor(BOB)).toBeDefined();
      });
      expect(guild.createdThreads()).toHaveLength(2);
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
      { link: { memberId: BOB, uid: BOB_UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } },
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
      { link: { memberId: BOB, uid: BOB_UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } },
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

  describe("the Event invitations and reminders", () => {
    /** A scheduled event as discord.js gives it, in the served guild, starting after the test's clock. */
    function discordEvent(overrides: Partial<ConnectScheduledEvent> = {}): ConnectScheduledEvent {
      return {
        id: EVENT_ID,
        guildId: GUILD_ID,
        name: "Hive move",
        scheduledStartTimestamp: Date.parse("2026-11-20T18:00:00Z"),
        description: null,
        status: GuildScheduledEventStatus.Scheduled,
        creatorId: ALICE,
        ...overrides,
      };
    }

    /**
     * The served guild with #event-announcements, and Alice as an Officer (a Moderator), so a Kingdom Event she creates may
     * be invited. Connect is given the Moderator role's id from the guild, not the configured one.
     */
    function eventGuild(): { guild: FakeConnectGuild; officerRoleIds: readonly [string, string] } {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.addChannel(ANNOUNCEMENTS_CHANNEL_ID, { type: ChannelType.GuildText, name: "event-announcements" });
      const moderator = guild.defineRole("Moderator");
      guild.join(ALICE, ["Moderator"]);
      FakeClient.served = guild;
      recordDailySyncRunToday();
      return { guild, officerRoleIds: [moderator.id, KING_ROLE_ID] };
    }

    /** Emits a Discord event on the client connect created. */
    function emitDiscord(event: string, ...args: readonly unknown[]): void {
      const client = FakeClient.latest;
      if (client === undefined) throw new Error("connect created no client");
      client.emit(event, ...args);
    }

    test("invites a new Event to #event-announcements when Discord reports it created", async () => {
      const { guild, officerRoleIds } = eventGuild();
      connection = await connect(TOKEN, { ...connectOptions(), officerRoleIds });

      emitDiscord(Events.GuildScheduledEventCreate, discordEvent());

      await vi.waitFor(() => {
        expect(guild.messagesIn(ANNOUNCEMENTS_CHANNEL_ID)).toHaveLength(1);
      });
    });

    test("invites an edited Event that has no invitation yet, when Discord reports the edit", async () => {
      const { guild, officerRoleIds } = eventGuild();
      connection = await connect(TOKEN, { ...connectOptions(), officerRoleIds });

      emitDiscord(Events.GuildScheduledEventUpdate, null, discordEvent({ name: "Hive move, later" }));

      await vi.waitFor(() => {
        expect(guild.messagesIn(ANNOUNCEMENTS_CHANNEL_ID)).toHaveLength(1);
      });
    });

    test("invites the Events still ahead at startup, when Neil starts", async () => {
      const { guild, officerRoleIds } = eventGuild();
      guild.setScheduledEvents([discordEvent()]);

      connection = await connect(TOKEN, { ...connectOptions(), officerRoleIds });

      await vi.waitFor(() => {
        expect(guild.messagesIn(ANNOUNCEMENTS_CHANNEL_ID)).toHaveLength(1);
      });
    });

    test("forgets an Event's rows when Discord reports it deleted", async () => {
      const { officerRoleIds } = eventGuild();
      events.recordFirstSeen(EVENT_ID, NOW.toISOString());
      connection = await connect(TOKEN, { ...connectOptions(), officerRoleIds });

      emitDiscord(Events.GuildScheduledEventDelete, discordEvent());

      await vi.waitFor(() => {
        expect(events.findEvent(EVENT_ID)).toBeUndefined();
      });
    });

    test("lists the scheduled events once a minute, and not once Neil has disconnected", async () => {
      const { guild, officerRoleIds } = eventGuild();
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      try {
        connection = await connect(TOKEN, { ...connectOptions(), officerRoleIds });
        await vi.waitFor(() => {
          expect(guild.scheduledListings).toBe(1);
        });

        await vi.advanceTimersByTimeAsync(60_000);
        expect(guild.scheduledListings).toBe(2);

        await connection.disconnect();
        connection = undefined;
        await vi.advanceTimersByTimeAsync(5 * 60_000);
        expect(guild.scheduledListings).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("/reaper", () => {
    /** Alice is Linked to a Player of her own, is a Home Kingdom R5, and is applied in the Home Kingdom. */
    function linkR5Alice(): void {
      links.confirm(
        { link: { memberId: ALICE, uid: ALICE_UID, linkedAt: NOW, allianceRank: { source: "game-api", rank: "R5" }, madeBy: { kind: "in-game-proof" } } },
        () => undefined,
      );
      applied.record({ memberId: ALICE, nickname: "Rogue", roles: [], appliedAt: NOW, complete: true, alliance: { kingdom: HOME_KINGDOM, tag: "ASH" } });
    }

    /** Delivers an interaction to the client connect created, as Discord does. */
    function deliver(interaction: unknown): void {
      const client = FakeClient.latest;
      if (client === undefined) throw new Error("connect created no client");
      client.emit(Events.InteractionCreate, interaction);
    }

    /** A /reaper command as discord.js hands it to connect: its subcommand, and the reply methods of the fake that answers it. */
    function reaperCommandOf(interaction: FakeReaperInteraction, subcommand: string) {
      return Object.assign(interaction, {
        commandName: "reaper",
        isChatInputCommand: () => true,
        isAutocomplete: () => false,
        isButton: () => false,
        isStringSelectMenu: () => false,
        isModalSubmit: () => false,
        options: { ...interaction.options, getSubcommand: () => subcommand },
      });
    }

    /** A string select menu press as discord.js hands it to connect. */
    function selectOf(interaction: FakePickInteraction) {
      return Object.assign(interaction, {
        isChatInputCommand: () => false,
        isAutocomplete: () => false,
        isButton: () => false,
        isStringSelectMenu: () => true,
        isModalSubmit: () => false,
      });
    }

    /** The session id of the pick list an add answered with, read from its select menu's custom id. */
    function pickSessionIdOf(interaction: FakeReaperInteraction): string {
      const match = /"custom_id":"pick:([^:"]+):select"/.exec(JSON.stringify(interaction.calls));
      const sessionId = match?.[1];
      if (sessionId === undefined) throw new Error("the add did not answer with a pick list");
      return sessionId;
    }

    test("/reaper list answers privately with the Exiles of the REAPER store the bot is given", async () => {
      const reasoned = exileReasonOf("Hoarding gold");
      if (!reasoned.ok) throw new Error("the test reason must be accepted");
      const exile: Exile = {
        uid: UID,
        name: "Vex",
        kingdom: HOME_KINGDOM,
        lastPosition: undefined,
        reason: reasoned.value,
        addedAt: NOW,
        addedBy: BOB,
      };
      reaper.add(exile);
      FakeClient.served = serverWith(SERVER_PERMISSIONS);
      recordDailySyncRunToday();
      connection = await connect(TOKEN, connectOptions());
      const list = new FakeReaperInteraction({}, ALICE);

      deliver(reaperCommandOf(list, "list"));

      await vi.waitFor(() => {
        expect(JSON.stringify(list.calls)).toContain("Vex");
      });
    });

    test("an Exile picked from the pick list of /reaper add is stored in REAPER with the reason typed, and logged", async () => {
      const guild = serverWith(SERVER_PERMISSIONS);
      guild.join(ALICE);
      FakeClient.served = guild;
      linkR5Alice();
      recordDailySyncRunToday();
      gameApi.ambiguousMatches = VEX_MATCHES;
      gameApi.player = VEX;
      connection = await connect(TOKEN, connectOptions());
      const add = new FakeReaperInteraction({ strings: { name: "Vex", reason: "Hoarding gold" } }, ALICE);
      deliver(reaperCommandOf(add, "add"));
      const sessionId = await vi.waitFor(() => pickSessionIdOf(add));

      // The pick list orders the matches by Kingdom, so the Kingdom 330 Vex is the second option.
      deliver(selectOf(new FakePickInteraction({ customId: `pick:${sessionId}:select`, userId: ALICE, values: ["1"] })));

      await vi.waitFor(() => {
        expect(reaper.find(UID)).toBeDefined();
      });
      expect(reaper.find(UID)).toMatchObject({ name: "Vex", reason: "Hoarding gold", addedBy: ALICE });
      expect(guild.messagesIn(LOG_CHANNEL_ID).join("\n")).toContain("Vex");
    });

    test("a /reaper list whose answer Discord refuses is logged, not left as an unhandled rejection", async () => {
      FakeClient.served = serverWith(SERVER_PERMISSIONS);
      recordDailySyncRunToday();
      connection = await connect(TOKEN, connectOptions());
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      try {
        const list = new FakeReaperInteraction({}, ALICE);
        list.editReply = () => Promise.reject(new Error("Discord refused the reply"));
        deliver(reaperCommandOf(list, "list"));

        await vi.waitFor(() => {
          expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("/reaper list"));
        });
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("a /reaper page button whose reply Discord refuses is logged, not left as an unhandled rejection", async () => {
      FakeClient.served = serverWith(SERVER_PERMISSIONS);
      recordDailySyncRunToday();
      connection = await connect(TOKEN, connectOptions());
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      try {
        const press = new FakeReaperPageInteraction({ customId: "reaper:0123456789abcdef:page:1", userId: ALICE });
        press.reply = () => Promise.reject(new Error("Discord refused the reply"));
        deliver(
          Object.assign(press, {
            isChatInputCommand: () => false,
            isAutocomplete: () => false,
            isButton: () => true,
            isStringSelectMenu: () => false,
            isModalSubmit: () => false,
          }),
        );

        await vi.waitFor(() => {
          expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("/reaper page"));
        });
      } finally {
        errorSpy.mockRestore();
      }
    });
  });
});
