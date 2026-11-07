/*
 * Contract for src/discord/server-setup.ts (slice 020, tasks T008 to T012, research R4, R7, contracts/cli.md).
 *
 * The port the script talks to (SetupServer). Permission fields are Discord bit fields as bigint; the domain names them.
 *
 *   interface GuildInfo { id: string; features: readonly string[] }                // "COMMUNITY" among features; id = @everyone's id
 *   interface BotMemberInfo { userId: string; roleIds: readonly string[] }        // Neil's user id and the roles its member holds
 *   interface SetupRoleInfo { id: string; name: string; permissions: bigint; managed: boolean; position: number }
 *   interface OverwriteEdit { type: 0 | 1; targetId: string; allow: bigint; deny: bigint }    // targetId: role id, guild id (@everyone), bot user id
 *   interface SetupChannelInfo {
 *     id: string; name: string; kind: "category" | ChannelType; parentId: string | undefined; overwrites: OverwriteEdit[];
 *   }
 *   interface SetupServer {
 *     readGuild(): Promise<GuildInfo>;
 *     readBotMember(): Promise<BotMemberInfo>;
 *     readRoles(): Promise<readonly SetupRoleInfo[]>;
 *     readChannels(): Promise<readonly SetupChannelInfo[]>;
 *     createRole(name: string): Promise<string>;                                  // resolves to the new role's id
 *     createCategory(name: string, overwrites: readonly OverwriteEdit[]): Promise<string>;     // resolves to the id
 *     createChannel(channel: { name: string; type: ChannelType; parentId: string; overwrites: readonly OverwriteEdit[] }): Promise<string>;
 *     editOverwrites(channelId: string, overwrites: readonly OverwriteEdit[]): Promise<void>;   // the channel's whole list, one write
 *   }
 *
 * Exports the tests use:
 *   parseLayout(text: string): ServerLayout                  throws an Error whose message names the place of a mistake
 *   readServer(port: SetupServer): Promise<ServerState>      ServerState from ./../domain/setup-plan.ts
 *   applySetup(plan: SetupPlan, port: SetupServer): Promise<StepOutcome[]>
 *       StepOutcome = { step: SetupStep; status: "done" } | { step: SetupStep; status: "failed"; reason: string }
 *   runSetup(options: { layout: ServerLayout; homeKingdom: number; apply: boolean; port: SetupServer; secrets: readonly string[] })
 *       : Promise<{ report: string; exitCode: 0 | 1 }>
 *       a real run without Administrator on Neil writes nothing and exits 1; `secrets` are values the report never prints.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PermissionFlagsBits } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import { GAME_LANGUAGES } from "../domain/preferences.js";
import {
  expandLayout,
  type ExpandedCategory,
  type ExpandedChannel,
  type LayoutChannel,
  type ServerLayout,
  type WantedOverwrite,
} from "../domain/server-layout.js";
import { planSetup, type ServerState, type SetupPlan } from "../domain/setup-plan.js";
import { FakeSetupServer, type ChannelWrite, type SetupWrite, type SetupWriteOp } from "./__fakes__/setup-server.js";
import { applySetup, parseLayout, readServer, runSetup, type SetupChannelInfo } from "./server-setup.js";

const HOME_KINGDOM = 330;
const KINGDOM_ROLE = "#330";
const GUILD_ID = "200000000000000000";
const BOT_USER_ID = "300000000000000000";
const TOKEN = "MTIzNDU2Nzg5.Fake-Token.do-not-print";
const LAST_LINE = "Now take Administrator off Neil's role.";

const VIEW = PermissionFlagsBits.ViewChannel;
const SEND = PermissionFlagsBits.SendMessages;
const MANAGE_MESSAGES = PermissionFlagsBits.ManageMessages;
const CREATE_PUBLIC_THREADS = PermissionFlagsBits.CreatePublicThreads;
const MANAGE_ROLES = PermissionFlagsBits.ManageRoles;
const ADMINISTRATOR = PermissionFlagsBits.Administrator;
const EMBED_LINKS = PermissionFlagsBits.EmbedLinks;

/** The layout file as text, built from a base that follows every rule; `overrides` replace top-level keys. */
function layoutFile(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...BASE_LAYOUT, ...overrides });
}

function hangout(channels: unknown[], seenBy: unknown[] = ["#<Home Kingdom>"]): unknown[] {
  return [{ name: "Hangout", seenBy, channels }];
}

const BASE_LAYOUT = {
  roles: ["Moderator", "King", "Doctor", "R5", "PvP", "#<Home Kingdom>"],
  externalRoles: ["Interaction Bot"],
  languages: ["English"],
  translations: [],
  categories: hangout([{ name: "general", type: "text", description: "A test channel." }]),
  allianceArea: { channels: [{ name: "alliance-chat", type: "text", description: "A test channel." }] },
};

