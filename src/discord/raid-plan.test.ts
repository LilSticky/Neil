import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { InteractionEditReplyOptions, InteractionReplyOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Link } from "../domain/link.js";
import { openDatabase } from "../storage/database.js";
import { RaidStore } from "../storage/raid-store.js";
import { FakeRaidServer, WAR_COUNCIL_ROLE_ID } from "./__fakes__/raid-server.js";
import type { EventRole } from "./events.js";
import { createRaidPlanning, type RaidConfirmPress, type RaidPlanInteraction, type RaidPlanning, type RaidSettings } from "./raid-plan.js";

const RAID_ID = "2026-11-21";
const ANNOUNCEMENTS = "800000000000000001";
const LEADERS = "800000000000000002";
/** Thursday, before the Raid of Saturday 2026-11-21 at 12:00 Server Time (14:00 UTC). */
const THURSDAY = new Date("2026-11-19T12:00:00.000Z");
const SETTINGS: RaidSettings = { warCouncilRoleId: WAR_COUNCIL_ROLE_ID, planHours: 24, confirmationHours: 2 };
const WAR_COUNCIL: EventRole[] = [{ id: WAR_COUNCIL_ROLE_ID, name: "War Council" }];

interface Answers {
  replies: InteractionReplyOptions[];
  edits: InteractionEditReplyOptions[];
  deferred: number;
}

function command(subcommand: string, values: Record<string, string> = {}, roles: EventRole[] = WAR_COUNCIL): RaidPlanInteraction & Answers {
  const answers: Answers = { replies: [], edits: [], deferred: 0 };
  return Object.assign(answers, {
    user: { id: "900" },
    options: { getSubcommand: () => subcommand, getString: (name: string) => values[name] ?? null },
    memberRoles: () => roles,
    reply: (options: InteractionReplyOptions) => {
      answers.replies.push(options);
      return Promise.resolve();
    },
    deferReply: () => {
      answers.deferred += 1;
      return Promise.resolve();
    },
    editReply: (options: InteractionEditReplyOptions) => {
      answers.edits.push(options);
      return Promise.resolve();
    },
  });
}

function press(userId: string, roleNames: string[]): RaidConfirmPress & { replies: InteractionReplyOptions[] } {
  const replies: InteractionReplyOptions[] = [];
  return {
    replies,
    customId: `raid:confirm:${RAID_ID}`,
    user: { id: userId },
    memberRoles: () => roleNames.map((name) => ({ id: `role-${name}`, name })),
    reply: (options) => {
      replies.push(options);
      return Promise.resolve();
    },
  };
}

function linkWithRank(memberId: string, rank: "R5" | "R4" | "R3"): Link {
  return {
    memberId,
    uid: "123" as Link["uid"],
    linkedAt: THURSDAY,
    allianceRank: { source: "game-api", rank },
    madeBy: { kind: "in-game-proof" } as unknown as Link["madeBy"],
  };
}

const RANKS: Record<string, "R5" | "R4" | "R3"> = { "101": "R5", "102": "R4", "103": "R3", "201": "R5" };

