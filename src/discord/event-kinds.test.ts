import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { MessageFlags } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { EventKind } from "../domain/events.js";
import { openDatabase } from "../storage/database.js";
import { EventStore } from "../storage/event-store.js";
import { ShieldStore } from "../storage/shield-store.js";
import { FakeEventKindsInteraction, type EventKindsOptionValues } from "./__fakes__/event-kinds-interaction.js";
import { FakeLinkStore } from "./__fakes__/link-store.js";
import { handleEventKinds, type EventKindsContext } from "./event-kinds.js";
import type { EventRole } from "./events.js";

const ALICE = "111111111111111111"; // R5 of NML
const BOB = "222222222222222222"; // R4 of NML
const CAROL = "333333333333333333"; // a Member with no R4 or R5 and no Officer role
const DAN = "444444444444444444"; // an Officer, not Linked
const EVE = "555555555555555555"; // an Officer who is also R5 of NML
const FRANK = "666666666666666666"; // R3 of NML

const MEMBER_ROLE: EventRole = { id: "98765432109876543", name: "Member" };
const NML_ROLE: EventRole = { id: "11100000000000001", name: "[NML]" };
const KING_ROLE: EventRole = { id: "12345678901234567890", name: "King" };
const MODERATOR_ROLE: EventRole = { id: "12345678901234567", name: "Moderator" };

/** Monday 16 November 2026, 12:00 UTC: the next Duel-day reset is Tuesday 02:00 UTC. */
const MONDAY_NOON = new Date("2026-11-16T12:00:00Z");

/** The Alliance Duel line of the kingdom's list, with the next Duel-day reset as Discord timestamps. */
function allianceDuelLine(nextReset: string): string {
  const unix = Math.floor(new Date(nextReset).getTime() / 1000).toString();
  return `- **Alliance Duel**: daily plan in #event-announcements at 00:00 Server Time, Monday to Saturday; next <t:${unix}:t> (<t:${unix}:R>)`;
}

/** The Shield line of the kingdom's list, with the next Shield Deadline as Discord timestamps. */
function shieldLine(leads: string, deadline: string, marked: boolean): string {
  const unix = Math.floor(new Date(deadline).getTime() / 1000).toString();
  return `- **Shield**: ${leads} before Friday's reset; next <t:${unix}:F> (<t:${unix}:R>), KvK Week: ${marked ? "marked" : "not marked"}`;
}

/** The Shield Deadline after MONDAY_NOON: Saturday 21 November 2026, 02:00 UTC. */
const NEXT_SHIELD_DEADLINE = "2026-11-21T02:00:00Z";

/** An Event Kind with lead times and no Sign-up Deadline. */
function plainKind(name: string, beforeStart: readonly number[]): EventKind {
  return { name, beforeStart, signupOffsetMinutes: undefined, beforeSignup: [] };
}