/** The error message of a layout file the parser refuses; fails the test when the parser accepts it. */
function refusal(text: string): string {
  try {
    parseLayout(text);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the layout to be refused");
}

function shippedLayoutText(): string {
  return readFileSync(fileURLToPath(new URL("../../server-layout.json", import.meta.url)), "utf8");
}

function shippedLayout(): ServerLayout {
  return parseLayout(shippedLayoutText());
}

/** The roles a category's own overwrites let see it. */
function categoryViewers(category: ExpandedCategory): string[] {
  return category.overwrites.filter((overwrite) => overwrite.allow.includes("ViewChannel")).map((overwrite) => overwrite.target);
}

/** The roles a channel's own overwrites let see it. */
function channelViewers(channel: ExpandedChannel): string[] {
  return channel.overwrites.filter((overwrite) => overwrite.allow.includes("ViewChannel")).map((overwrite) => overwrite.target);
}

/** The categories (and the channels in them) that let a role see something, from the expanded layout. */
function viewersOf(category: ExpandedCategory): string[] {
  const lists = [category.overwrites, ...category.channels.map((channel) => channel.overwrites)];
  return [...new Set(lists.flatMap((list) => list.filter((overwrite) => overwrite.allow.includes("ViewChannel")).map((o) => o.target)))];
}

function groupNamed(expanded: ReturnType<typeof expandLayout>, name: string): ExpandedCategory {
  const found = expanded.categories.find((category) => category.name === name);
  if (found === undefined) throw new Error(`no category named ${name}`);
  return found;
}

function roleId(server: FakeSetupServer, name: string): string {
  const role = server.findRole(name);
  if (role === undefined) throw new Error(`no role named ${name}`);
  return role.id;
}

function channelId(server: FakeSetupServer, name: string): string {
  const channel = server.findChannel(name);
  if (channel === undefined) throw new Error(`no channel named ${name}`);
  return channel.id;
}

/** The writes of one kind, in order, typed as that kind. */
function writesOf<Op extends SetupWriteOp>(server: FakeSetupServer, op: Op): Extract<SetupWrite, { op: Op }>[] {
  return server.writes.filter((write): write is Extract<SetupWrite, { op: Op }> => write.op === op);
}

function planFor(layout: ServerLayout, server: FakeSetupServer): Promise<SetupPlan> {
  return readServer(server).then((state: ServerState) => planSetup(layout, state, HOME_KINGDOM));
}

/** The report's lines, and the index of the first line matching a predicate (-1 when none does). */
function lines(report: string): string[] {
  return report.split("\n");
}

function indexWhere(report: string, predicate: (line: string) => boolean): number {
  return lines(report).findIndex(predicate);
}

function lastLine(report: string): string | undefined {
  return lines(report).filter((line) => line.trim() !== "").at(-1);
}

const EMPTY_LAYOUT: ServerLayout = {
  roles: [],
  externalRoles: [],
  languages: [],
  translations: [],
  categories: [],
  allianceArea: { channels: [] },
};

const APPLY_LAYOUT: ServerLayout = {
  roles: ["Moderator", "King", "Doctor", "R5", KINGDOM_ROLE],
  externalRoles: [],
  languages: [],
  translations: [],
  categories: [
    {
      name: "Hangout",
      seenBy: [KINGDOM_ROLE],
      channels: [
        { name: "general", type: "text", description: "A test channel.", seenBy: ["R5"] },
        { name: "rules", type: "text", description: "A test channel.", mode: "read-only" },
      ],
    },
    {
      name: "Onboarding",
      seenBy: ["Moderator", "King"],
      channels: [{ name: "onboarding", type: "text", description: "A test channel.", overwrites: { Neil: { allow: ["ViewChannel"], deny: [] } } }],
    },
  ],
  allianceArea: { channels: [] },
};

describe("parseLayout", () => {
  test("accepts a layout that follows every rule", () => {
    const text = layoutFile({
      categories: [
        {
          name: "Basic information",
          seenBy: ["#<Home Kingdom>"],
          channels: [
            { name: "rules", type: "text", description: "A test channel.", mode: "read-only" },
            { name: "kvk-announcements", type: "announcement", description: "A test channel.", mode: "only-king-posts", translated: true },
            { name: "onboarding", type: "text", description: "A test channel.", overwrites: { Neil: { allow: ["ViewChannel"], deny: [] } } },
          ],
        },
        { name: "PvP", seenBy: ["PvP"], channels: [{ name: "tactics", type: "forum", description: "A test channel.", seenBy: ["R5"] }] },
      ],
    });

    expect(() => parseLayout(text)).not.toThrow();
  });

  test("refuses a channel type that is not text, voice, forum or announcement, naming the channel", () => {
    const message = refusal(layoutFile({ categories: hangout([{ name: "general", type: "stage", description: "A test channel." }]) }));

    expect(message).toContain("Hangout");
    expect(message).toContain("general");
  });

  test("refuses a mode that is not read-only or only-king-posts, naming the channel", () => {
    const message = refusal(layoutFile({ categories: hangout([{ name: "general", type: "text", description: "A test channel.", mode: "read-write" }]) }));

    expect(message).toContain("Hangout");
    expect(message).toContain("general");
  });

  test("refuses a seenBy target that is no listed role, external role, @everyone or Neil, naming the channel", () => {
    const message = refusal(layoutFile({ categories: hangout([{ name: "general", type: "text", description: "A test channel.", seenBy: ["Ghost"] }]) }));

    expect(message).toContain("Hangout");
    expect(message).toContain("general");
  });

  test("refuses an overwrite target that is no listed role, external role, @everyone or Neil, naming the channel", () => {
    const message = refusal(
      layoutFile({
        categories: hangout([{ name: "general", type: "text", description: "A test channel.", overwrites: { Ghost: { allow: ["ViewChannel"], deny: [] } } }]),
      }),
    );

    expect(message).toContain("Hangout");
    expect(message).toContain("general");
  });

  test("refuses a permission name that is not a known one, naming the channel", () => {
    const message = refusal(
      layoutFile({
        categories: hangout([{ name: "general", type: "text", description: "A test channel.", overwrites: { Neil: { allow: ["ViewChanel"], deny: [] } } }]),
      }),
    );

    expect(message).toContain("Hangout");
    expect(message).toContain("general");
  });

  test("refuses two categories with one name, naming the category", () => {
    const message = refusal(
      layoutFile({
        categories: [
          { name: "Hangout", seenBy: ["#<Home Kingdom>"], channels: [{ name: "general", type: "text", description: "A test channel." }] },
          { name: "Hangout", seenBy: ["#<Home Kingdom>"], channels: [{ name: "rules", type: "text", description: "A test channel." }] },
        ],
      }),
    );

    expect(message).toContain("Hangout");
  });

  test("refuses one channel name used in two categories, naming the channel", () => {
    const message = refusal(
      layoutFile({
        categories: [
          { name: "Hangout", seenBy: ["#<Home Kingdom>"], channels: [{ name: "general", type: "text", description: "A test channel." }] },
          { name: "Events", seenBy: ["Doctor"], channels: [{ name: "general", type: "text", description: "A test channel." }] },
        ],
      }),
    );

    expect(message).toContain("general");
  });

  test("refuses a channel name with capital letters, naming the channel", () => {
    const message = refusal(layoutFile({ categories: hangout([{ name: "General", type: "text", description: "A test channel." }]) }));

    expect(message).toContain("Hangout");
    expect(message).toContain("General");
  });

  test("refuses a channel name with a space, naming the channel", () => {
    const message = refusal(layoutFile({ categories: hangout([{ name: "guest rules", type: "text", description: "A test channel." }]) }));

    expect(message).toContain("Hangout");
    expect(message).toContain("guest rules");
  });

  test("accepts overwrites on an alliance-chat channel of the Alliance area and keeps them", () => {
    const text = layoutFile({
      allianceArea: {
        channels: [
          { name: "alliance-chat", type: "text", description: "A test channel.", overwrites: { Neil: { allow: ["ViewChannel", "SendMessages"] } } },
          { name: "alliance-voice", type: "voice", description: "A test channel." },
        ],
      },
    });

    const chat = parseLayout(text).allianceArea.channels.find((channel) => channel.name === "alliance-chat");
    expect(chat?.overwrites).toEqual({ Neil: { allow: ["ViewChannel", "SendMessages"], deny: [] } });
  });

  test("accepts EmbedLinks as an overwrite permission on alliance-chat and keeps it", () => {
    const text = layoutFile({
      allianceArea: {
        channels: [
          { name: "alliance-chat", type: "text", description: "A test channel.", overwrites: { Neil: { allow: ["ViewChannel", "SendMessages", "EmbedLinks"] } } },
          { name: "alliance-voice", type: "voice", description: "A test channel." },
        ],
      },
    });

    const chat = parseLayout(text).allianceArea.channels.find((channel) => channel.name === "alliance-chat");
    expect(chat?.overwrites).toEqual({ Neil: { allow: ["ViewChannel", "SendMessages", "EmbedLinks"], deny: [] } });
  });

  test("refuses an overwrite target in the Alliance area that is no listed role, naming the channel", () => {
    const message = refusal(
      layoutFile({
        allianceArea: {
          channels: [{ name: "alliance-chat", type: "text", description: "A test channel.", overwrites: { Ghost: { allow: ["ViewChannel"] } } }],
        },
      }),
    );

    expect(message).toContain("alliance-chat");
    expect(message).toContain("Ghost");
  });
});

const DESCRIPTION = "Talk about anything.";

/** A layout file for the description and translation rules: one Hangout channel, languages with Russian, no translations. */
function describedLayoutFile(channel: unknown, overrides: Record<string, unknown> = {}): string {
  return layoutFile({ languages: ["English", "Russian"], translations: [], categories: hangout([channel]), ...overrides });
}

function channelNamed(layout: ServerLayout, name: string): LayoutChannel {
  const channels = [...layout.categories.flatMap((category) => category.channels), ...layout.allianceArea.channels];
  const found = channels.find((channel) => channel.name === name);
  if (found === undefined) throw new Error(`no channel named ${name}`);
  return found;
}

describe("parseLayout descriptions, code of conduct and translations", () => {
  test("accepts a channel description and returns it on the parsed channel", () => {
    const text = describedLayoutFile({ name: "general", type: "text", description: DESCRIPTION });

    expect(channelNamed(parseLayout(text), "general").description).toBe(DESCRIPTION);
  });

  test("accepts a description of exactly 1024 characters", () => {
    const text = describedLayoutFile({ name: "general", type: "text", description: "x".repeat(1024) });

    expect(() => parseLayout(text)).not.toThrow();
  });

  test("accepts a codeOfConduct list on a channel and returns it on the parsed channel", () => {
    const text = describedLayoutFile({
      name: "general",
      type: "text",
      description: DESCRIPTION,
      codeOfConduct: ["Be kind.", "No spam."],
    });

    expect(channelNamed(parseLayout(text), "general").codeOfConduct).toEqual(["Be kind.", "No spam."]);
  });

  test("refuses a channel without description, naming the category and channel", () => {
    const message = refusal(describedLayoutFile({ name: "general", type: "text" }));

    expect(message).toContain("Hangout");
    expect(message).toContain("general");
  });

  test("refuses an empty description, naming the category and channel", () => {
    const message = refusal(describedLayoutFile({ name: "general", type: "text", description: "" }));

    expect(message).toContain("Hangout");
    expect(message).toContain("general");
  });

  test("refuses a description over 1024 characters, naming the category and channel", () => {
    const message = refusal(describedLayoutFile({ name: "general", type: "text", description: "x".repeat(1025) }));

    expect(message).toContain("Hangout");
    expect(message).toContain("general");
  });

  test("refuses an Alliance area channel without description, naming the channel", () => {
    const message = refusal(
      describedLayoutFile(
        { name: "general", type: "text", description: DESCRIPTION },
        { allianceArea: { channels: [{ name: "alliance-chat", type: "text" }] } },
      ),
    );

    expect(message).toContain("allianceArea");
    expect(message).toContain("alliance-chat");
  });

  test("refuses an Alliance area channel with a description over 1024 characters, naming the channel", () => {
    const message = refusal(
      describedLayoutFile(
        { name: "general", type: "text", description: DESCRIPTION },
        { allianceArea: { channels: [{ name: "alliance-chat", type: "text", description: "x".repeat(1025) }] } },
      ),
    );

    expect(message).toContain("allianceArea");
    expect(message).toContain("alliance-chat");
  });

  test("refuses a translated channel whose description with the longest translation's credit is over 1024 characters, naming the channel", () => {
    const longestCredit = " Translated into Russian by Interaction Bot.";
    const text = describedLayoutFile(
      { name: "kvk-announcements", type: "announcement", description: "x".repeat(1025 - longestCredit.length), mode: "only-king-posts", translated: true },
      { languages: ["English", "French", "Russian"], translations: ["French", "Russian"] },
    );

    const message = refusal(text);

    expect(message).toContain("Hangout");
    expect(message).toContain("kvk-announcements");
  });

  test.each([
    { label: "a leading space", description: " Talk about anything." },
    { label: "a trailing line break", description: "Talk about anything.\n" },
  ])("refuses a description with $label, naming the channel", ({ description }) => {
    const message = refusal(describedLayoutFile({ name: "general", type: "text", description }));

    expect(message).toContain("general");
    expect(message).toMatch(/spaces or line breaks/);
  });

  test("accepts translations that are listed languages and returns them on the parsed layout", () => {
    const text = describedLayoutFile({ name: "general", type: "text", description: DESCRIPTION }, { translations: ["Russian"] });

    expect(parseLayout(text).translations).toEqual(["Russian"]);
  });

  test("accepts an empty translations list", () => {
    const text = describedLayoutFile({ name: "general", type: "text", description: DESCRIPTION }, { translations: [] });

    expect(parseLayout(text).translations).toEqual([]);
  });

  test("refuses a layout without translations, naming translations", () => {
    const text = JSON.stringify({
      roles: ["Moderator"],
      externalRoles: [],
      languages: ["English"],
      categories: hangout([{ name: "general", type: "text", description: DESCRIPTION }]),
      allianceArea: { channels: [] },
    });

    expect(refusal(text)).toContain("translations");
  });

  test("refuses a translations entry that is not in languages, naming the entry", () => {
    const message = refusal(
      describedLayoutFile({ name: "general", type: "text", description: DESCRIPTION }, { translations: ["Italian"] }),
    );

    expect(message).toContain("Italian");
  });

  test("refuses a translations entry listed twice, naming the entry", () => {
    const message = refusal(
      describedLayoutFile({ name: "general", type: "text", description: DESCRIPTION }, { translations: ["Russian", "Russian"] }),
    );

    expect(message).toContain("Russian");
  });
});

describe("readServer", () => {
  test("reads the guild, Neil's user, and Community from the guild's features", async () => {
    const withCommunity = await readServer(new FakeSetupServer({ guildId: GUILD_ID, botUserId: BOT_USER_ID, features: ["COMMUNITY"] }));
    const withoutCommunity = await readServer(new FakeSetupServer({ guildId: GUILD_ID, botUserId: BOT_USER_ID, features: ["NEWS"] }));

    expect(withCommunity.everyoneId).toBe(GUILD_ID);
    expect(withCommunity.botUserId).toBe(BOT_USER_ID);
    expect(withCommunity.hasCommunity).toBe(true);
    expect(withoutCommunity.hasCommunity).toBe(false);
  });

  test("names the permissions of each overwrite from its bits, leaving out bits it does not know", async () => {
    const server = new FakeSetupServer();
    const r5 = server.defineRole("R5");
    server.defineChannel("general", {
      kind: "text",
      overwrites: [{ type: 0, targetId: r5, allow: VIEW | SEND | MANAGE_MESSAGES, deny: CREATE_PUBLIC_THREADS }],
    });

    const state = await readServer(server);
    const overwrite = state.channels.find((channel) => channel.name === "general")?.overwrites.find((o) => o.targetId === r5);

    expect(overwrite?.allow.slice().sort()).toEqual(["SendMessages", "ViewChannel"]);
    expect(overwrite?.deny).toEqual(["CreatePublicThreads"]);
  });

  test("names EmbedLinks from its bit, as a permission the layout may use", async () => {
    const server = new FakeSetupServer();
    const r5 = server.defineRole("R5");
    server.defineChannel("alliance-chat", {
      kind: "text",
      overwrites: [{ type: 0, targetId: r5, allow: VIEW | EMBED_LINKS, deny: 0n }],
    });

    const state = await readServer(server);
    const overwrite = state.channels.find((channel) => channel.name === "alliance-chat")?.overwrites.find((o) => o.targetId === r5);

    expect(overwrite?.allow.slice().sort()).toEqual(["EmbedLinks", "ViewChannel"]);
  });

  test("says whether each role holds any permission", async () => {
    const server = new FakeSetupServer();
    const moderator = server.defineRole("Moderator", { permissions: MANAGE_ROLES });
    const doctor = server.defineRole("Doctor");

    const state = await readServer(server);

    expect(state.roles.find((role) => role.id === moderator)?.hasPermissions).toBe(true);
    expect(state.roles.find((role) => role.id === doctor)?.hasPermissions).toBe(false);
  });

  test("finds Administrator through a role Neil's member holds", async () => {
    const state = await readServer(new FakeSetupServer({ botPermissions: ADMINISTRATOR }));

    expect(state.botIsAdministrator).toBe(true);
  });

  test("finds Administrator through @everyone", async () => {
    const state = await readServer(new FakeSetupServer({ everyonePermissions: ADMINISTRATOR }));

    expect(state.botIsAdministrator).toBe(true);
  });

  test("does not find Administrator when neither Neil's roles nor @everyone have it", async () => {
    const state = await readServer(new FakeSetupServer({ botPermissions: MANAGE_ROLES }));

    expect(state.botIsAdministrator).toBe(false);
  });

  test("takes the botTopPosition from the highest role Neil's member holds", async () => {
    const server = new FakeSetupServer();
    server.defineRole("Helper", { held: true, position: 15 });
    server.defineRole("Doctor", { held: false, position: 30 });

    const state = await readServer(server);

    expect(state.botTopPosition).toBe(15);
  });

  test("maps each channel kind, and gives a top-level channel no parent", async () => {
    const server = new FakeSetupServer();
    const hangout = server.defineChannel("Hangout", { kind: "category" });
    server.defineChannel("general", { kind: "text", parentId: hangout });
    server.defineChannel("voice-lounge", { kind: "voice", parentId: hangout });
    server.defineChannel("tactics", { kind: "forum", parentId: hangout });
    server.defineChannel("news", { kind: "announcement", parentId: hangout });
    server.defineChannel("loose", { kind: "text" });

    const state = await readServer(server);
    const byName = (name: string) => state.channels.find((channel) => channel.name === name);

    expect(byName("Hangout")?.kind).toBe("category");
    expect(byName("general")?.kind).toBe("text");
    expect(byName("voice-lounge")?.kind).toBe("voice");
    expect(byName("tactics")?.kind).toBe("forum");
    expect(byName("news")?.kind).toBe("announcement");
    expect(byName("general")?.parentId).toBe(hangout);
    expect(byName("Hangout")?.parentId).toBeUndefined();
    expect(byName("loose")?.parentId).toBeUndefined();
  });
});

describe("applySetup", () => {
  test("creates roles, then categories, then channels", async () => {
    const server = new FakeSetupServer();
    const plan = await planFor(APPLY_LAYOUT, server);

    await applySetup(plan, server);

    const phase: Record<SetupWriteOp, number> = { "create-role": 0, "create-category": 1, "create-channel": 2, "edit-overwrites": 3 };
    const phases = server.writes.map((write) => phase[write.op]);
    expect(phases).toEqual([...phases].sort((a, b) => a - b));
    expect(writesOf(server, "create-role").length).toBeGreaterThan(0);
    expect(writesOf(server, "create-channel").length).toBeGreaterThan(0);
  });

  test("resolves role names, @everyone and Neil to ids, and a channel's category name to the category's id", async () => {
    const server = new FakeSetupServer({ guildId: GUILD_ID, botUserId: BOT_USER_ID });
    const plan = await planFor(APPLY_LAYOUT, server);

    await applySetup(plan, server);

    const hangout = writesOf(server, "create-category").find((write) => write.name === "Hangout");
    expect(hangout?.overwrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: GUILD_ID, deny: VIEW }),
        expect.objectContaining({ targetId: roleId(server, KINGDOM_ROLE), allow: VIEW }),
      ]),
    );
    const general = writesOf(server, "create-channel").find((write) => write.name === "general");
    expect(general?.parentId).toBe(channelId(server, "Hangout"));
    const onboarding = writesOf(server, "create-channel").find((write) => write.name === "onboarding");
    expect(onboarding?.overwrites).toEqual(expect.arrayContaining([expect.objectContaining({ targetId: BOT_USER_ID, allow: VIEW })]));
  });

  test("writes a channel's corrected overwrites in one edit, however many targets need it", async () => {
    const server = new FakeSetupServer();
    const hangoutId = server.defineChannel("Hangout", { kind: "category" });
    const generalId = server.defineChannel("general", { kind: "text", parentId: hangoutId });
    const plan = await planFor(APPLY_LAYOUT, server);

    await applySetup(plan, server);

    const edits = writesOf(server, "edit-overwrites").filter((write) => write.channelId === generalId);
    expect(edits).toHaveLength(1);
  });

  test("gives a new channel all its overwrites in its creation, with no separate edit", async () => {
    const server = new FakeSetupServer();
    const plan = await planFor(APPLY_LAYOUT, server);

    await applySetup(plan, server);

    expect(writesOf(server, "edit-overwrites")).toHaveLength(0);
    const rules = writesOf(server, "create-channel").find((write) => write.name === "rules");
    expect(rules?.overwrites.length).toBeGreaterThan(1);
  });

  test("keeps the bits and overwrites of a corrected channel that the layout does not name", async () => {
    const server = new FakeSetupServer();
    const hangoutId = server.defineChannel("Hangout", { kind: "category" });
    const r5 = server.defineRole("R5");
    const veteran = server.defineRole("Veteran");
    server.defineChannel("general", {
      kind: "text",
      parentId: hangoutId,
      overwrites: [
        { type: 0, targetId: r5, allow: MANAGE_MESSAGES, deny: 0n },
        { type: 0, targetId: veteran, allow: SEND, deny: 0n },
      ],
    });
    const plan = await planFor(APPLY_LAYOUT, server);

    await applySetup(plan, server);

    const general = server.findChannel("general");
    expect(general?.overwrites.find((o) => o.targetId === r5)?.allow).toBe(MANAGE_MESSAGES | VIEW);
    expect(general?.overwrites.find((o) => o.targetId === veteran)).toEqual({ type: 0, targetId: veteran, allow: SEND, deny: 0n });
  });

  test("records a failed write and goes on with the other writes", async () => {
    const server = new FakeSetupServer();
    server.failWrite("create-role", "Doctor", new Error("Discord refused"));
    const plan = await planFor(APPLY_LAYOUT, server);

    const outcomes = await applySetup(plan, server);

    const doctor = outcomes.find((outcome) => outcome.step.kind === "create-role" && outcome.step.name === "Doctor");
    expect(doctor?.status).toBe("failed");
    expect(server.findRole("R5")).toBeDefined();
    expect(server.findChannel("Hangout")).toBeDefined();
    expect(server.findChannel("general")).toBeDefined();
  });

  test("reports a channel as failed, and does not write it, when its category failed", async () => {
    const server = new FakeSetupServer();
    server.failWrite("create-category", "Hangout", new Error("Discord refused"));
    const plan = await planFor(APPLY_LAYOUT, server);

    const outcomes = await applySetup(plan, server);

    const general = outcomes.find((outcome) => outcome.step.kind === "create-channel" && outcome.step.name === "general");
    expect(general?.status).toBe("failed");
    expect(writesOf(server, "create-channel").some((write) => write.name === "general")).toBe(false);
  });
});