describe("/raid-plan", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let raids: RaidStore;
  let server: FakeRaidServer;
  let now: Date;
  let errors: string[];

  function planning(settings: RaidSettings = SETTINGS): RaidPlanning {
    return createRaidPlanning({
      raids,
      links: { linkFor: (memberId) => (RANKS[memberId] === undefined ? undefined : linkWithRank(memberId, RANKS[memberId])) },
      server,
      settings,
      now: () => now,
      logError: (line) => errors.push(line),
    });
  }

  async function run(subcommand: string, values: Record<string, string> = {}): Promise<string> {
    const interaction = command(subcommand, values);
    await planning().onCommand(interaction);
    const content = interaction.edits[0]?.content;
    return typeof content === "string" ? content : "";
  }

  async function draftPlan(): Promise<void> {
    await run("phase-add", { name: "Opening", time: "12:00" });
    await run("assign", { alliance: "NML", objective: "Royal City", phase: "Opening", task: "Hold the gate" });
  }

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-raid-plan-"));
    db = openDatabase(dataDir);
    raids = new RaidStore(db);
    server = new FakeRaidServer();
    now = THURSDAY;
    errors = [];
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("answers that Raid planning is not set up when no War Council role is configured", async () => {
    const interaction = command("show");
    await planning({ ...SETTINGS, warCouncilRoleId: undefined }).onCommand(interaction);

    expect(interaction.replies[0]?.content).toBe("Raid planning is not set up on this server.");
  });

  test("refuses a caller without the War Council role, privately, and changes nothing", async () => {
    const interaction = command("notes", { text: "x" }, [{ id: "role-King", name: "King" }]);
    await planning().onCommand(interaction);

    expect(interaction.replies[0]).toEqual(expect.objectContaining({ content: "Only the War Council plans the Raid. Neil has changed nothing." }));
    expect(interaction.replies[0]?.flags).toBeDefined();
    expect(raids.find(RAID_ID)).toBeUndefined();
  });

  test("a change is saved at once, logged, and answered with the private preview", async () => {
    const answer = await run("phase-add", { name: "Opening", time: "12:00" });

    expect(answer).toContain("Saved.");
    expect(raids.find(RAID_ID)?.raid.plan.phases[0]?.at.toISOString()).toBe("2026-11-21T14:00:00.000Z");
    expect(server.logs[0]).toContain("added a Phase");
  });

  test("a refused change answers why and saves nothing", async () => {
    const answer = await run("phase-add", { name: "Early", time: "11:00" });

    expect(answer).toContain("can't start before the Raid");
    expect(raids.find(RAID_ID)).toBeUndefined();
  });

  test("publishing posts the plan card in kvk-announcements, and the confirmation card asking only the R5s and R4s in kvk-leaders", async () => {
    await draftPlan();
    const answer = await run("publish");

    expect(answer).toContain("published the Battle Plan");
    const [plan] = server.postsIn(ANNOUNCEMENTS);
    expect(plan?.message.embeds).toEqual([expect.objectContaining({ title: "Battle Plan" })]);
    const leaders = server.postsIn(LEADERS);
    expect(leaders).toHaveLength(1);
    expect(leaders[0]?.message.allowedMentions).toEqual({ parse: [], users: ["101", "102", "201", "301"] });
    expect(leaders[0]?.message.components).toHaveLength(1);
    expect(raids.find(RAID_ID)?.raid.state.kind).toBe("published");
    expect(raids.find(RAID_ID)?.confirmationCard).toEqual({ channelId: LEADERS, messageId: leaders[0]?.messageId });
  });

  test("publishing without kvk-leaders posts nothing and says so", async () => {
    await draftPlan();
    server.channels.delete("kvk-leaders");

    expect(await run("publish")).toContain("no #kvk-leaders");
    expect(server.posts).toEqual([]);
    expect(raids.find(RAID_ID)?.raid.state.kind).toBe("draft");
  });

  test("publishing again edits both cards in place and keeps the confirmations", async () => {
    await draftPlan();
    await run("publish");
    await planning().onConfirm(press("101", ["[NML]", "R5"]));
    await run("assign", { alliance: "ABC", objective: "Enemy sanctuaries" });
    const before = server.posts.length;

    expect(await run("publish")).toContain("updated the posted Battle Plan");
    expect(server.posts).toHaveLength(before);
    const planEdit = server.edits.filter((edit) => edit.card.channelId === ANNOUNCEMENTS).at(-1);
    expect(planEdit?.edit.embeds[0]?.description).toContain("Amended");
    expect(raids.confirmations(RAID_ID)).toHaveLength(1);
  });

  test("a card gone from Discord is posted again, without mentions, and logged", async () => {
    await draftPlan();
    await run("publish");
    const confirmation = raids.find(RAID_ID)?.confirmationCard;
    server.gone.add(confirmation?.messageId ?? "");

    await run("publish");

    const reposted = server.postsIn(LEADERS).at(-1);
    expect(reposted?.message.allowedMentions).toEqual({ parse: [] });
    expect(raids.find(RAID_ID)?.confirmationCard?.messageId).toBe(reposted?.messageId);
    expect(server.logs.some((line) => line.includes("was gone"))).toBe(true);
  });

  test("a cancelled Raid edits the plan card, disables the button, tells kvk-leaders once, and takes no more changes", async () => {
    await draftPlan();
    await run("publish");

    expect(await run("cancel")).toContain("cancelled this week's Raid");
    const planEdit = server.edits.find((edit) => edit.card.channelId === ANNOUNCEMENTS);
    expect(planEdit?.edit.embeds[0]?.title).toBe("Battle Plan (cancelled)");
    const confirmationEdit = server.edits.find((edit) => edit.card.channelId === LEADERS);
    expect(confirmationEdit?.edit.components[0]?.components[0]?.disabled).toBe(true);
    expect(server.postsIn(LEADERS).at(-1)?.message.content).toContain("is cancelled");
    expect(await run("publish")).toContain("cancelled");
  });

  test("show answers with the plan card and the state, privately", async () => {
    const interaction = command("show");
    await planning().onCommand(interaction);

    expect(interaction.deferred).toBe(1);
    expect(interaction.edits[0]?.content).toContain("Draft, not published.");
    expect(interaction.edits[0]?.embeds).toEqual([expect.objectContaining({ title: "Battle Plan" })]);
  });

  test("autocomplete offers the plan's Objectives, Phases and the server's Alliances", async () => {
    await draftPlan();
    const choices: { name: string }[][] = [];
    const ask = (name: string, value: string) =>
      planning().onAutocomplete({
        options: { getFocused: () => ({ name, value }) },
        memberRoles: () => WAR_COUNCIL,
        respond: (offered) => {
          choices.push(offered);
          return Promise.resolve();
        },
      });

    await ask("objective", "cannon");
    await ask("phase", "");
    await ask("alliance", "n");

    expect(choices[0]?.map((choice) => choice.name)).toEqual([
      "Cannon Tower North",
      "Cannon Tower East",
      "Cannon Tower South",
      "Cannon Tower West",
    ]);
    expect(choices[1]?.map((choice) => choice.name)).toEqual(["Opening"]);
    expect(choices[2]?.map((choice) => choice.name)).toEqual(["NML"]);
  });

  test("autocomplete suggests nothing to a Member without the War Council role", async () => {
    await draftPlan();
    const choices: { name: string }[][] = [];
    const ask = (name: string, value: string) =>
      planning().onAutocomplete({
        options: { getFocused: () => ({ name, value }) },
        memberRoles: () => [{ id: "role-King", name: "King" }],
        respond: (offered) => {
          choices.push(offered);
          return Promise.resolve();
        },
      });

    await ask("objective", "");
    await ask("phase", "");
    await ask("alliance", "");

    expect(choices).toEqual([[], [], []]);
  });

  test("a publish whose save fails posts no plan card and leaves the Raid a draft", async () => {
    await draftPlan();
    const save = raids.save.bind(raids);
    raids.save = (raid) => {
      if (raid.state.kind === "published") throw new Error("disk full");
      save(raid);
    };

    await run("publish");

    expect(server.posts).toEqual([]);
    expect(raids.find(RAID_ID)?.raid.state.kind).toBe("draft");
  });
});

