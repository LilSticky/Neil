import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { MessageFlags } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type BootyWindow, parseBootyWindow } from "../domain/booty.js";
import { BootyAlertsStore, type StoredBootyAlerts } from "../storage/booty-alerts-store.js";
import { openDatabase } from "../storage/database.js";
import { FakeBootyAlertsInteraction, type BootyAlertsOptionValues } from "./__fakes__/booty-alerts-interaction.js";
import { FakeLinkStore } from "./__fakes__/link-store.js";
import { handleBootyAlerts, type BootyAlertsContext } from "./booty.js";

const ALICE = "111111111111111111";
const BOB = "222222222222222222";

function window(startMinute: number, endMinute: number): BootyWindow {
  const parsed = parseBootyWindow(startMinute, endMinute);
  if (!parsed.ok) throw new Error(`no Booty Alerts window from ${startMinute.toString()} to ${endMinute.toString()}`);
  return parsed.value;
}

/** 08:00 to 23:00 in Europe/Lisbon, only when offline: what a Member might record before changing one choice. */
const LISBON_OFFLINE: StoredBootyAlerts = {
  mode: "offline",
  window: window(480, 1380),
  timeZone: "Europe/Lisbon",
};

describe("/booty-alerts", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let store: BootyAlertsStore;
  let links: FakeLinkStore;
  let logged: string[];

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-booty-alerts-cmd-"));
    db = openDatabase(dataDir);
    store = new BootyAlertsStore(db);
    links = new FakeLinkStore();
    logged = [];
    links.link(ALICE);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function context(): BootyAlertsContext {
    return {
      links,
      bootyAlerts: store,
      logError: (message: string) => {
        logged.push(message);
      },
    };
  }

  /** Runs /booty-alerts for the Member with the options given, and returns the interaction that recorded the replies. */
  async function run(userId: string, values: Partial<BootyAlertsOptionValues> = {}): Promise<FakeBootyAlertsInteraction> {
    const interaction = new FakeBootyAlertsInteraction(userId, values);
    await handleBootyAlerts(interaction, context());
    return interaction;
  }

  describe("showing the Booty Alerts", () => {
    test("a Linked Member with nothing recorded sees Off, privately, and nothing is recorded", async () => {
      const interaction = await run(ALICE);

      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(interaction.replies[0]?.content).toMatch(/\boff\b/i);
      expect(store.get(ALICE)).toBeUndefined();
    });

    test("a Member who is not Linked is refused privately, and nothing is recorded even when options are given", async () => {
      const interaction = await run(BOB, { mode: "always", from: "08:00", to: "23:00", "time-zone": "Europe/Lisbon" });

      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(store.get(BOB)).toBeUndefined();
    });
  });

  describe("recording the Booty Alerts", () => {
    test("a mode given alone keeps the window and the time zone recorded", async () => {
      store.save(ALICE, LISBON_OFFLINE);

      await run(ALICE, { mode: "always" });

      expect(store.get(ALICE)).toEqual({ ...LISBON_OFFLINE, mode: "always" });
    });

    test("a time zone given alone keeps the mode and the window recorded", async () => {
      store.save(ALICE, LISBON_OFFLINE);

      await run(ALICE, { "time-zone": "UTC" });

      expect(store.get(ALICE)).toEqual({ ...LISBON_OFFLINE, timeZone: "UTC" });
    });

    test("a start given alone changes only the start of the window recorded", async () => {
      store.save(ALICE, LISBON_OFFLINE);

      await run(ALICE, { from: "09:00" });

      expect(store.get(ALICE)).toEqual({ ...LISBON_OFFLINE, window: { startMinute: 540, endMinute: 1380 } });
    });

    test("with nothing recorded, a mode alone records the whole day, 00:00 to 00:00, in UTC", async () => {
      await run(ALICE, { mode: "online" });

      expect(store.get(ALICE)).toEqual({
        mode: "online",
        window: { startMinute: 0, endMinute: 0 },
        timeZone: "UTC",
      });
    });

    test("the change is answered privately with the Booty Alerts it leaves", async () => {
      const interaction = await run(ALICE, {
        mode: "offline",
        from: "08:00",
        to: "23:00",
        "time-zone": "Europe/Lisbon",
      });

      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      const content = interaction.replies[0]?.content ?? "";
      expect(content).toMatch(/only when offline/i);
      expect(content).toContain("08:00");
      expect(content).toContain("23:00");
      expect(content).toContain("Europe/Lisbon");
    });

    test("a Linked Member who records nothing new is shown what is recorded", async () => {
      store.save(ALICE, LISBON_OFFLINE);

      const interaction = await run(ALICE);

      const content = interaction.replies[0]?.content ?? "";
      expect(content).toMatch(/only when offline/i);
      expect(content).toContain("Europe/Lisbon");
      expect(store.get(ALICE)).toEqual(LISBON_OFFLINE);
    });
  });

  describe("invalid input", () => {
    test.each<[string, Partial<BootyAlertsOptionValues>]>([
      ["a start that is not a 24-hour time", { from: "25:00" }],
      ["a start without its leading zero", { from: "8:00" }],
      ["an end written in words", { to: "7pm" }],
      ["a time zone that is not one", { "time-zone": "Mars/Olympus" }],
    ])("refuses %s privately, and changes nothing, not even the valid mode given with it", async (_label, invalid) => {
      store.save(ALICE, LISBON_OFFLINE);

      const interaction = await run(ALICE, { mode: "always", ...invalid });

      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(store.get(ALICE)).toEqual(LISBON_OFFLINE);
    });
  });
});