describe("runSetup", () => {
  test("lists the report sections in the order of contracts/cli.md on a real run", async () => {
    const server = new FakeSetupServer({ botPermissions: ADMINISTRATOR });
    server.defineChannel("unknown-channel", { kind: "text" });
    server.failWrite("create-role", "Doctor", new Error("Discord refused"));
    const layout: ServerLayout = {
      roles: ["Moderator", "King", "R5", "Doctor"],
      externalRoles: [],
      languages: [],
      translations: [],
      categories: [{ name: "Hangout", seenBy: ["R5"], channels: [{ name: "general", type: "text", description: "A test channel." }] }],
      allianceArea: { channels: [] },
    };

    const { report } = await runSetup({ layout, homeKingdom: HOME_KINGDOM, apply: true, port: server, secrets: [] });

    const changes = indexWhere(report, (line) => /\bR5\b/.test(line));
    const outside = indexWhere(report, (line) => line.includes("unknown-channel"));
    const failure = indexWhere(report, (line) => line.includes("Discord refused"));
    const ids = indexWhere(report, (line) => line.startsWith("DISCORD_GUILD_ID="));
    const byHand = indexWhere(report, (line) => /Integrations/.test(line));
    const last = lines(report).length - 1;
    expect(changes).toBeGreaterThan(-1);
    expect(changes).toBeLessThan(outside);
    expect(outside).toBeLessThan(failure);
    expect(failure).toBeLessThan(ids);
    expect(ids).toBeLessThan(byHand);
    expect(byHand).toBeLessThan(last);
    expect(lastLine(report)).toBe(LAST_LINE);
  });

  test("lists the hides-from-everyone warning before other warnings", async () => {
    const server = new FakeSetupServer();
    const hangoutId = server.defineChannel("Hangout", { kind: "category" });
    server.defineChannel("general", { kind: "text", parentId: hangoutId });
    server.defineRole("R5", { position: 20 });
    const layout: ServerLayout = {
      roles: ["R5"],
      externalRoles: [],
      languages: [],
      translations: [],
      categories: [{ name: "Hangout", seenBy: ["R5"], channels: [{ name: "general", type: "text", description: "A test channel." }] }],
      allianceArea: { channels: [] },
    };

    const { report } = await runSetup({ layout, homeKingdom: HOME_KINGDOM, apply: false, port: server, secrets: [] });

    const hides = indexWhere(report, (line) => /general/.test(line) && /everyone/i.test(line));
    const aboveNeil = indexWhere(report, (line) => /\bR5\b/.test(line));
    expect(hides).toBeGreaterThan(-1);
    expect(hides).toBeLessThan(aboveNeil);
  });

  test("says Nothing to do. when the plan has no steps", async () => {
    const { report } = await runSetup({
      layout: EMPTY_LAYOUT,
      homeKingdom: HOME_KINGDOM,
      apply: false,
      port: new FakeSetupServer(),
      secrets: [],
    });

    expect(lines(report)).toContain("Nothing to do.");
  });

  test("prints SETTING=value lines for the server, Moderator, King, #onboarding and #neil-log after a real run", async () => {
    const server = new FakeSetupServer({ botPermissions: ADMINISTRATOR });
    const layout: ServerLayout = {
      roles: ["Moderator", "King"],
      externalRoles: [],
      languages: [],
      translations: [],
      categories: [
        { name: "Onboarding", seenBy: ["Moderator", "King"], channels: [{ name: "onboarding", type: "text", description: "A test channel." }] },
        { name: "Officers", seenBy: ["Moderator", "King"], channels: [{ name: "neil-log", type: "text", description: "A test channel." }] },
      ],
      allianceArea: { channels: [] },
    };

    const { report } = await runSetup({ layout, homeKingdom: HOME_KINGDOM, apply: true, port: server, secrets: [] });

    expect(lines(report)).toEqual(
      expect.arrayContaining([
        `DISCORD_GUILD_ID=${server.guildId}`,
        `DISCORD_MODERATOR_ROLE_ID=${roleId(server, "Moderator")}`,
        `DISCORD_KING_ROLE_ID=${roleId(server, "King")}`,
        `DISCORD_ONBOARDING_CHANNEL_ID=${channelId(server, "onboarding")}`,
        `DISCORD_LOG_CHANNEL_ID=${channelId(server, "neil-log")}`,
      ]),
    );
  });

  test("lists the steps left by hand, then ends a real run with the Administrator reminder", async () => {
    const server = new FakeSetupServer({ botPermissions: ADMINISTRATOR });

    const { report, exitCode } = await runSetup({
      layout: APPLY_LAYOUT,
      homeKingdom: HOME_KINGDOM,
      apply: true,
      port: server,
      secrets: [],
    });

    const ids = indexWhere(report, (line) => line.startsWith("DISCORD_GUILD_ID="));
    const byHand = indexWhere(report, (line) => /Integrations/.test(line));
    expect(exitCode).toBe(0);
    expect(byHand).toBeGreaterThan(ids);
    expect(report).toMatch(/Server Members Intent and Presence Intent/);
    expect(report).toMatch(/Community/);
    expect(report).toMatch(/limit commands to their channels/);
    expect(lastLine(report)).toBe(LAST_LINE);
  });

  test("does not end a dry run with the Administrator reminder", async () => {
    const { report } = await runSetup({
      layout: APPLY_LAYOUT,
      homeKingdom: HOME_KINGDOM,
      apply: false,
      port: new FakeSetupServer(),
      secrets: [],
    });

    expect(lastLine(report)).not.toBe(LAST_LINE);
  });

  test("never prints a secret, even when a failure message carries it", async () => {
    const server = new FakeSetupServer({ botPermissions: ADMINISTRATOR });
    server.failWrite("create-role", "Doctor", new Error(`Refused with ${TOKEN}`));

    const { report } = await runSetup({
      layout: APPLY_LAYOUT,
      homeKingdom: HOME_KINGDOM,
      apply: true,
      port: server,
      secrets: [TOKEN],
    });

    expect(report).toContain("Doctor");
    expect(report).not.toContain(TOKEN);
  });

  test("exits 1 when a write failed on a real run", async () => {
    const server = new FakeSetupServer({ botPermissions: ADMINISTRATOR });
    server.failWrite("create-role", "Doctor", new Error("Discord refused"));

    const { exitCode } = await runSetup({ layout: APPLY_LAYOUT, homeKingdom: HOME_KINGDOM, apply: true, port: server, secrets: [] });

    expect(exitCode).toBe(1);
  });

  test("a real run without Administrator writes nothing, exits 1 and says what to give Neil", async () => {
    const server = new FakeSetupServer();

    const { report, exitCode } = await runSetup({
      layout: APPLY_LAYOUT,
      homeKingdom: HOME_KINGDOM,
      apply: true,
      port: server,
      secrets: [],
    });

    expect(server.writes).toEqual([]);
    expect(exitCode).toBe(1);
    expect(report).toContain("Administrator");
  });

  test("a dry run writes nothing, even when Neil holds Administrator", async () => {
    const server = new FakeSetupServer({ botPermissions: ADMINISTRATOR });

    const { exitCode } = await runSetup({ layout: APPLY_LAYOUT, homeKingdom: HOME_KINGDOM, apply: false, port: server, secrets: [] });

    expect(server.writes).toEqual([]);
    expect(exitCode).toBe(0);
  });

  test("a dry run works without Administrator and writes nothing", async () => {
    const server = new FakeSetupServer();

    const { exitCode } = await runSetup({ layout: APPLY_LAYOUT, homeKingdom: HOME_KINGDOM, apply: false, port: server, secrets: [] });

    expect(server.writes).toEqual([]);
    expect(exitCode).toBe(0);
  });
});

