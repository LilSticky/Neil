import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openDatabase } from "./database.js";
import { NapMotionStore } from "./nap-motion-store.js";

const OPENER = "111111111111111111";
const VOTER = "111111111111111112";
const OPENED = new Date("2026-11-18T12:00:00.000Z");
const ENDS = new Date("2026-11-20T12:00:00.000Z");
const MOTION = { text: "Nobody hits farms of NaP Alliances.", openedBy: OPENER, openerTag: "NML", openedAt: OPENED, endsAt: ENDS };

describe("NapMotionStore", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-nap-motion-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  function withStore<T>(use: (store: NapMotionStore) => T): T {
    const db = openDatabase(dataDir);
    try {
      return use(new NapMotionStore(db));
    } finally {
      db.close();
    }
  }

  test("is empty before anything is stored", () => {
    withStore((store) => {
      expect(store.open()).toEqual([]);
      expect(store.get(1)).toBeUndefined();
      expect(store.votes(1)).toEqual([]);
    });
  });

  test("keeps a new motion, unposted and open, across a reopened database", () => {
    const id = withStore((store) => store.add(MOTION));
    withStore((store) => {
      const expected = {
        id,
        ...MOTION,
        channelId: undefined,
        messageId: undefined,
        remindedAt: undefined,
        closed: undefined,
      };
      expect(store.get(id)).toEqual(expected);
      expect(store.open()).toEqual([expected]);
    });
  });

  test("gives each motion its own id and lists the open ones oldest first", () => {
    withStore((store) => {
      const first = store.add(MOTION);
      const second = store.add({ ...MOTION, text: "Second" });
      expect(second).toBeGreaterThan(first);
      expect(store.open().map((motion) => motion.id)).toEqual([first, second]);
    });
  });

  test("records the message, the reminder and the result; a closed motion is no longer open but kept", () => {
    withStore((store) => {
      const id = store.add(MOTION);
      store.setMessage(id, "700000000000000002", "800000000000000001");
      const reminded = new Date("2026-11-19T12:00:00.000Z");
      store.markReminded(id, reminded);
      const closedAt = new Date("2026-11-20T12:01:00.000Z");
      store.close(id, { outcome: "approved", approve: 2, decline: 1, at: closedAt });
      expect(store.open()).toEqual([]);
      expect(store.get(id)).toEqual({
        id,
        ...MOTION,
        channelId: "700000000000000002",
        messageId: "800000000000000001",
        remindedAt: reminded,
        closed: { outcome: "approved", approve: 2, decline: 1, at: closedAt },
      });
    });
  });

  test("keeps one vote per Alliance, ignoring letter case, the latest replacing the earlier", () => {
    withStore((store) => {
      const id = store.add(MOTION);
      const at = new Date("2026-11-18T13:00:00.000Z");
      store.castVote(id, { allianceTag: "NML", voterId: OPENER, vote: "approve", at });
      store.castVote(id, { allianceTag: "ABC", voterId: VOTER, vote: "approve", at });
      const later = new Date("2026-11-18T14:00:00.000Z");
      store.castVote(id, { allianceTag: "abc", voterId: VOTER, vote: "decline", at: later });
      expect(store.votes(id)).toEqual([
        { allianceTag: "NML", voterId: OPENER, vote: "approve", at },
        { allianceTag: "ABC", voterId: VOTER, vote: "decline", at: later },
      ]);
      expect(store.votes(id + 1)).toEqual([]);
    });
  });

  test("removes an unposted motion with its votes", () => {
    withStore((store) => {
      const id = store.add(MOTION);
      store.castVote(id, { allianceTag: "NML", voterId: OPENER, vote: "approve", at: OPENED });
      store.remove(id);
      expect(store.get(id)).toBeUndefined();
      expect(store.votes(id)).toEqual([]);
    });
  });

  test("throws on a corrupt row rather than repairing it", () => {
    const db = openDatabase(dataDir);
    try {
      db.prepare(
        "INSERT INTO nap_motions (text, opened_by, opener_tag, opened_at, ends_at) VALUES ('Text', '1', 'NML', 'yesterday', 'tomorrow')",
      ).run();
      const store = new NapMotionStore(db);
      expect(() => store.open()).toThrow(/corrupt/);
    } finally {
      db.close();
    }
  });
});