describe("/event-kinds", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let events: EventStore;
  let shield: ShieldStore;
  let links: FakeLinkStore;
  let logged: string[];
  let clock: Date;

  beforeEach(() => {
    clock = MONDAY_NOON;
    dataDir = mkdtempSync(join(tmpdir(), "neil-event-kinds-cmd-"));
    db = openDatabase(dataDir);
    events = new EventStore(db);
    shield = new ShieldStore(db);
    links = new FakeLinkStore();
    logged = [];
    links.link(ALICE, { source: "game-api", rank: "R5" });
    links.link(BOB, { source: "game-api", rank: "R4" });
    links.link(CAROL, { source: "game-api", rank: "R1" });
    links.link(EVE, { source: "game-api", rank: "R5" });
    links.link(FRANK, { source: "game-api", rank: "R3" });
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function context(): EventKindsContext {
    return {
      links,
      events,
      officerRoleIds: [KING_ROLE.id, MODERATOR_ROLE.id],
      shield,
      now: () => clock,
      logError: (message: string) => {
        logged.push(message);
      },
    };
  }

  /** Runs a /event-kinds subcommand for the caller, with the roles and options given. */
  async function run(
    userId: string,
    roles: readonly EventRole[],
    subcommand: "add" | "remove" | "list",
    values: EventKindsOptionValues = {},
  ): Promise<FakeEventKindsInteraction> {
    const interaction = new FakeEventKindsInteraction(userId, roles, subcommand, values);
    await handleEventKinds(interaction, context());
    return interaction;
  }

  describe("adding an Event Kind", () => {
    test("an R5 of an Alliance adds the kind to that Alliance's list, and only they see the answer", async () => {
      const interaction = await run(ALICE, [MEMBER_ROLE, NML_ROLE], "add", {
        name: "Hive move",
        "before-start": "1h, 10m",
      });

      expect(events.listKinds("NML")).toEqual([plainKind("Hive move", [60, 10])]);
      expect(events.listKinds("kingdom")).toEqual([]);
      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    });

    test.each([
      { label: "R4", userId: BOB },
      { label: "R5", userId: ALICE },
    ])("an $label of an Alliance may add to that Alliance's list", async ({ userId }) => {
      await run(userId, [MEMBER_ROLE, NML_ROLE], "add", { name: "Hive move", "before-start": "1h" });

      expect(events.listKinds("NML")).toEqual([plainKind("Hive move", [60])]);
    });

    test("an Officer adds the kind to the kingdom's list, when they are not Linked", async () => {
      const interaction = await run(DAN, [KING_ROLE], "add", { name: "KvK", "before-start": "24h" });

      expect(events.listKinds("kingdom")).toEqual([plainKind("KvK", [1440])]);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    });

    test("a kind with a Sign-up Deadline keeps its offset and the lead times before the Sign-up Deadline", async () => {
      await run(DAN, [MODERATOR_ROLE], "add", {
        name: "AD",
        "before-start": "24h",
        "signup-deadline": "2h",
        "before-signup": "1h",
      });

      expect(events.listKinds("kingdom")).toEqual([
        { name: "AD", beforeStart: [1440], signupOffsetMinutes: 120, beforeSignup: [60] },
      ]);
    });

    test("adding a kind with the name of one already listed replaces it", async () => {
      await run(ALICE, [NML_ROLE], "add", { name: "Hive move", "before-start": "1h" });

      await run(ALICE, [NML_ROLE], "add", { name: "Hive move", "before-start": "30m" });

      expect(events.listKinds("NML")).toEqual([plainKind("Hive move", [30])]);
    });

    test("a 26th kind for the kingdom is refused privately and the list is unchanged", async () => {
      for (let index = 1; index <= 25; index += 1) {
        events.addKind("kingdom", plainKind(`Kind ${index.toString()}`, [60]));
      }

      const interaction = await run(DAN, [KING_ROLE], "add", { name: "Twenty-sixth", "before-start": "1h" });

      expect(events.listKinds("kingdom")).toHaveLength(25);
      expect(events.listKinds("kingdom").map((kind) => kind.name)).not.toContain("Twenty-sixth");
      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    });

    test("with 25 kinds listed, replacing one of them by name still works", async () => {
      for (let index = 1; index <= 25; index += 1) {
        events.addKind("kingdom", plainKind(`Kind ${index.toString()}`, [60]));
      }

      await run(DAN, [KING_ROLE], "add", { name: "Kind 1", "before-start": "2h" });

      const kinds = events.listKinds("kingdom");
      expect(kinds).toHaveLength(25);
      expect(kinds[0]).toEqual(plainKind("Kind 1", [120]));
    });
  });

  describe("refusing what cannot be read or is over the limits", () => {
    test.each([
      ["a start time in words", { "before-start": "1 hour" }],
      ["a start time that is not a time", { "before-start": "soon" }],
      ["a lead time under one minute", { "before-start": "0m" }],
      ["a lead time over seven days", { "before-start": "8d" }],
      ["four lead times, one more than the three allowed", { "before-start": "1h, 2h, 3h, 4h" }],
    ])("refuses %s privately, and keeps the kind recorded under that name", async (_label, times) => {
      events.addKind("NML", plainKind("Hive move", [60]));

      const interaction = await run(ALICE, [NML_ROLE], "add", { name: "Hive move", ...times });

      expect(events.listKinds("NML")).toEqual([plainKind("Hive move", [60])]);
      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    });

    test.each([
      ["a Sign-up Deadline in words", { "signup-deadline": "two hours" }],
      ["a Sign-up Deadline written as two times", { "signup-deadline": "2h, 1h" }],
      ["a Sign-up Deadline over seven days", { "signup-deadline": "8d" }],
      ["a Sign-up lead time that is not a time", { "signup-deadline": "2h", "before-signup": "soon" }],
    ])("refuses %s privately and records nothing", async (_label, times) => {
      const interaction = await run(DAN, [KING_ROLE], "add", { name: "AD", "before-start": "24h", ...times });

      expect(events.listKinds("kingdom")).toEqual([]);
      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    });

    test("refuses lead times before the Sign-up Deadline when no Sign-up Deadline is given", async () => {
      const interaction = await run(DAN, [KING_ROLE], "add", {
        name: "AD",
        "before-start": "24h",
        "before-signup": "1h",
      });

      expect(events.listKinds("kingdom")).toEqual([]);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    });
  });

  describe("who may manage which list", () => {
    test.each([
      { label: "a Member with no R4 or R5 and no Officer role", userId: CAROL, roles: [MEMBER_ROLE] },
      { label: "an R3 of the Alliance", userId: FRANK, roles: [MEMBER_ROLE, NML_ROLE] },
      { label: "a Member who is not Linked", userId: "777777777777777777", roles: [MEMBER_ROLE] },
    ])("refuses $label privately, for add, and records nothing", async ({ userId, roles }) => {
      const interaction = await run(userId, roles, "add", { name: "Hive move", "before-start": "1h" });

      expect(events.listKinds("NML")).toEqual([]);
      expect(events.listKinds("kingdom")).toEqual([]);
      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    });

    test("an R5 who is not in the Alliance's role is refused, since their Alliance is not known", async () => {
      await run(ALICE, [MEMBER_ROLE], "add", { name: "Hive move", "before-start": "1h" });

      expect(events.listKinds("NML")).toEqual([]);
    });

    test("an R5 choosing the kingdom's list is refused privately, and records nothing", async () => {
      const interaction = await run(ALICE, [NML_ROLE], "add", {
        name: "KvK",
        "before-start": "1h",
        list: "kingdom",
      });

      expect(events.listKinds("kingdom")).toEqual([]);
      expect(events.listKinds("NML")).toEqual([]);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    });

    test("an Officer who is not an R4 or R5 choosing an Alliance's list is refused privately, and records nothing", async () => {
      const interaction = await run(DAN, [KING_ROLE], "add", {
        name: "Hive move",
        "before-start": "1h",
        list: "alliance",
      });

      expect(events.listKinds("NML")).toEqual([]);
      expect(events.listKinds("kingdom")).toEqual([]);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    });

    test("an Officer who is also R5 of an Alliance manages the Alliance's list by default", async () => {
      await run(EVE, [KING_ROLE, NML_ROLE], "add", { name: "Hive move", "before-start": "1h" });

      expect(events.listKinds("NML")).toEqual([plainKind("Hive move", [60])]);
      expect(events.listKinds("kingdom")).toEqual([]);
    });

    test("an Officer who is also R5 of an Alliance may choose the kingdom's list", async () => {
      await run(EVE, [KING_ROLE, NML_ROLE], "add", { name: "KvK", "before-start": "24h", list: "kingdom" });

      expect(events.listKinds("kingdom")).toEqual([plainKind("KvK", [1440])]);
      expect(events.listKinds("NML")).toEqual([]);
    });

    test.each<[string, "add" | "remove" | "list", EventKindsOptionValues]>([
      ["add", "add", { name: "KvK", "before-start": "1h", list: "kingdom" }],
      ["remove", "remove", { name: "Hive move", list: "kingdom" }],
      ["list", "list", { list: "kingdom" }],
    ])("refuses %s of the kingdom's list privately for an R5 who is not an Officer", async (_label, subcommand, values) => {
      events.addKind("NML", plainKind("Hive move", [60]));

      const interaction = await run(ALICE, [NML_ROLE], subcommand, values);

      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(events.listKinds("NML")).toEqual([plainKind("Hive move", [60])]);
    });
  });

  describe("removing an Event Kind", () => {
    test("an R5 removes a kind from their Alliance's list and leaves the kingdom's list alone", async () => {
      events.addKind("NML", plainKind("Hive move", [60]));
      events.addKind("kingdom", plainKind("KvK", [1440]));

      const interaction = await run(ALICE, [NML_ROLE], "remove", { name: "Hive move" });

      expect(events.listKinds("NML")).toEqual([]);
      expect(events.listKinds("kingdom")).toEqual([plainKind("KvK", [1440])]);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    });

    test("an Officer removes a kind from the kingdom's list by default", async () => {
      events.addKind("kingdom", plainKind("KvK", [1440]));

      await run(DAN, [KING_ROLE], "remove", { name: "KvK" });

      expect(events.listKinds("kingdom")).toEqual([]);
    });

    test("removing a name that is not listed says so privately and changes nothing", async () => {
      events.addKind("NML", plainKind("Hive move", [60]));

      const interaction = await run(ALICE, [NML_ROLE], "remove", { name: "Raid" });

      expect(events.listKinds("NML")).toEqual([plainKind("Hive move", [60])]);
      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(interaction.replies[0]?.content).toMatch(/not/i);
    });

    test("a Member who may not manage the list is refused removing, and nothing is removed", async () => {
      events.addKind("NML", plainKind("Hive move", [60]));

      const interaction = await run(CAROL, [MEMBER_ROLE], "remove", { name: "Hive move" });

      expect(events.listKinds("NML")).toEqual([plainKind("Hive move", [60])]);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    });
  });

  describe("listing Event Kinds", () => {
    test("an R5 sees their Alliance's kinds by default, privately, with each lead time readable", async () => {
      events.addKind("NML", plainKind("Hive move", [60, 10]));
      events.addKind("kingdom", plainKind("KvK", [1440]));

      const interaction = await run(ALICE, [NML_ROLE], "list");

      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      const content = interaction.replies[0]?.content ?? "";
      expect(content).toContain("Hive move");
      expect(content).toContain("1h");
      expect(content).toContain("10m");
      expect(content).not.toContain("KvK");
    });

    test("an Officer sees the kingdom's kinds by default, with the Sign-up Deadline and its lead times", async () => {
      events.addKind("NML", plainKind("Hive move", [60]));
      events.addKind("kingdom", {
        name: "KvK",
        beforeStart: [1440],
        signupOffsetMinutes: 120,
        beforeSignup: [60],
      });

      const interaction = await run(DAN, [KING_ROLE], "list");

      const content = interaction.replies[0]?.content ?? "";
      expect(content).toContain("KvK");
      expect(content).toContain("24h");
      expect(content).toContain("2h");
      expect(content).not.toContain("Hive move");
    });

    test("an Officer who is also R5 sees the Alliance's kinds by default, and the kingdom's when they choose it", async () => {
      events.addKind("NML", plainKind("Hive move", [60]));
      events.addKind("kingdom", plainKind("KvK", [1440]));

      const byDefault = await run(EVE, [KING_ROLE, NML_ROLE], "list");
      const chosen = await run(EVE, [KING_ROLE, NML_ROLE], "list", { list: "kingdom" });

      expect(byDefault.replies[0]?.content).toContain("Hive move");
      expect(byDefault.replies[0]?.content).not.toContain("KvK");
      expect(chosen.replies[0]?.content).toContain("KvK");
      expect(chosen.replies[0]?.content).not.toContain("Hive move");
    });

    test("the kingdom's list ends with the Alliance Duel line and the next Duel-day reset", async () => {
      events.addKind("kingdom", plainKind("KvK", [1440]));
      events.addKind("kingdom", plainKind("Alliance Duel", [60]));

      const interaction = await run(DAN, [KING_ROLE], "list");

      const lines = (interaction.replies[0]?.content ?? "").split("\n");
      expect(lines).toEqual([
        "Event Kinds of the Home Kingdom:",
        "- **KvK**: 24h before the start",
        "- **Alliance Duel**: 1h before the start",
        allianceDuelLine("2026-11-17T02:00:00Z"),
        shieldLine("12h, 4h, 1h", NEXT_SHIELD_DEADLINE, false),
      ]);
    });

    test("the kingdom's list with no stored kinds shows the header and the Alliance Duel line", async () => {
      const interaction = await run(DAN, [KING_ROLE], "list");

      expect(interaction.replies[0]?.content).toBe(
        [
          "Event Kinds of the Home Kingdom:",
          allianceDuelLine("2026-11-17T02:00:00Z"),
          shieldLine("12h, 4h, 1h", NEXT_SHIELD_DEADLINE, false),
        ].join("\n"),
      );
    });

    test("on Saturday after the reset, the Alliance Duel line shows Monday's reset, skipping Sunday", async () => {
      clock = new Date("2026-11-21T03:00:00Z");

      const interaction = await run(DAN, [KING_ROLE], "list");

      expect(interaction.replies[0]?.content).toContain(allianceDuelLine("2026-11-23T02:00:00Z"));
    });

    test("the Shield line shows the Officers' lead times after an add, and says when the week is marked", async () => {
      await run(DAN, [KING_ROLE], "add", { list: "kingdom", name: "shield", "before-start": "6h, 30m" });
      shield.mark("2026-11-21", MONDAY_NOON, DAN);

      const interaction = await run(DAN, [KING_ROLE], "list");

      const lines = (interaction.replies[0]?.content ?? "").split("\n");
      expect(lines).toContain(shieldLine("6h, 30m", NEXT_SHIELD_DEADLINE, true));
      expect(lines.filter((line) => line.toLowerCase().includes("shield"))).toHaveLength(1);
    });

    test("removing the Shield kind restores the default lead times", async () => {
      await run(DAN, [KING_ROLE], "add", { list: "kingdom", name: "Shield", "before-start": "6h" });

      const removed = await run(DAN, [KING_ROLE], "remove", { list: "kingdom", name: "Shield" });
      const listed = await run(DAN, [KING_ROLE], "list");

      expect(removed.replies[0]?.content).toContain("12h, 4h and 1h");
      expect(listed.replies[0]?.content).toContain(shieldLine("12h, 4h, 1h", NEXT_SHIELD_DEADLINE, false));
    });

    test("refuses a Sign-up Deadline for the kingdom's Shield kind, and changes nothing", async () => {
      const interaction = await run(DAN, [KING_ROLE], "add", {
        list: "kingdom",
        name: "Shield",
        "before-start": "6h",
        "signup-deadline": "2h",
      });

      expect(interaction.replies[0]?.content).toBe("The Shield kind has no Sign-up Deadline. Neil has changed nothing.");
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(events.listKinds("kingdom")).toEqual([]);
    });

    test("an Alliance's list has no Shield line, and its own Shield kind is listed as a plain kind", async () => {
      await run(ALICE, [NML_ROLE], "add", { name: "Shield", "before-start": "1h", "signup-deadline": "2h" });

      const interaction = await run(ALICE, [NML_ROLE], "list");

      expect(interaction.replies[0]?.content).not.toContain("Friday's reset");
      expect(events.listKinds("NML")).toHaveLength(1);
    });

    test("an Alliance's list has no Alliance Duel line", async () => {
      events.addKind("NML", plainKind("Hive move", [60]));

      const listed = await run(ALICE, [NML_ROLE], "list");
      events.removeKind("NML", "Hive move");
      const empty = await run(ALICE, [NML_ROLE], "list");

      expect(listed.replies[0]?.content).not.toContain("Alliance Duel");
      expect(empty.replies[0]?.content).toBe("[NML] has no Event Kinds yet.");
    });

    test("a list with no kinds is answered privately", async () => {
      const interaction = await run(ALICE, [NML_ROLE], "list");

      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    });

    test("a Member who may not manage Event Kinds is refused listing, privately", async () => {
      events.addKind("NML", plainKind("Hive move", [60]));

      const interaction = await run(CAROL, [MEMBER_ROLE], "list");

      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(interaction.replies[0]?.content).not.toContain("Hive move");
    });
  });

  describe("when the store fails", () => {
    test("logs the failure and answers privately that it is unavailable", async () => {
      const failing: EventKindsContext = {
        links,
        events: {
          listKinds: () => {
            throw new Error("neil.db is locked");
          },
          addKind: () => ({ ok: true }),
          removeKind: () => undefined,
        },
        officerRoleIds: [KING_ROLE.id],
        shield,
        now: () => clock,
        logError: (message: string) => {
          logged.push(message);
        },
      };
      const interaction = new FakeEventKindsInteraction(DAN, [KING_ROLE], "list");

      await handleEventKinds(interaction, failing);

      expect(logged).toEqual([expect.stringContaining("neil.db is locked")]);
      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    });
  });
});