describe("the shipped server-layout.json", () => {
  test("holds #gift-codes in Hangout, where only R4, R5 and the King post", () => {
    const expanded = expandLayout(shippedLayout(), HOME_KINGDOM, []);
    const channel = groupNamed(expanded, "Hangout").channels.find((candidate) => candidate.name === "gift-codes");
    const overwriteOf = (target: string) => channel?.overwrites.find((overwrite) => overwrite.target === target);

    expect(channel?.type).toBe("text");
    expect(overwriteOf(`#${HOME_KINGDOM.toString()}`)?.allow).toContain("ViewChannel");
    expect(overwriteOf(`#${HOME_KINGDOM.toString()}`)?.deny).toContain("SendMessages");
    for (const poster of ["R4", "R5", "King"]) expect(overwriteOf(poster)?.allow).toContain("SendMessages");
    expect(expanded.roles).toContain("R4");
  });

  test("loads through parseLayout", () => {
    expect(() => shippedLayout()).not.toThrow();
  });

  test("holds a language channel for every Game Language, seen by its role", () => {
    const expanded = expandLayout(shippedLayout(), HOME_KINGDOM, []);
    const languages = groupNamed(expanded, "Languages");

    expect(languages.channels.map((channel) => channel.name).sort()).toEqual(
      GAME_LANGUAGES.map((language) => `${language.roleName.toLowerCase()}-chat`).sort(),
    );
    for (const language of GAME_LANGUAGES) {
      const channel = languages.channels.find((candidate) => candidate.name === `${language.roleName.toLowerCase()}-chat`);
      expect(channel?.overwrites).toContainEqual(expect.objectContaining({ target: language.roleName, allow: ["ViewChannel"] }));
    }
  });

  test("allows Doctor to see only the Guest area", () => {
    const expanded = expandLayout(shippedLayout(), HOME_KINGDOM, []);

    const seenByDoctor = expanded.categories.filter((category) => viewersOf(category).includes("Doctor")).map((c) => c.name);

    expect(seenByDoctor).toEqual(["Guest area"]);
  });

  test("has an Alliance Duel group and a Kingdom vs Kingdom group, seen by PvP and Events, not the whole Kingdom", () => {
    const expanded = expandLayout(shippedLayout(), HOME_KINGDOM, []);

    for (const name of ["Alliance Duel", "Kingdom vs Kingdom"]) {
      const viewers = categoryViewers(groupNamed(expanded, name));
      expect(viewers).toEqual(expect.arrayContaining(["PvP", "Events"]));
      expect(viewers).not.toContain(KINGDOM_ROLE);
    }
  });

  test("gives each of AD and KvK text, voice, a tactics forum and an intel channel", () => {
    const expanded = expandLayout(shippedLayout(), HOME_KINGDOM, []);

    for (const name of ["Alliance Duel", "Kingdom vs Kingdom"]) {
      const group = groupNamed(expanded, name);
      expect(group.channels.some((channel) => channel.type === "text")).toBe(true);
      expect(group.channels.some((channel) => channel.type === "voice")).toBe(true);
      expect(group.channels.some((channel) => channel.type === "forum")).toBe(true);
      expect(group.channels.some((channel) => channel.name.includes("intel"))).toBe(true);
    }
  });

  test("gives Kingdom vs Kingdom an announcement only King posts, and Alliance Duel none", () => {
    const expanded = expandLayout(shippedLayout(), HOME_KINGDOM, []);
    const announcement = groupNamed(expanded, "Kingdom vs Kingdom").channels.find((channel) => channel.type === "announcement");

    expect(announcement?.overwrites).toContainEqual(expect.objectContaining({ target: "King", allow: expect.arrayContaining(["SendMessages"]) as unknown }));
    expect(announcement?.overwrites.some((o) => o.target !== "King" && o.deny.includes("SendMessages"))).toBe(true);
    expect(groupNamed(expanded, "Alliance Duel").channels.some((channel) => channel.type === "announcement")).toBe(false);
  });

  const channelNamed = (name: string) => {
    const channels = expandLayout(shippedLayout(), HOME_KINGDOM, []).categories.flatMap((category) => category.channels);
    const found = channels.find((channel) => channel.name === name);
    if (found === undefined) throw new Error(`no channel ${name}`);
    return found;
  };
  const allowOf = (channel: string, target: string) =>
    channelNamed(channel).overwrites.find((overwrite) => overwrite.target === target)?.allow ?? [];

  test("gives Neil exactly ViewChannel, SendMessages and EmbedLinks on alliance-chat in every Alliance area, and alliance-voice nothing", () => {
    const expanded = expandLayout(shippedLayout(), HOME_KINGDOM, ["[ABC]", "[XYZ]"]);
    const neilOn = (channel: ExpandedChannel): WantedOverwrite | undefined =>
      channel.overwrites.find((overwrite) => overwrite.target === "Neil");

    for (const area of ["[ABC]", "[XYZ]"]) {
      const channels = groupNamed(expanded, area).channels;
      const chat = channels.find((channel) => channel.name === "alliance-chat");
      const voice = channels.find((channel) => channel.name === "alliance-voice");
      if (chat === undefined || voice === undefined) throw new Error(`${area} has no alliance-chat or alliance-voice`);

      const neilOnChat = neilOn(chat);
      expect(neilOnChat?.allow.slice().sort()).toEqual(["EmbedLinks", "SendMessages", "ViewChannel"]);
      expect(neilOnChat?.deny).toEqual([]);
      expect(neilOn(voice)).toBeUndefined();
    }
  });

  test("gives Neil every permission it checks at startup, and Read Message History, in onboarding and neil-log", () => {
    expect(allowOf("onboarding", "Neil")).toEqual(
      expect.arrayContaining(["ViewChannel", "SendMessagesInThreads", "CreatePrivateThreads", "ManageThreads", "ReadMessageHistory"]),
    );
    expect(allowOf("neil-log", "Neil")).toEqual(expect.arrayContaining(["ViewChannel", "SendMessages"]));
  });

  test("lets Moderator and King reach and manage Interview threads and the guides forum", () => {
    for (const officer of ["Moderator", "King"]) {
      expect(allowOf("onboarding", officer)).toEqual(expect.arrayContaining(["ViewChannel", "ManageThreads"]));
      expect(allowOf("guides", officer)).toEqual(expect.arrayContaining(["ViewChannel", "ManageThreads"]));
    }
  });

  test("keeps the closed NaP channels from the Kingdom role", () => {
    expect(allowOf("nap-discussion", KINGDOM_ROLE)).toEqual([]);
    expect(allowOf("nap-leaders", KINGDOM_ROLE)).toEqual([]);
  });

  test("gives no channel the name of a category, so printed IDs and reports can't mix them up", () => {
    const expanded = expandLayout(shippedLayout(), HOME_KINGDOM, []);
    const categoryNames = expanded.categories.map((category) => category.name);
    const channelNames = expanded.categories.flatMap((category) => category.channels.map((channel) => channel.name));
    expect(channelNames.filter((name) => categoryNames.includes(name))).toEqual([]);
  });

  test("gives KvK five tactical voice channels on top of its general voice channel", () => {
    const expanded = expandLayout(shippedLayout(), HOME_KINGDOM, []);

    const voice = groupNamed(expanded, "Kingdom vs Kingdom").channels.filter((channel) => channel.type === "voice");

    expect(voice).toHaveLength(6);
  });

  const denyOf = (channel: string, target: string) =>
    channelNamed(channel).overwrites.find((overwrite) => overwrite.target === target)?.deny ?? [];

  test("holds no guest-announcements and no ad-announcements", () => {
    const names = expandLayout(shippedLayout(), HOME_KINGDOM, []).categories.flatMap((category) => category.channels.map((channel) => channel.name));

    expect(names).not.toContain("guest-announcements");
    expect(names).not.toContain("ad-announcements");
  });

  test("has no Home Kingdom or Off-topic category, their channels now in Hangout", () => {
    const names = expandLayout(shippedLayout(), HOME_KINGDOM, []).categories.map((category) => category.name);

    expect(names).not.toContain("Home Kingdom");
    expect(names).not.toContain("Off-topic");
  });

  test("seats Hangout for the Kingdom with exactly the reworked channels", () => {
    const hangout = groupNamed(expandLayout(shippedLayout(), HOME_KINGDOM, []), "Hangout");

    expect(categoryViewers(hangout)).toContain(KINGDOM_ROLE);
    expect(hangout.channels.map((channel) => channel.name).sort()).toEqual(
      ["home-kingdom-announcements", "gift-codes", "general", "Hangout voice", "alliance-hall", "off-topic", "memes"].sort(),
    );
  });

  test("lets only the Off-topic role see off-topic and memes", () => {
    for (const name of ["off-topic", "memes"]) {
      expect(channelViewers(channelNamed(name))).toEqual(["Off-topic"]);
    }
  });

  test("holds looking-for-alliance and looking-for-players in Recruitment, and no recruitment channel", () => {
    const names = groupNamed(expandLayout(shippedLayout(), HOME_KINGDOM, []), "Recruitment").channels.map((channel) => channel.name);

    expect(names.slice().sort()).toEqual(["looking-for-alliance", "looking-for-players"]);
    expect(names).not.toContain("recruitment");
  });

  test("holds a Coaching voice channel in Events", () => {
    const coaching = groupNamed(expandLayout(shippedLayout(), HOME_KINGDOM, []), "Events").channels.find(
      (channel) => channel.name === "Coaching voice",
    );

    expect(coaching?.type).toBe("voice");
  });

  test("lets the Kingdom see home-kingdom-announcements, nap-announcements, event-announcements and kvk-announcements, and only King posts in them", () => {
    for (const name of ["home-kingdom-announcements", "nap-announcements", "event-announcements", "kvk-announcements"]) {
      expect(allowOf(name, KINGDOM_ROLE)).toContain("ViewChannel");
      expect(denyOf(name, KINGDOM_ROLE)).toContain("SendMessages");
      expect(allowOf(name, "King")).toContain("SendMessages");
    }
  });

  test("holds Russian, French, Italian and German copies of kvk-announcements and nap-announcements, each seen by its Language role", () => {
    for (const original of ["kvk-announcements", "nap-announcements"]) {
      for (const language of ["Russian", "French", "Italian", "German"]) {
        expect(allowOf(`${original}-${language.toLowerCase()}`, language)).toContain("ViewChannel");
      }
    }
  });

  test("lists Russian, French, Italian and German as the translations", () => {
    expect(shippedLayout().translations).toEqual(["Russian", "French", "Italian", "German"]);
  });

  test("gives rules and guest-rules a code of conduct", () => {
    const channels = shippedLayout().categories.flatMap((category) => category.channels);

    for (const name of ["rules", "guest-rules"]) {
      const conduct = channels.find((channel) => channel.name === name)?.codeOfConduct ?? [];
      expect(conduct.length).toBeGreaterThan(0);
    }
  });

  test("gives every channel and Alliance area channel a description", () => {
    const parsed = shippedLayout();
    const channels = [...parsed.categories.flatMap((category) => category.channels), ...parsed.allianceArea.channels];

    for (const channel of channels) {
      expect(channel.description.trim()).not.toBe("");
    }
  });

  describe("the shipped layout's messages", () => {
    const shipped = expandLayout(shippedLayout(), HOME_KINGDOM, []);
    const allChannels = shipped.categories.flatMap((category) => category.channels);

    function shippedMessageOf(name: string): string {
      const channel = allChannels.find((candidate) => candidate.name === name);
      if (channel === undefined) throw new Error(`no shipped channel named ${name}`);
      if (channel.message === undefined) throw new Error(`shipped channel ${name} has no message`);
      return channel.message;
    }

    test("rules carries the Code of Conduct and stays under 2000 characters", () => {
      const message = shippedMessageOf("rules");
      expect(message).toContain("Code of Conduct");
      expect(message.length).toBeLessThanOrEqual(2000);
    });

    test("guest-rules carries the Code of Conduct and stays under 2000 characters", () => {
      const message = shippedMessageOf("guest-rules");
      expect(message).toContain("Code of Conduct");
      expect(message.length).toBeLessThanOrEqual(2000);
    });

    test("every message in the shipped expansion is at most 2000 characters", () => {
      const lengths = allChannels.flatMap((channel) => (channel.message === undefined ? [] : [channel.message.length]));
      expect(lengths.length).toBeGreaterThan(0);
      expect(Math.max(...lengths)).toBeLessThanOrEqual(2000);
    });
  });
});

