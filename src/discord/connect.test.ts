import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { todaysQuota, type RequestPurpose } from "../domain/daily-quota.js";
import { parseUid, parseKingdom, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Alliance, LookupResult, Player } from "../domain/player.js";
import { recordStart } from "../domain/start-record.js";
import { AppliedStore } from "../storage/applied-store.js";
import { openDatabase } from "../storage/database.js";
import { InterviewStore } from "../storage/interview-store.js";
import { KnownAllianceStore } from "../storage/known-alliance-store.js";
import { LinkStore } from "../storage/link-store.js";
import { FakeConnectGuild } from "./__fakes__/connect-guild.js";
import { FakeClient } from "./__fakes__/discord-client.js";
import { connect, type ConnectOptions } from "./client.js";

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

  getPlayer(uid: Uid, purpose: RequestPurpose): Promise<LookupResult<Player>> {
    this.lookups.push({ uid, purpose });
    return Promise.resolve({ kind: "not-found" });
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
  let gameApi: FakeGameApi;
  let connection: { disconnect(): Promise<void> } | undefined;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-connect-"));
    db = openDatabase(dataDir);
    links = new LinkStore(db);
    applied = new AppliedStore(db);
    interviews = new InterviewStore(db, INTERVIEW_TIMEOUT_MS);
    gameApi = new FakeGameApi();
    connection = undefined;
    FakeClient.served = undefined;
  });

  afterEach(async () => {
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

  function connectOptions(): ConnectOptions {
    return {
      buildInfo: "dev",
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
    };
  }

  test("looks each Linked Member without a complete apply up once, after the channels are checked", async () => {
    const guild = serverWith(SERVER_PERMISSIONS);
    guild.join(ALICE);
    FakeClient.served = guild;
    linkAlice();

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
});
