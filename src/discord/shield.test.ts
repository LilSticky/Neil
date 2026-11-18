import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { MessageFlags, type InteractionReplyOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openDatabase } from "../storage/database.js";
import { ShieldStore } from "../storage/shield-store.js";
import { FakeLinkStore } from "./__fakes__/link-store.js";
import { createShieldCommands, shieldButtonId, type ShieldChannel, type ShieldCommands } from "./shield.js";

const ALICE = "111111111111111111"; // Linked, holds [NML]
const BOB = "222222222222222222"; // not Linked
const OFFICER = "999999999999999999";
const KING_ROLE_ID = "12345678901234567";
const MODERATOR_ROLE_ID = "12345678901234568";

/** Wednesday 18 November 2026, 12:00 UTC: the next Shield Deadline is Saturday 21 November, 02:00 UTC. */
const WEDNESDAY = new Date("2026-11-18T12:00:00Z");
const WEEK = "2026-11-21";
const DEADLINE_UNIX = Math.floor(Date.parse("2026-11-21T02:00:00Z") / 1000).toString();
const NML_CHAT: ShieldChannel = { name: "alliance-chat", categoryName: "[NML]" };

class Replies {
  readonly replies: InteractionReplyOptions[] = [];

  reply(options: InteractionReplyOptions): Promise<unknown> {
    this.replies.push(options);
    return Promise.resolve();
  }

  get content(): string | undefined {
    const first = this.replies[0];
    return typeof first?.content === "string" ? first.content : undefined;
  }
}