const COMMUNITY = ["COMMUNITY"];
const NO_FEATURES: string[] = [];

/** A small layout: a Hangout with a text, a forum and an announcement, an Officers area, and an Alliance area. */
const SMALL_LAYOUT: ServerLayout = {
  roles: ["Moderator", "King", "R5", KINGDOM_ROLE],
  externalRoles: [],
  languages: ["English"],
  translations: [],
  categories: [
    {
      name: "Hangout",
      seenBy: [KINGDOM_ROLE],
      channels: [
        { name: "general", type: "text", description: "A test channel.", seenBy: ["R5"] },
        { name: "tactics", type: "forum", description: "A test channel.", seenBy: ["R5"] },
        { name: "news", type: "announcement", description: "A test channel.", mode: "only-king-posts" },
      ],
    },
    {
      name: "Officers",
      seenBy: ["Moderator", "King"],
      channels: [{ name: "neil-log", type: "text", description: "A test channel.", overwrites: { Neil: { allow: ["ViewChannel", "SendMessages"], deny: [] } } }],
    },
  ],
  allianceArea: { channels: [{ name: "alliance-chat", type: "text", description: "A test channel." }, { name: "alliance-voice", type: "voice", description: "A test channel." }] },
};

/** The ids of the targets an overwrite list lets see its channel. */
function viewerIds(overwrites: readonly { targetId: string; allow: bigint }[]): string[] {
  return overwrites.filter((overwrite) => (overwrite.allow & VIEW) !== 0n).map((overwrite) => overwrite.targetId);
}

