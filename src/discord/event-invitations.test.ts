import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { MessageFlags } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { openDatabase } from "../storage/database.js";
import { EventStore } from "../storage/event-store.js";
import { FakeEventInvitationsInteraction, type EventInvitationsOptionValues } from "./__fakes__/event-invitations-interaction.js";
import { FakeLinkStore } from "./__fakes__/link-store.js";
import { handleEventInvitations, type EventInvitationsContext } from "./event-invitations.js";

const ALICE = "111111111111111111";
const BOB = "222222222222222222";

describe("/event-invitations", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let events: EventStore;
  let links: FakeLinkStore;
  let logged: string[];

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-event-invitations-cmd-"));
    db = openDatabase(dataDir);
    events = new EventStore(db);
    links = new FakeLinkStore();
    logged = [];
    links.link(ALICE);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function context(): EventInvitationsContext {
    return {
      links,
      events,
      logError: (message: string) => {
        logged.push(message);
      },
    };
  }

  /** Runs /event-invitations for the Member with the option given, and returns the interaction that recorded the reply. */
  async function run(userId: string, values: EventInvitationsOptionValues = {}): Promise<FakeEventInvitationsInteraction> {
    const interaction = new FakeEventInvitationsInteraction(userId, values);
    await handleEventInvitations(interaction, context());
    return interaction;
  }

  describe("showing the choice", () => {
    test("a Linked Member with nothing recorded sees Event Invitations on, privately, and nothing is recorded", async () => {
      const interaction = await run(ALICE);

      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(interaction.replies[0]?.content).toMatch(/\bon\b/i);
      expect(events.hasInvitationsOff(ALICE)).toBe(false);
    });

    test("a Linked Member with Event Invitations off sees them off, and the choice stays off", async () => {
      events.setInvitationsOff(ALICE);

      const interaction = await run(ALICE);

      expect(interaction.replies[0]?.content).toMatch(/\boff\b/i);
      expect(events.hasInvitationsOff(ALICE)).toBe(true);
    });
  });

  describe("switching the choice", () => {
    test("invitations off switches them off for the Member, privately", async () => {
      const interaction = await run(ALICE, { invitations: "off" });

      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(events.hasInvitationsOff(ALICE)).toBe(true);
    });

    test("invitations on switches them back on for a Member who had them off", async () => {
      events.setInvitationsOff(ALICE);

      const interaction = await run(ALICE, { invitations: "on" });

      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(events.hasInvitationsOff(ALICE)).toBe(false);
    });

    test.each([
      ["off", { invitations: "off" }],
      ["on", { invitations: "on" }],
    ])("the answer to switching %s says that reminders for Events marked Interested still come", async (_choice, values) => {
      const interaction = await run(ALICE, values);

      expect(interaction.replies[0]?.content).toMatch(/reminders?/i);
      expect(interaction.replies[0]?.content).toMatch(/Interested/);
    });

    test("a Member's choice does not change another Member's choice", async () => {
      links.link(BOB);

      await run(ALICE, { invitations: "off" });

      expect(events.hasInvitationsOff(BOB)).toBe(false);
    });
  });

  describe("a Member who is not Linked", () => {
    test("is refused privately, and nothing is recorded even when an option is given", async () => {
      const interaction = await run(BOB, { invitations: "off" });

      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(events.hasInvitationsOff(BOB)).toBe(false);
    });
  });

  describe("a failed write", () => {
    test("is logged and answered privately, and the Member's choice is not changed", async () => {
      vi.spyOn(events, "setInvitationsOff").mockImplementation(() => {
        throw new Error("database is locked");
      });

      const interaction = await run(ALICE, { invitations: "off" });

      expect(logged).toEqual([expect.stringContaining("database is locked")]);
      expect(interaction.replies).toHaveLength(1);
      expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(events.hasInvitationsOff(ALICE)).toBe(false);
    });
  });
});