describe("Shield Reminders commands", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let store: ShieldStore;
  let links: FakeLinkStore;
  let clock: Date;
  let logs: string[];
  let errors: string[];
  let commands: ShieldCommands;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-shield-commands-"));
    db = openDatabase(dataDir);
    store = new ShieldStore(db);
    links = new FakeLinkStore();
    links.link(ALICE, { source: "game-api", rank: "R2" });
    clock = WEDNESDAY;
    logs = [];
    errors = [];
    commands = createShieldCommands({
      shield: store,
      links,
      officerRoleIds: [MODERATOR_ROLE_ID, KING_ROLE_ID],
      now: () => clock,
      log: (line) => {
        logs.push(line);
        return Promise.resolve();
      },
      logError: (line) => {
        errors.push(line);
      },
    });
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function kvkWeek(subcommand: string, roleIds: readonly string[] = [KING_ROLE_ID], userId = OFFICER): Promise<Replies> {
    const answer = new Replies();
    await commands.onKvkWeek({
      user: { id: userId },
      options: { getSubcommand: () => subcommand },
      memberRoleIds: () => roleIds,
      reply: (options) => answer.reply(options),
    });
    return answer;
  }

  async function press(
    userId: string,
    roleNames: readonly string[] = ["[NML]"],
    channel: ShieldChannel = NML_CHAT,
    customId = shieldButtonId(WEEK),
  ): Promise<Replies> {
    const answer = new Replies();
    await commands.onPress({
      customId,
      user: { id: userId },
      channel,
      memberRoleNames: () => roleNames,
      reply: (options) => answer.reply(options),
    });
    return answer;
  }

  async function reminders(userId: string, choice: string | null): Promise<Replies> {
    const answer = new Replies();
    await commands.onReminders({
      user: { id: userId },
      options: { getString: () => choice },
      reply: (options) => answer.reply(options),
    });
    return answer;
  }

  describe("/kvk-week", () => {
    test.each([KING_ROLE_ID, MODERATOR_ROLE_ID])("an Officer marks the week of the next Friday's reset, privately", async (roleId) => {
      const answer = await kvkWeek("mark", [roleId]);

      expect(store.markOf(WEEK)).toEqual({ week: WEEK, markedAt: WEDNESDAY, markedBy: OFFICER });
      expect(answer.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(answer.content).toContain(`<t:${DEADLINE_UNIX}:F>`);
      expect(answer.content).toContain(`<t:${DEADLINE_UNIX}:R>`);
      expect(logs).toEqual([`🛡️ <@${OFFICER}> marked the week of ${WEEK} as a KvK Week.`]);
    });

    test("marking twice says the week is already marked, and logs nothing more", async () => {
      await kvkWeek("mark");
      const answer = await kvkWeek("mark");

      expect(answer.content).toContain("already a KvK Week");
      expect(logs).toHaveLength(1);
    });

    test("on Saturday after the reset it acts on the next week", async () => {
      clock = new Date("2026-11-21T02:00:00Z");

      await kvkWeek("mark");

      expect(store.markOf(WEEK)).toBeUndefined();
      expect(store.markOf("2026-11-28")).toBeDefined();
    });

    test("unmark deletes the mark and that week's Shield Confirmations, and logs it", async () => {
      await kvkWeek("mark");
      store.confirm(WEEK, ALICE, WEDNESDAY);

      const answer = await kvkWeek("unmark");

      expect(store.markOf(WEEK)).toBeUndefined();
      expect(store.confirmed(WEEK)).toEqual(new Set());
      expect(answer.content).toContain("unmarked");
      expect(logs[1]).toBe(`🛡️ <@${OFFICER}> unmarked the week of ${WEEK} as a KvK Week.`);
    });

    test("unmarking a week that is not marked changes nothing and says so", async () => {
      const answer = await kvkWeek("unmark");

      expect(answer.content).toContain("is not a KvK Week. Nothing was changed.");
      expect(logs).toEqual([]);
    });

    test("show says whether the coming week is marked", async () => {
      expect((await kvkWeek("show")).content).toContain("is not a KvK Week");
      await kvkWeek("mark");
      expect((await kvkWeek("show")).content).toContain("is a KvK Week");
    });

    test.each(["mark", "unmark", "show"])("refuses %s for anyone but an Officer, privately, and changes nothing", async (subcommand) => {
      store.mark(WEEK, WEDNESDAY, OFFICER);

      const answer = await kvkWeek(subcommand, ["98765432109876543"], ALICE);

      expect(answer.content).toBe("Only Officers mark KvK Weeks. Nothing was changed.");
      expect(answer.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(store.markOf(WEEK)?.markedBy).toBe(OFFICER);
    });
  });

  describe("the Shielded button", () => {
    beforeEach(() => {
      store.mark(WEEK, WEDNESDAY, OFFICER);
    });

    test("records a Shield Confirmation for a Linked holder of the Alliance role, privately, once", async () => {
      const first = await press(ALICE);
      const second = await press(ALICE);

      expect(store.confirmed(WEEK)).toEqual(new Set([ALICE]));
      expect(first.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(first.content).toContain("recorded that you are shielded");
      expect(second.content).toBe("Your Shield Confirmation for this week is already recorded.");
    });

    test("refuses a Member who is not Linked", async () => {
      const answer = await press(BOB);

      expect(answer.content).toContain("Only a Linked Member of this Alliance");
      expect(store.confirmed(WEEK)).toEqual(new Set());
    });

    test("refuses a Linked Member without the Alliance role of the channel", async () => {
      const answer = await press(ALICE, ["[ABC]"]);

      expect(answer.content).toContain("Only a Linked Member of this Alliance");
      expect(store.confirmed(WEEK)).toEqual(new Set());
    });

    test("refuses a press outside an Alliance's alliance-chat", async () => {
      expect((await press(ALICE, ["[NML]"], { name: "general", categoryName: "[NML]" })).content).toContain("Only a Linked");
      expect((await press(ALICE, ["[NML]"], { name: "alliance-chat", categoryName: "Hangout" })).content).toContain("Only a Linked");
      const noChannel = new Replies();
      await commands.onPress({
        customId: shieldButtonId(WEEK),
        user: { id: ALICE },
        channel: undefined,
        memberRoleNames: () => ["[NML]"],
        reply: (options) => noChannel.reply(options),
      });
      expect(noChannel.content).toContain("Only a Linked");
      expect(store.confirmed(WEEK)).toEqual(new Set());
    });

    test("refuses a press after Friday's reset", async () => {
      clock = new Date("2026-11-21T02:00:00Z");

      const answer = await press(ALICE);

      expect(answer.content).toBe("Friday's reset has passed. Nothing was recorded.");
      expect(store.confirmed(WEEK)).toEqual(new Set());
    });

    test("refuses a press for a week that is no longer marked", async () => {
      store.unmark(WEEK);

      const answer = await press(ALICE);

      expect(answer.content).toBe("This week is no longer a KvK Week. Nothing was recorded.");
      expect(store.confirmed(WEEK)).toEqual(new Set());
    });

    test("refuses a button it does not know", async () => {
      expect((await press(ALICE, ["[NML]"], NML_CHAT, "shield:yesterday")).content).toContain("not one Neil knows");
    });

    test("a failed reply is logged, never thrown", async () => {
      await commands.onPress({
        customId: shieldButtonId(WEEK),
        user: { id: ALICE },
        channel: NML_CHAT,
        memberRoleNames: () => ["[NML]"],
        reply: () => Promise.reject(new Error("Unknown interaction")),
      });

      expect(errors).toEqual([expect.stringContaining("Unknown interaction")]);
      expect(store.confirmed(WEEK)).toEqual(new Set([ALICE]));
    });
  });

  describe("/shield-reminders", () => {
    test("without an option shows the current choice, on until recorded", async () => {
      expect((await reminders(ALICE, null)).content).toContain("**on**");
    });

    test("off switches the reminders off, and on brings them back", async () => {
      const off = await reminders(ALICE, "off");
      expect(store.isOff(ALICE)).toBe(true);
      expect(off.content).toContain("now **off**");
      expect((await reminders(ALICE, null)).content).toContain("**off**");

      await reminders(ALICE, "on");
      expect(store.isOff(ALICE)).toBe(false);
    });

    test("refuses a Member who is not Linked, privately", async () => {
      const answer = await reminders(BOB, "off");

      expect(answer.content).toBe("Only Linked Members can choose their Shield Reminders. Nothing was changed.");
      expect(answer.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(store.isOff(BOB)).toBe(false);
    });

    test("a Member with reminders off can still press Shielded", async () => {
      store.mark(WEEK, WEDNESDAY, OFFICER);
      await reminders(ALICE, "off");

      await press(ALICE);

      expect(store.confirmed(WEEK)).toEqual(new Set([ALICE]));
    });
  });
});