describe("running the setup again", () => {
  test.each([
    { label: "with Community", features: COMMUNITY },
    { label: "without Community", features: NO_FEATURES },
  ])("plans no steps after a real run of the shipped layout on an empty server, $label", async ({ features }) => {
    const server = new FakeSetupServer({ features });
    const first = await planFor(shippedLayout(), server);
    expect(first.steps.length).toBeGreaterThan(0);

    const outcomes = await applySetup(first, server);

    expect(outcomes.filter((outcome) => outcome.status === "failed")).toEqual([]);
    expect((await planFor(shippedLayout(), server)).steps).toEqual([]);
  });

  test.each([
    { label: "with Community", features: COMMUNITY },
    { label: "without Community", features: NO_FEATURES },
  ])("plans no steps after a real run of a small layout on an empty server, $label", async ({ features }) => {
    const server = new FakeSetupServer({ features });
    const first = await planFor(SMALL_LAYOUT, server);
    expect(first.steps.length).toBeGreaterThan(0);

    await applySetup(first, server);

    expect((await planFor(SMALL_LAYOUT, server)).steps).toEqual([]);
  });

  test("without Community, creates a forum as a forum and an announcement as text, and plans nothing for them on the next run", async () => {
    const server = new FakeSetupServer({ features: NO_FEATURES });
    const first = await planFor(SMALL_LAYOUT, server);
    expect(first.findings.map((finding) => finding.kind)).toContain("fallback-to-text");

    await applySetup(first, server);

    expect(server.findChannel("tactics")?.kind).toBe("forum");
    expect(server.findChannel("news")?.kind).toBe("text");
    expect((await planFor(SMALL_LAYOUT, server)).steps).toEqual([]);
  });

  test("gives an Alliance role added later only its area: a category seen by it alone, with text and voice", async () => {
    const server = new FakeSetupServer({ features: COMMUNITY, botPermissions: ADMINISTRATOR });
    await applySetup(await planFor(SMALL_LAYOUT, server), server);
    const abc = server.defineRole("[ABC]", { position: 2 });

    const plan = await planFor(SMALL_LAYOUT, server);
    expect(plan.steps.map((step) => step.kind)).toEqual(["create-category", "create-channel", "create-channel", "post-description", "post-description"]);
    expect(plan.steps.map((step) => step.name)).toEqual(["[ABC]", "alliance-chat", "alliance-voice", "alliance-chat", "alliance-voice"]);

    await applySetup(plan, server);

    expect(viewerIds(server.findChannel("[ABC]")?.overwrites ?? [])).toEqual([abc]);
    expect(viewerIds(server.findChannel("alliance-chat")?.overwrites ?? [])).toEqual([abc]);
    expect(viewerIds(server.findChannel("alliance-voice")?.overwrites ?? [])).toEqual([abc]);
    expect((await planFor(SMALL_LAYOUT, server)).steps).toEqual([]);
  });

  test("writes Neil's EmbedLinks on alliance-chat as Discord's Embed Links bit", async () => {
    const server = new FakeSetupServer({ features: COMMUNITY, botPermissions: ADMINISTRATOR });
    server.defineRole("[ABC]", { position: 2 });
    const layout: ServerLayout = {
      ...SMALL_LAYOUT,
      allianceArea: {
        channels: [
          { name: "alliance-chat", type: "text", description: "A test channel.", overwrites: { Neil: { allow: ["ViewChannel", "SendMessages", "EmbedLinks"], deny: [] } } },
        ],
      },
    };
    await applySetup(await planFor(layout, server), server);

    const neil = server.findChannel("alliance-chat")?.overwrites.find((overwrite) => overwrite.targetId === server.botUserId);
    expect((neil?.allow ?? 0n) & EMBED_LINKS).toBe(EMBED_LINKS);
  });

  test("keeps an extra overwrite on a layout channel, and an unrelated permission inside a corrected overwrite", async () => {
    const server = new FakeSetupServer({ features: COMMUNITY, botPermissions: ADMINISTRATOR });
    const r5 = server.defineRole("R5");
    const veteran = server.defineRole("Veteran");
    const hangout = server.defineChannel("Hangout", { kind: "category" });
    server.defineChannel("general", {
      kind: "text",
      parentId: hangout,
      overwrites: [
        { type: 0, targetId: server.guildId, allow: 0n, deny: VIEW },
        { type: 0, targetId: r5, allow: MANAGE_MESSAGES, deny: 0n },
        { type: 0, targetId: veteran, allow: SEND, deny: 0n },
      ],
    });
    const first = await planFor(SMALL_LAYOUT, server);
    expect(first.findings).toContainEqual({ kind: "extra-overwrite", name: "general", target: "Veteran" });

    await applySetup(first, server);

    const general = server.findChannel("general");
    expect(general?.overwrites.find((overwrite) => overwrite.targetId === r5)).toEqual({ type: 0, targetId: r5, allow: MANAGE_MESSAGES | VIEW, deny: 0n });
    expect(general?.overwrites.find((overwrite) => overwrite.targetId === veteran)).toEqual({ type: 0, targetId: veteran, allow: SEND, deny: 0n });
    const second = await planFor(SMALL_LAYOUT, server);
    expect(second.steps).toEqual([]);
    expect(second.findings).toContainEqual({ kind: "extra-overwrite", name: "general", target: "Veteran" });
  });

  test("never writes a channel outside the layout, and reports it on every run", async () => {
    const server = new FakeSetupServer({ features: COMMUNITY, botPermissions: ADMINISTRATOR });
    const hangout = server.defineChannel("Hangout", { kind: "category" });
    const oldChat = server.defineChannel("old-chat", {
      kind: "text",
      parentId: hangout,
      overwrites: [{ type: 0, targetId: server.guildId, allow: SEND, deny: 0n }],
    });
    const first = await planFor(SMALL_LAYOUT, server);
    expect(first.findings).toContainEqual({ kind: "outside-layout", name: "old-chat" });

    await applySetup(first, server);

    const second = await planFor(SMALL_LAYOUT, server);
    expect(second.findings).toContainEqual({ kind: "outside-layout", name: "old-chat" });
    expect(server.writes.filter((write) => write.op === "edit-overwrites" && write.channelId === oldChat)).toEqual([]);
    expect(server.findChannel("old-chat")?.overwrites).toEqual([{ type: 0, targetId: server.guildId, allow: SEND, deny: 0n }]);
  });

  test("after one failed write, a second run finishes the work and plans nothing", async () => {
    const server = new FakeSetupServer({ features: COMMUNITY, botPermissions: ADMINISTRATOR });
    server.failWrite("create-channel", "general", new Error("Discord refused"));
    const first = await planFor(SMALL_LAYOUT, server);

    const firstOutcomes = await applySetup(first, server);

    expect(firstOutcomes.filter((outcome) => outcome.status === "failed").map((outcome) => outcome.step.kind)).toEqual(["create-channel", "post-description"]);
    server.clearFailures();
    const second = await planFor(SMALL_LAYOUT, server);
    expect(second.steps.map((step) => step.kind)).toEqual(["create-channel", "post-description"]);
    expect(second.steps.map((step) => step.name)).toEqual(["general", "general"]);

    const secondOutcomes = await applySetup(second, server);

    expect(secondOutcomes.filter((outcome) => outcome.status === "failed")).toEqual([]);
    expect(server.findChannel("general")).toBeDefined();
    expect((await planFor(SMALL_LAYOUT, server)).steps).toEqual([]);
  });
});

describe("the type of an overwrite survives the merge of a corrected channel", () => {
  test("writes a role's corrected overwrite as type 0 and Neil's as type 1", async () => {
    const layout: ServerLayout = {
      roles: ["R5"],
      externalRoles: [],
      languages: [],
      translations: [],
      categories: [
        { name: "Hangout", seenBy: ["R5"], channels: [{ name: "general", type: "text", description: "A test channel." }] },
        {
          name: "Officers",
          seenBy: ["R5"],
          channels: [{ name: "neil-log", type: "text", description: "A test channel.", overwrites: { Neil: { allow: ["ViewChannel"], deny: [] } } }],
        },
      ],
      allianceArea: { channels: [] },
    };
    const server = new FakeSetupServer();
    const r5 = server.defineRole("R5");
    const hangout = server.defineChannel("Hangout", { kind: "category" });
    const general = server.defineChannel("general", {
      kind: "text",
      parentId: hangout,
      overwrites: [{ targetId: r5, type: 0, allow: MANAGE_MESSAGES, deny: 0n }],
    });
    const officers = server.defineChannel("Officers", { kind: "category" });
    const log = server.defineChannel("neil-log", {
      kind: "text",
      parentId: officers,
      overwrites: [{ targetId: server.botUserId, type: 1, allow: SEND, deny: 0n }],
    });

    await applySetup(await planFor(layout, server), server);

    const roleEdit = writesOf(server, "edit-overwrites").find((write) => write.channelId === general);
    expect(roleEdit?.overwrites.find((overwrite) => overwrite.targetId === r5)).toEqual(
      expect.objectContaining({ type: 0, allow: MANAGE_MESSAGES | VIEW }),
    );
    const neilEdit = writesOf(server, "edit-overwrites").find((write) => write.channelId === log);
    expect(neilEdit?.overwrites.find((overwrite) => overwrite.targetId === server.botUserId)).toEqual(
      expect.objectContaining({ type: 1, allow: SEND | VIEW }),
    );
  });
});

/** A fake whose reads fail once a write has reached it: the read after a real run's writes is the one that fails. */
class ReadsFailAfterWrites extends FakeSetupServer {
  override readChannels(): Promise<readonly SetupChannelInfo[]> {
    if (this.writes.length > 0) return Promise.reject(new Error("Discord refused the read"));
    return super.readChannels();
  }
}

