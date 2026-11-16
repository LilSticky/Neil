// Neil Police's overwrites in the setup run (issue #127): the settings decision, the writes and the report lines.
import { PermissionFlagsBits } from "discord.js";
import { describe, expect, test } from "vitest";
import type { ServerLayout } from "../domain/server-layout.js";
import { FakeSetupServer } from "./__fakes__/setup-server.js";
import { policeSetupFor, runSetup, type OverwriteEdit } from "./server-setup.js";

const HOME_KINGDOM = 330;
const GUILD_ID = "100000000000000000";
const OTHER_GUILD_ID = "100000000000000001";
const POLICE_ROLE_ID = "400000000000000000";
const ADMINISTRATOR = PermissionFlagsBits.Administrator;
const VIEW = PermissionFlagsBits.ViewChannel;
const SEND = PermissionFlagsBits.SendMessages;
const HISTORY = PermissionFlagsBits.ReadMessageHistory;
const ROLE_OVERWRITE = 0;
const SKIP_LINE = "NEIL_POLICE_ROLE_ID is set, but this server is not in NEIL_POLICE_GUILD_IDS: no overwrites for Neil Police.";

const layout: ServerLayout = {
  roles: ["Moderator", "King", "#<Home Kingdom>"],
  externalRoles: [],
  languages: [],
  translations: [],
  categories: [
    {
      name: "Officers",
      seenBy: ["Moderator", "King"],
      channels: [
        {
          name: "neil-log",
          type: "text",
          description: "What Neil did.",
          mode: "read-only",
          overwrites: { Neil: { allow: ["ViewChannel", "SendMessages"], deny: [] } },
        },
      ],
    },
    {
      name: "Info",
      seenBy: ["#<Home Kingdom>"],
      channels: [{ name: "news", type: "text", description: "News for all.", seenBy: ["@everyone"] }],
    },
  ],
  allianceArea: { channels: [] },
};

function lines(report: string): string[] {
  return report.split("\n");
}

describe("policeSetupFor", () => {
  test("gives no Police when NEIL_POLICE_ROLE_ID is unset or blank", () => {
    expect(policeSetupFor({ NEIL_POLICE_GUILD_IDS: GUILD_ID }, GUILD_ID)).toEqual({ kind: "none" });
    expect(policeSetupFor({ NEIL_POLICE_ROLE_ID: "  ", NEIL_POLICE_GUILD_IDS: GUILD_ID }, GUILD_ID)).toEqual({ kind: "none" });
  });

  test("gives the role id when the server is listed in NEIL_POLICE_GUILD_IDS", () => {
    const env = { NEIL_POLICE_ROLE_ID: ` ${POLICE_ROLE_ID} `, NEIL_POLICE_GUILD_IDS: ` ${OTHER_GUILD_ID} , ,${GUILD_ID} ` };
    expect(policeSetupFor(env, GUILD_ID)).toEqual({ kind: "role", roleId: POLICE_ROLE_ID });
  });

  test("is skipped when the server is not listed, or the list is empty", () => {
    expect(policeSetupFor({ NEIL_POLICE_ROLE_ID: POLICE_ROLE_ID, NEIL_POLICE_GUILD_IDS: OTHER_GUILD_ID }, GUILD_ID)).toEqual({ kind: "skipped" });
    expect(policeSetupFor({ NEIL_POLICE_ROLE_ID: POLICE_ROLE_ID, NEIL_POLICE_GUILD_IDS: "" }, GUILD_ID)).toEqual({ kind: "skipped" });
    expect(policeSetupFor({ NEIL_POLICE_ROLE_ID: POLICE_ROLE_ID }, GUILD_ID)).toEqual({ kind: "skipped" });
  });

  test("refuses a malformed role id, naming the setting but not the value", () => {
    const run = (): unknown => policeSetupFor({ NEIL_POLICE_ROLE_ID: "police-role", NEIL_POLICE_GUILD_IDS: GUILD_ID }, GUILD_ID);
    expect(run).toThrow(/NEIL_POLICE_ROLE_ID/);
    expect(run).not.toThrow(/police-role/);
  });
});

