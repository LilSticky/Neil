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
  decision: { as: "officer", by: APPROVER },
  at: new Date("2026-11-16T20:00:00.000Z"),
};
const DECLINED: NapEvent = {
  kind: "declined",
  tag: "ABC",
  requestedBy: ASKER,
  requestedAt: new Date("2026-11-14T19:00:00.000Z"),
  decision: { as: "vote", approve: 1, decline: 1 },
  at: new Date("2026-11-16T19:00:00.000Z"),
};
const JOINED_BY_VOTE: NapEvent = { ...DECLINED, kind: "joined", tag: "XYZ", decision: { as: "vote", approve: 2, decline: 0 } };
const DECLINED_BY_OFFICER: NapEvent = { ...DECLINED, tag: "QQQ", decision: { as: "officer", by: APPROVER } };
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

  test("keeps the history in order across a reopened database at schema version 26", () => {
    withStore((store) => {
      store.append(JOINED);
      store.append(DECLINED);
      store.append(JOINED_BY_VOTE);
      store.append(DECLINED_BY_OFFICER);
      store.append(LEFT);
    });

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 26 });
      expect(new NapStore(db).history()).toEqual([JOINED, DECLINED, JOINED_BY_VOTE, DECLINED_BY_OFFICER, LEFT]);
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
        voteEndsAt: undefined,
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

  test("keeps the end of a NaP Vote, set when the request is made or later, across a reopened database", () => {
    const requestedAt = new Date("2026-11-16T19:00:00.000Z");
    const endsAt = new Date("2026-11-18T19:00:00.000Z");
    withStore((store) => {
      store.addRequest({ tag: "ABC", requestedBy: ASKER, requestedAt, voteEndsAt: endsAt });
      store.addRequest({ tag: "XYZ", requestedBy: ASKER, requestedAt });
      store.setVoteEnd("XYZ", new Date("2026-11-16T18:00:00.000Z"), endsAt);
      expect(store.request("XYZ")?.voteEndsAt).toBeUndefined();
      store.setVoteEnd("xyz", requestedAt, new Date("2026-11-19T19:00:00.000Z"));
    });

    withStore((store) => {
      expect(store.request("ABC")?.voteEndsAt).toEqual(endsAt);
      expect(store.request("XYZ")?.voteEndsAt).toEqual(new Date("2026-11-19T19:00:00.000Z"));
    });
  });

  test("keeps one vote per Alliance, replaced by its latest, also after the request is removed and the database reopened", () => {
    const requestedAt = new Date("2026-11-16T19:00:00.000Z");
    const first = { allianceTag: "NML", voterId: ASKER, vote: "approve", at: new Date("2026-11-16T20:00:00.000Z") } as const;
    const changed = { allianceTag: "nml", voterId: APPROVER, vote: "decline", at: new Date("2026-11-16T21:00:00.000Z") } as const;
    const other = { allianceTag: "XYZ", voterId: ASKER, vote: "approve", at: new Date("2026-11-16T20:30:00.000Z") } as const;
    withStore((store) => {
      store.addRequest({ tag: "ABC", requestedBy: ASKER, requestedAt });
      store.castVote("ABC", requestedAt, first);
      store.castVote("ABC", requestedAt, other);
      store.castVote("abc", requestedAt, changed);
      store.castVote("ABC", new Date("2026-10-01T00:00:00.000Z"), first);
      store.removeRequest("ABC");
    });

    withStore((store) => {
      expect(store.votes("ABC", requestedAt)).toEqual([other, { ...changed, allianceTag: "NML" }]);
    });
  });

  test("treats a corrupt vote or request row as an error", () => {
    const db = openDatabase(dataDir);
    try {
      db.prepare(
        "INSERT INTO nap_votes (tag, requested_at, alliance_tag, voter_id, vote, at) VALUES ('ABC', '2026-11-16T19:00:00.000Z', 'NML', '1', 'approve', 'later')",
      ).run();
      expect(() => new NapStore(db).votes("ABC", new Date("2026-11-16T19:00:00.000Z"))).toThrow(/corrupt/);
      db.prepare(
        "INSERT INTO nap_join_requests (tag, requested_by, requested_at, vote_ends_at) VALUES ('ABC', '1', '2026-11-16T19:00:00.000Z', 'soon')",
      ).run();
      expect(() => new NapStore(db).openRequests()).toThrow(/corrupt/);
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