describe("the Read and confirmed button", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let raids: RaidStore;
  let server: FakeRaidServer;
  let planning: RaidPlanning;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-raid-confirm-"));
    db = openDatabase(dataDir);
    raids = new RaidStore(db);
    server = new FakeRaidServer();
    planning = createRaidPlanning({
      raids,
      links: { linkFor: (memberId) => (RANKS[memberId] === undefined ? undefined : linkWithRank(memberId, RANKS[memberId])) },
      server,
      settings: SETTINGS,
      now: () => THURSDAY,
      logError: () => undefined,
    });
    const run = async (subcommand: string, values: Record<string, string> = {}) => {
      await planning.onCommand(command(subcommand, values));
    };
    await run("phase-add", { name: "Opening", time: "12:00" });
    await run("assign", { alliance: "NML", objective: "Royal City", phase: "Opening" });
    await run("publish");
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("an R5 confirms once for the Alliance, and the card shows who and when", async () => {
    const pressed = press("101", ["[NML]", "R5"]);
    await planning.onConfirm(pressed);

    expect(pressed.replies[0]?.content).toBe("Thank you: [NML] has confirmed the Battle Plan.");
    expect(raids.confirmations(RAID_ID)).toEqual([{ tag: "NML", memberId: "101", at: THURSDAY }]);
    const card = server.edits.find((edit) => edit.card.channelId === LEADERS);
    expect(card?.edit.embeds[0]?.fields?.[0]?.value).toContain("[NML]: confirmed by <@101>");
    expect(server.logs.some((line) => line.includes("confirmed the Battle Plan for [NML]"))).toBe(true);
  });

  test("an R4 may confirm; a second press answers privately who confirmed", async () => {
    await planning.onConfirm(press("102", ["[NML]", "R4"]));
    const second = press("101", ["[NML]", "R5"]);
    await planning.onConfirm(second);

    expect(second.replies[0]?.content).toContain("[NML] has already confirmed: <@102>");
    expect(raids.confirmations(RAID_ID)).toHaveLength(1);
  });

  test("an off-plan Alliance's R5 may confirm too", async () => {
    await planning.onConfirm(press("201", ["[ABC]", "R5"]));

    expect(raids.confirmations(RAID_ID).map((confirmation) => confirmation.tag)).toEqual(["ABC"]);
  });

  test("another Member gets a private refusal", async () => {
    const pressed = press("103", ["[NML]", "R3"]);
    await planning.onConfirm(pressed);

    expect(pressed.replies[0]?.content).toContain("Only an R5 or R4");
    expect(raids.confirmations(RAID_ID)).toEqual([]);
  });

  test("a cancelled Raid takes no confirmation", async () => {
    await planning.onCommand(command("cancel"));
    const pressed = press("101", ["[NML]", "R5"]);
    await planning.onConfirm(pressed);

    expect(pressed.replies[0]?.content).toContain("cancelled");
    expect(raids.confirmations(RAID_ID)).toEqual([]);
  });

});
