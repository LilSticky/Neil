import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { NapEvent } from "../domain/nap.js";
import { openDatabase } from "./database.js";
import { NapStore } from "./nap-store.js";

const ASKER = "111111111111111111";
const APPROVER = "222222222222222222";
const JOINED: NapEvent = {
  kind: "joined",
  tag: "NML",
  requestedBy: ASKER,
  requestedAt: new Date("2026-11-16T19:00:00.000Z"),
  approvedBy: APPROVER,
  approvedAs: "officer",
  at: new Date("2026-11-16T20:00:00.000Z"),
};
const LEFT: NapEvent = { kind: "left", tag: "NML", leftBy: ASKER, at: new Date("2026-11-17T20:00:00.000Z") };

describe("NapStore", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-nap-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  function withStore<T>(use: (store: NapStore) => T): T {
    const db = openDatabase(dataDir);
    try {
      return use(new NapStore(db));
    } finally {
      db.close();
    }
  }

  test("is empty before anything is stored", () => {
    withStore((store) => {
      expect(store.history()).toEqual([]);
      expect(store.openRequests()).toEqual([]);
      expect(store.request("NML")).toBeUndefined();
    });
  });

  test("keeps the history in order across a reopened database at schema version 23", () => {
    withStore((store) => {
      store.append(JOINED);
      store.append(LEFT);
    });

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 23 });
      expect(new NapStore(db).history()).toEqual([JOINED, LEFT]);
    } finally {
      db.close();
    }
  });

  test("keeps an open request and where it was posted across a reopened database", () => {
    const requestedAt = new Date("2026-11-16T19:00:00.000Z");
    withStore((store) => {
      store.addRequest({ tag: "ABC", requestedBy: ASKER, requestedAt });
      store.setRequestMessage("ABC", requestedAt, "323456789012345678", "423456789012345678");
    });

    withStore((store) => {
      const expected = {
        tag: "ABC",
        requestedBy: ASKER,
        requestedAt,
        channelId: "323456789012345678",
        messageId: "423456789012345678",
      };
      expect(store.openRequests()).toEqual([expected]);
      expect(store.request("abc")).toEqual(expected);
    });
  });

  test("refuses a second open request for the same Alliance, ignoring letter case", () => {
    withStore((store) => {
      store.addRequest({ tag: "ABC", requestedBy: ASKER, requestedAt: new Date("2026-11-16T19:00:00.000Z") });
      expect(() => {
        store.addRequest({ tag: "abc", requestedBy: APPROVER, requestedAt: new Date("2026-11-16T19:05:00.000Z") });
      }).toThrow();
    });
  });

  test("records the message only for the request made at that time", () => {
    withStore((store) => {
      const requestedAt = new Date("2026-11-16T19:00:00.000Z");
      store.addRequest({ tag: "ABC", requestedBy: ASKER, requestedAt });
      store.setRequestMessage("ABC", new Date("2026-11-16T18:00:00.000Z"), "323456789012345678", "423456789012345678");
      expect(store.request("ABC")?.messageId).toBeUndefined();
    });
  });

  test("removes an open request", () => {
    withStore((store) => {
      store.addRequest({ tag: "ABC", requestedBy: ASKER, requestedAt: new Date("2026-11-16T19:00:00.000Z") });
      store.removeRequest("abc");
      expect(store.openRequests()).toEqual([]);
    });
  });

  test("keeps the NaP list's message id across a reopened database, replacing the earlier one", () => {
    withStore((store) => {
      expect(store.listMessageId()).toBeUndefined();
      store.setListMessageId("523456789012345678");
      store.setListMessageId("623456789012345678");
    });

    withStore((store) => {
      expect(store.listMessageId()).toBe("623456789012345678");
    });
  });

  test("treats a corrupt NaP list row as an error", () => {
    const db = openDatabase(dataDir);
    try {
      db.exec("PRAGMA ignore_check_constraints = ON");
      db.prepare("INSERT INTO nap_list (id, message_id) VALUES (1, 'gone')").run();
      expect(() => new NapStore(db).listMessageId()).toThrow(/corrupt/);
    } finally {
      db.close();
    }
  });

  test("treats a corrupt history row as an error, never as an empty history", () => {
    const db = openDatabase(dataDir);
    try {
      db.prepare("INSERT INTO nap_history (tag, kind, at, actor_id) VALUES ('NML', 'left', 'yesterday', '1')").run();
      expect(() => new NapStore(db).history()).toThrow(/corrupt/);
    } finally {
      db.close();
    }
  });
});