describe("runSetup when the read after a real run's writes fails", () => {
  test("still reports the outcomes, leaves out the ID lines and exits 0 when every write succeeded", async () => {
    const server = new ReadsFailAfterWrites({ botPermissions: ADMINISTRATOR });

    const { report, exitCode } = await runSetup({ layout: APPLY_LAYOUT, homeKingdom: HOME_KINGDOM, apply: true, port: server, secrets: [] });

    expect(lines(report)).toContain("create role R5");
    expect(lines(report).some((line) => line.startsWith("DISCORD_GUILD_ID="))).toBe(false);
    expect(report).toMatch(/could not read the IDs/i);
    expect(exitCode).toBe(0);
  });

  test("still reports the failed write and exits 1 when a write failed", async () => {
    const server = new ReadsFailAfterWrites({ botPermissions: ADMINISTRATOR });
    server.failWrite("create-role", "Doctor", new Error("Discord refused"));

    const { report, exitCode } = await runSetup({ layout: APPLY_LAYOUT, homeKingdom: HOME_KINGDOM, apply: true, port: server, secrets: [] });

    expect(lines(report)).toContain("failed: create role Doctor: Discord refused");
    expect(lines(report).some((line) => line.startsWith("DISCORD_GUILD_ID="))).toBe(false);
    expect(exitCode).toBe(1);
  });
});

describe("runSetup says would create or would correct for each planned step it does not make", () => {
  /** A server with Hangout and its general channel, which has no overwrites, so the plan corrects it. */
  function serverWithGeneral(options: { botPermissions?: bigint } = {}): FakeSetupServer {
    const server = new FakeSetupServer(options);
    const hangout = server.defineChannel("Hangout", { kind: "category" });
    server.defineChannel("general", { kind: "text", parentId: hangout });
    return server;
  }

  test("says would create and would correct on a dry run, and create and correct on a real run", async () => {
    const dry = await runSetup({ layout: APPLY_LAYOUT, homeKingdom: HOME_KINGDOM, apply: false, port: serverWithGeneral(), secrets: [] });
    const real = await runSetup({
      layout: APPLY_LAYOUT,
      homeKingdom: HOME_KINGDOM,
      apply: true,
      port: serverWithGeneral({ botPermissions: ADMINISTRATOR }),
      secrets: [],
    });

    expect(lines(dry.report)).toContain("would create role R5");
    expect(indexWhere(dry.report, (line) => /^would correct .*\bgeneral\b/.test(line))).toBeGreaterThan(-1);
    expect(lines(real.report)).toContain("create role R5");
    expect(indexWhere(real.report, (line) => /^correct .*\bgeneral\b/.test(line))).toBeGreaterThan(-1);
    expect(real.report).not.toMatch(/would /);
  });

  test("says would create and would correct on a blocked real run, which writes nothing", async () => {
    const { report, exitCode } = await runSetup({
      layout: APPLY_LAYOUT,
      homeKingdom: HOME_KINGDOM,
      apply: true,
      port: serverWithGeneral(),
      secrets: [],
    });

    expect(lines(report)).toContain("would create role R5");
    expect(indexWhere(report, (line) => /^would correct .*\bgeneral\b/.test(line))).toBeGreaterThan(-1);
    expect(lines(report)).not.toContain("create role R5");
    expect(exitCode).toBe(1);
  });
});

describe("a missing Interaction Bot", () => {
  test("a translated channel is created without the Interaction Bot's overwrite, and the report says its overwrites are left out", async () => {
    const server = new FakeSetupServer({ botPermissions: ADMINISTRATOR });
    const r5 = server.defineRole("R5");
    const layout: ServerLayout = {
      roles: ["R5"],
      externalRoles: ["Interaction Bot"],
      languages: [],
      translations: [],
      categories: [{ name: "Hangout", seenBy: ["R5"], channels: [{ name: "news", type: "text", description: "A test channel.", translated: true }] }],
      allianceArea: { channels: [] },
    };

    const { report, exitCode } = await runSetup({ layout, homeKingdom: HOME_KINGDOM, apply: true, port: server, secrets: [] });

    const news = writesOf(server, "create-channel").find((write) => write.name === "news");
    expect(news?.overwrites.map((overwrite) => overwrite.targetId).sort()).toEqual([server.guildId, r5].sort());
    expect(report).toContain("Interaction Bot (external role) is missing; its overwrites are left out");
    expect(exitCode).toBe(0);
  });
});

