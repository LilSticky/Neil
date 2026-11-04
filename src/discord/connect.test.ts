import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChannelType, Events, PermissionFlagsBits } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { todaysQuota, utcDayOf, type RequestPurpose } from "../domain/daily-quota.js";
import { ONBOARDING_ROLE_NAME } from "../domain/onboarding-role.js";
import { exileReasonOf, type Exile } from "../domain/exile.js";
import { parseUid, parseKingdom, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Alliance, LookupResult, Match, Player } from "../domain/player.js";
import { recordStart } from "../domain/start-record.js";
import { AppliedStore } from "../storage/applied-store.js";
import { DailySyncStore } from "../storage/daily-sync-store.js";
import { openDatabase } from "../storage/database.js";
import { InterviewStore } from "../storage/interview-store.js";
import { KnownAllianceStore } from "../storage/known-alliance-store.js";
import { LinkStore } from "../storage/link-store.js";
import { ReaperStore } from "../storage/reaper-store.js";
import { createPreferenceStore, type PreferenceStore } from "../storage/preference-store.js";
import { FakeConnectGuild } from "./__fakes__/connect-guild.js";
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
  let reaper: ReaperStore;
  let preferences: PreferenceStore;
  let gameApi: FakeGameApi;
  let connection: { disconnect(): Promise<void> } | undefined;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-connect-"));
    db = openDatabase(dataDir);
    links = new LinkStore(db);
    applied = new AppliedStore(db);
    interviews = new InterviewStore(db, INTERVIEW_TIMEOUT_MS);
    dailySync = new DailySyncStore(db);
    reaper = new ReaperStore(db);
    preferences = createPreferenceStore(db);
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
      reaper,
      preferences,
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