/** A test server with the layout's roles, Police's role, and the Officers category carrying an overwrite the layout doesn't name. */
function testServer(withPoliceRole = true): { server: FakeSetupServer; extra: OverwriteEdit; officersId: string } {
  const server = new FakeSetupServer({ guildId: GUILD_ID, botPermissions: ADMINISTRATOR });
  const moderator = server.defineRole("Moderator");
  server.defineRole("King");
  server.defineRole("#330");
  if (withPoliceRole) server.defineRole("Police");
  const extra: OverwriteEdit = { targetId: moderator, type: ROLE_OVERWRITE, allow: VIEW | SEND, deny: 0n };
  const officersId = server.defineChannel("Officers", { kind: "category", overwrites: [extra] });
  return { server, extra, officersId };
}

/** The id the fake gave Police's role. */
function policeRoleIdOf(server: FakeSetupServer): Promise<string> {
  return server.readRoles().then((roles) => {
    const police = roles.find((role) => role.name === "Police");
    if (police === undefined) throw new Error("no Police role");
    return police.id;
  });
}

describe("runSetup with Neil Police's role", () => {
  test("writes Police's overwrites as role overwrites, keeps the others, and a second run has nothing to do", async () => {
    const { server, extra, officersId } = testServer();
    const roleId = await policeRoleIdOf(server);
    const police = { kind: "role", roleId } as const;

    const first = await runSetup({ layout, homeKingdom: HOME_KINGDOM, apply: true, port: server, secrets: [], police });
    expect(first.exitCode).toBe(0);

    const policeEdit = { targetId: roleId, type: ROLE_OVERWRITE, allow: VIEW | HISTORY, deny: 0n };
    const officers = server.writes.find((write) => write.op === "edit-overwrites" && write.channelId === officersId);
    expect(officers?.op === "edit-overwrites" ? officers.overwrites : []).toEqual(expect.arrayContaining([extra, policeEdit]));
    const neilLog = server.writes.find((write) => write.op === "create-channel" && write.name === "neil-log");
    expect(neilLog?.op === "create-channel" ? neilLog.overwrites : []).toContainEqual(policeEdit);
    const news = server.writes.find((write) => write.op === "create-channel" && write.name === "news");
    expect(news?.op === "create-channel" ? news.overwrites.map((overwrite) => overwrite.targetId) : [roleId]).not.toContain(roleId);

    const second = await runSetup({ layout, homeKingdom: HOME_KINGDOM, apply: false, port: server, secrets: [], police });
    expect(lines(second.report)).toContain("Nothing to do.");
  });

  test("says Police was skipped on a server not in NEIL_POLICE_GUILD_IDS and writes no Police overwrite", async () => {
    const { server } = testServer();
    const roleId = await policeRoleIdOf(server);

    const { report, exitCode } = await runSetup({
      layout,
      homeKingdom: HOME_KINGDOM,
      apply: true,
      port: server,
      secrets: [],
      police: { kind: "skipped" },
    });

    expect(lines(report)).toContain(SKIP_LINE);
    const targets = server.writes.flatMap((write) => ("overwrites" in write ? write.overwrites.map((overwrite) => overwrite.targetId) : []));
    expect(targets).not.toContain(roleId);
    expect(exitCode).toBe(0);
  });

  test("says when Police's role is not on the server and plans no overwrite for it", async () => {
    const { server } = testServer(false);

    const { report, exitCode } = await runSetup({
      layout,
      homeKingdom: HOME_KINGDOM,
      apply: false,
      port: server,
      secrets: [],
      police: { kind: "role", roleId: POLICE_ROLE_ID },
    });

    expect(lines(report)).toContain(
      `Neil Police's role (NEIL_POLICE_ROLE_ID ${POLICE_ROLE_ID}) is not on this server; no overwrites for it`,
    );
    expect(report).not.toContain(SKIP_LINE);
    expect(exitCode).toBe(0);
  });

  test("leaves the report without Police lines when Police is left out", async () => {
    const { server } = testServer();
    const { report } = await runSetup({ layout, homeKingdom: HOME_KINGDOM, apply: false, port: server, secrets: [] });
    expect(report).not.toMatch(/Neil Police|NEIL_POLICE/);
  });
});