describe("a created Moderator in the hand steps", () => {
  test("the Neil-position hand step names Moderator after a real run that creates Moderator", async () => {
    const server = new FakeSetupServer({ botPermissions: ADMINISTRATOR });
    const layout: ServerLayout = {
      roles: ["Moderator", "King"],
      externalRoles: [],
      languages: [],
      translations: [],
      categories: [],
      allianceArea: { channels: [] },
    };

    const { report } = await runSetup({ layout, homeKingdom: HOME_KINGDOM, apply: true, port: server, secrets: [] });

    expect(lines(report)).toContain("create role Moderator");
    expect(indexWhere(report, (line) => /Neil's role above every role it gives/.test(line) && /Moderator/.test(line))).toBeGreaterThan(-1);
  });
});

// ---- Topics and descriptions (slice 029, tasks T011, research R1 to R3, R6, data-model.md) ---------------------------

const OTHER_USER_ID = "400000000000000000";
const PIN = "📌";

/** A layout with a text, an announcement, a voice channel and a forum, each with its description. */
const DESCRIBED_LAYOUT: ServerLayout = {
  roles: [KINGDOM_ROLE],
  externalRoles: [],
  languages: [],
  translations: [],
  categories: [
    {
      name: "Hangout",
      seenBy: [KINGDOM_ROLE],
      channels: [
        { name: "general", type: "text", description: "Chat with the Kingdom." },
        { name: "news", type: "announcement", description: "News from the King." },
        { name: "lounge", type: "voice", description: "Talk out loud." },
      ],
    },
    {
      name: "Tactics",
      seenBy: [KINGDOM_ROLE],
      channels: [{ name: "tactics", type: "forum", description: "Tactics for the Kingdom." }],
    },
  ],
  allianceArea: { channels: [] },
};

/** The layout of the stale server: general and news, which the server already has with other topics and text. */
const STALE_LAYOUT: ServerLayout = {
  roles: [KINGDOM_ROLE],
  externalRoles: [],
  languages: [],
  translations: [],
  categories: [
    {
      name: "Hangout",
      seenBy: [KINGDOM_ROLE],
      channels: [
        { name: "general", type: "text", description: "Chat with the Kingdom." },
        { name: "news", type: "announcement", description: "News from the King." },
      ],
    },
  ],
  allianceArea: { channels: [] },
};

/** A server with Hangout, general (old topic, an old description by Neil) and news (no topic, no description). */
function serverWithStaleDescriptions(options: { botPermissions?: bigint } = {}): FakeSetupServer {
  const server = new FakeSetupServer({ features: COMMUNITY, ...options });
  const hangout = server.defineChannel("Hangout", { kind: "category" });
  const general = server.defineChannel("general", { kind: "text", parentId: hangout, topic: "Old topic." });
  server.definePin(general, { authorId: server.botUserId, content: `${PIN} **#general**\nOld description.` });
  server.defineChannel("news", { kind: "announcement", parentId: hangout });
  return server;
}

/** The pinned-message posts written to a channel, in order. */
function postsIn(server: FakeSetupServer, channel: string): Extract<ChannelWrite, { op: "post-pinned-message" }>[] {
  return server.channelWrites.filter(
    (write): write is Extract<ChannelWrite, { op: "post-pinned-message" }> => write.op === "post-pinned-message" && write.channelId === channel,
  );
}

/** The full description message of a channel in a layout, as the setup posts it: the text, the seen-by and the posts lines. */
function descriptionOf(layout: ServerLayout, name: string): string {
  const found = expandLayout(layout, HOME_KINGDOM, []).categories.flatMap((category) => category.channels).find((channel) => channel.name === name);
  if (found?.message === undefined) throw new Error(`the layout has no description for ${name}`);
  return found.message;
}

/** The pinned messages of a channel, newest first, as the port reads them. */
async function pinsOf(server: FakeSetupServer, name: string): Promise<string[]> {
  const pins = await server.readPins(channelId(server, name));
  if (pins === undefined) throw new Error(`the pins of ${name} are unread`);
  return pins.map((pin) => pin.content);
}

describe("readServer reads each channel's topic and Neil's description", () => {
  test("maps the topic of a channel, and leaves it out when the channel has none", async () => {
    const server = new FakeSetupServer();
    server.defineChannel("general", { kind: "text", topic: "Chat here." });
    server.defineChannel("off-topic", { kind: "text" });

    const state = await readServer(server);

    expect(state.channels.find((channel) => channel.name === "general")?.topic).toBe("Chat here.");
    expect(state.channels.find((channel) => channel.name === "off-topic")?.topic).toBeUndefined();
  });

  test("reads the oldest pin by Neil that starts with the pin mark as the description, and ignores the other pins", async () => {
    const server = new FakeSetupServer();
    const general = server.defineChannel("general", { kind: "text" });
    server.definePin(general, { authorId: OTHER_USER_ID, content: `${PIN} **#general**\nWritten by a Member.` });
    server.definePin(general, { authorId: server.botUserId, content: "A note that does not start with the mark." });
    const oldest = server.definePin(general, { authorId: server.botUserId, content: `${PIN} **#general**\nThe oldest.` });
    server.definePin(general, { authorId: server.botUserId, content: `${PIN} **#general**\nA newer one.` });

    const state = await readServer(server);

    expect(state.channels.find((channel) => channel.name === "general")?.description).toEqual({
      messageId: oldest,
      text: `${PIN} **#general**\nThe oldest.`,
    });
  });

  test("reads Neil's description of text, announcement and voice channels, and reads no pins of a forum or a category", async () => {
    const server = new FakeSetupServer({ features: COMMUNITY });
    const hangout = server.defineChannel("Hangout", { kind: "category" });
    const general = server.defineChannel("general", { kind: "text", parentId: hangout });
    const news = server.defineChannel("news", { kind: "announcement", parentId: hangout });
    const lounge = server.defineChannel("lounge", { kind: "voice", parentId: hangout });
    const tactics = server.defineChannel("tactics", { kind: "forum", parentId: hangout });
    const generalPin = server.definePin(general, { authorId: server.botUserId, content: `${PIN} **#general**\nA.` });
    const newsPin = server.definePin(news, { authorId: server.botUserId, content: `${PIN} **#news**\nB.` });
    const loungePin = server.definePin(lounge, { authorId: server.botUserId, content: `${PIN} **#lounge**\nC.` });
    server.definePin(tactics, { authorId: server.botUserId, content: `${PIN} **#tactics**\nD.` });
    const readPins = vi.spyOn(server, "readPins");

    const state = await readServer(server);
    const byName = (name: string) => state.channels.find((channel) => channel.name === name);

    expect(byName("general")?.description?.messageId).toBe(generalPin);
    expect(byName("news")?.description?.messageId).toBe(newsPin);
    expect(byName("lounge")?.description?.messageId).toBe(loungePin);
    expect(byName("tactics")?.description).toBeUndefined();
    expect(byName("Hangout")?.description).toBeUndefined();
    expect(readPins).not.toHaveBeenCalledWith(tactics);
    expect(readPins).not.toHaveBeenCalledWith(hangout);
  });
});

describe("runSetup creates topics and descriptions on an empty server", () => {
  test("creates each channel with its description as topic, and a voice channel with no topic", async () => {
    const server = new FakeSetupServer({ botPermissions: ADMINISTRATOR, features: COMMUNITY });

    const { exitCode } = await runSetup({ layout: DESCRIBED_LAYOUT, homeKingdom: HOME_KINGDOM, apply: true, port: server, secrets: [] });

    expect(exitCode).toBe(0);
    expect(server.findChannel("general")?.topic).toBe("Chat with the Kingdom.");
    expect(server.findChannel("news")?.topic).toBe("News from the King.");
    expect(server.findChannel("tactics")?.topic).toBe("Tactics for the Kingdom.");
    expect(server.findChannel("lounge")?.topic).toBeUndefined();
  });

  test("posts one description in each text, announcement and voice channel after its creation, and none in a forum", async () => {
    const server = new FakeSetupServer({ botPermissions: ADMINISTRATOR, features: COMMUNITY });

    await runSetup({ layout: DESCRIBED_LAYOUT, homeKingdom: HOME_KINGDOM, apply: true, port: server, secrets: [] });

    for (const name of ["general", "news", "lounge"]) {
      const id = channelId(server, name);
      const posts = postsIn(server, id);
      expect(posts).toHaveLength(1);
      expect(posts[0]?.content.startsWith(`${PIN} **#${name}**`)).toBe(true);
      expect(server.sequence.indexOf(`post-pinned-message ${name}`)).toBeGreaterThan(server.sequence.indexOf(`create-channel ${name}`));
    }
    const tacticsId = channelId(server, "tactics");
    expect(server.channelWrites.some((write) => write.op === "post-pinned-message" && write.channelId === tacticsId)).toBe(false);
  });

  test("a second real run on the same server says Nothing to do. and writes nothing", async () => {
    const server = new FakeSetupServer({ botPermissions: ADMINISTRATOR, features: COMMUNITY });
    await runSetup({ layout: DESCRIBED_LAYOUT, homeKingdom: HOME_KINGDOM, apply: true, port: server, secrets: [] });
    expect(await pinsOf(server, "general")).toEqual([descriptionOf(DESCRIBED_LAYOUT, "general")]);
    const writesBefore = server.writes.length;
    const channelWritesBefore = server.channelWrites.length;

    const { report, exitCode } = await runSetup({ layout: DESCRIBED_LAYOUT, homeKingdom: HOME_KINGDOM, apply: true, port: server, secrets: [] });

    expect(lines(report)).toContain("Nothing to do.");
    expect(exitCode).toBe(0);
    expect(server.writes).toHaveLength(writesBefore);
    expect(server.channelWrites).toHaveLength(channelWritesBefore);
  });
});

describe("runSetup corrects a stale topic and description", () => {
  test("says would set topic, would edit description and would post description on a dry run, and writes nothing", async () => {
    const server = serverWithStaleDescriptions();

    const { report } = await runSetup({ layout: STALE_LAYOUT, homeKingdom: HOME_KINGDOM, apply: false, port: server, secrets: [] });

    expect(lines(report)).toContain("would set topic of general");
    expect(lines(report)).toContain("would edit description in general");
    expect(lines(report)).toContain("would set topic of news");
    expect(lines(report)).toContain("would post description in news");
    expect(server.writes).toHaveLength(0);
    expect(server.channelWrites).toHaveLength(0);
    expect(server.findChannel("general")?.topic).toBe("Old topic.");
  });

  test("sets the topic, edits the description and posts the new one on a real run, and reports them without would", async () => {
    const server = serverWithStaleDescriptions({ botPermissions: ADMINISTRATOR });
    const generalId = channelId(server, "general");

    const { report } = await runSetup({ layout: STALE_LAYOUT, homeKingdom: HOME_KINGDOM, apply: true, port: server, secrets: [] });

    expect(lines(report)).toContain("set topic of general");
    expect(lines(report)).toContain("edit description in general");
    expect(lines(report)).toContain("set topic of news");
    expect(lines(report)).toContain("post description in news");
    expect(report).not.toMatch(/would /);
    expect(server.findChannel("general")?.topic).toBe("Chat with the Kingdom.");
    expect(
      server.channelWrites.some(
        (write) => write.op === "edit-message" && write.channelId === generalId && write.content.includes("Chat with the Kingdom."),
      ),
    ).toBe(true);
    expect(await pinsOf(server, "general")).toEqual([descriptionOf(STALE_LAYOUT, "general")]);
  });

  test("applies the topics and descriptions after the overwrites", async () => {
    const server = serverWithStaleDescriptions();
    const plan = await planFor(STALE_LAYOUT, server);

    await applySetup(plan, server);

    const firstDescriptionWrite = server.sequence.findIndex((entry) => /^(set-topic|post-pinned-message|edit-message) /.test(entry));
    expect(server.sequence.some((entry) => entry.startsWith("edit-overwrites "))).toBe(true);
    expect(firstDescriptionWrite).toBeGreaterThan(-1);
    expect(server.sequence.slice(firstDescriptionWrite).filter((entry) => entry.startsWith("edit-overwrites "))).toEqual([]);
  });
});

describe("runSetup reports a description whose channel failed to be created", () => {
  test("applySetup gives the post-description step of that channel a failed outcome", async () => {
    const server = new FakeSetupServer({ features: COMMUNITY });
    server.failWrite("create-channel", "general", new Error("Discord refused"));
    const plan = await planFor(DESCRIBED_LAYOUT, server);

    const outcomes = await applySetup(plan, server);

    const description = outcomes.find((outcome) => outcome.step.kind === "post-description" && outcome.step.name === "general");
    expect(description?.status).toBe("failed");
    expect(server.channelWrites.some((write) => write.op === "post-pinned-message" && write.content.startsWith(`${PIN} **#general**`))).toBe(false);
  });

  test("the report names the description as failed and exits 1", async () => {
    const server = new FakeSetupServer({ botPermissions: ADMINISTRATOR, features: COMMUNITY });
    server.failWrite("create-channel", "general", new Error("Discord refused"));

    const { report, exitCode } = await runSetup({ layout: DESCRIBED_LAYOUT, homeKingdom: HOME_KINGDOM, apply: true, port: server, secrets: [] });

    expect(indexWhere(report, (line) => line.startsWith("failed:") && line.includes("post description in general"))).toBeGreaterThan(-1);
    expect(exitCode).toBe(1);
  });
});

describe("runSetup refuses a description message over 2000 characters", () => {
  test("exits 1, names the channel and writes nothing, even on a real run", async () => {
    const server = new FakeSetupServer({ botPermissions: ADMINISTRATOR, features: COMMUNITY });
    const longLine = "x".repeat(90);
    const layout: ServerLayout = {
      roles: [KINGDOM_ROLE],
      externalRoles: [],
      languages: [],
      translations: [],
      categories: [
        {
          name: "Hangout",
          seenBy: [KINGDOM_ROLE],
          channels: [
            {
              name: "general",
              type: "text",
              description: "The code of conduct is long.",
              codeOfConduct: Array.from({ length: 25 }, () => longLine),
            },
          ],
        },
      ],
      allianceArea: { channels: [] },
    };

    const { report, exitCode } = await runSetup({ layout, homeKingdom: HOME_KINGDOM, apply: true, port: server, secrets: [] });

    expect(exitCode).toBe(1);
    expect(lines(report).some((line) => line.includes("general") && line.includes("2000"))).toBe(true);
    expect(server.writes).toHaveLength(0);
    expect(server.channelWrites).toHaveLength(0);
    expect(server.sequence).toHaveLength(0);
  });
});

describe("a dry run without Administrator reads no pins where Discord refuses the read", () => {
  test("readServer maps a refused pin read to pinsReadable false, and a readable one to true", async () => {
    const server = new FakeSetupServer({ features: COMMUNITY });
    server.defineChannel("general", { kind: "text" });
    server.defineChannel("news", { kind: "announcement" });
    server.refusePinReads("general");

    const state = await readServer(server);

    expect(state.channels.find((channel) => channel.name === "general")?.pinsReadable).toBe(false);
    expect(state.channels.find((channel) => channel.name === "news")?.pinsReadable).toBe(true);
  });

  test("reports one line for all the channels whose pins are unread, with their count, and exits 0", async () => {
    const server = new FakeSetupServer({ features: COMMUNITY });
    const hangout = server.defineChannel("Hangout", { kind: "category" });
    server.defineChannel("general", { kind: "text", parentId: hangout });
    server.defineChannel("news", { kind: "announcement", parentId: hangout });
    server.defineChannel("lounge", { kind: "voice", parentId: hangout });
    server.refusePinReads("general");
    server.refusePinReads("news");
    server.refusePinReads("lounge");

    const { report, exitCode } = await runSetup({ layout: DESCRIBED_LAYOUT, homeKingdom: HOME_KINGDOM, apply: false, port: server, secrets: [] });

    expect(lines(report).filter((line) => line.includes("can't read the pinned messages"))).toEqual([
      "Neil can't read the pinned messages of 3 channels without Administrator; a real run checks their descriptions.",
    ]);
    expect(exitCode).toBe(0);
    expect(server.writes).toHaveLength(0);
    expect(server.channelWrites).toHaveLength(0);
  });
});
