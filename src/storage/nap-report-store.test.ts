import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Uid } from "../domain/lookup-input.js";
import { openDatabase } from "./database.js";
import { LinkStore } from "./link-store.js";
import { NapReportStore } from "./nap-report-store.js";

const REPORTER = "111111111111111111";
const PROPOSER = "222222222222222222";
const THREAD = "900000000000000001";
const REPORTED = new Date("2026-11-19T12:00:00.000Z");
const DECIDED = new Date("2026-11-21T12:00:00.000Z");
const REPORT = {
  accusedTag: "XYZ",
  accusedUid: "12345" as Uid,
  what: "Hit our farms at 512:640",
  reportedBy: REPORTER,
  reporterTag: "ABC",
  reportedAt: REPORTED,
};

describe("NapReportStore", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-nap-reports-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  function withStore<T>(use: (store: NapReportStore) => T): T {
    const db = openDatabase(dataDir);
    try {
      return use(new NapReportStore(db));
    } finally {
      db.close();
    }
  }

  test("is empty before anything is reported", () => {
    withStore((store) => {
      expect(store.reports()).toEqual([]);
      expect(store.proposals()).toEqual([]);
    });
  });

  test("numbers reports one higher and keeps them with their thread across a reopened database", () => {
    withStore((store) => {
      expect(store.file(REPORT)).toBe(1);
      store.setThread(1, THREAD);
      expect(store.file({ ...REPORT, accusedUid: undefined })).toBe(2);
    });
    withStore((store) => {
      expect(store.reports()).toEqual([
        { number: 1, ...REPORT, threadId: THREAD },
        { number: 2, ...REPORT, accusedUid: undefined, threadId: undefined },
      ]);
    });
  });

  test("removes only a report without a thread", () => {
    withStore((store) => {
      store.file(REPORT);
      store.setThread(1, THREAD);
      store.file(REPORT);
      store.remove(1);
      store.remove(2);
      expect(store.reports().map((report) => report.number)).toEqual([1]);
    });
  });

  test("keeps a proposal with its note and NaP Motion, and decides it once", () => {
    withStore((store) => {
      store.file(REPORT);
      store.setThread(1, THREAD);
      const id = store.propose({ report: 1, outcome: "warning", note: "First time", proposedBy: PROPOSER, proposedAt: REPORTED });
      store.setMotion(id, 7);
      expect(store.decide(id, "approved", DECIDED)).toBe(true);
      expect(store.decide(id, "rejected", DECIDED)).toBe(false);
    });
    withStore((store) => {
      expect(store.proposals()).toEqual([
        {
          id: 1,
          report: 1,
          outcome: "warning",
          note: "First time",
          proposedBy: PROPOSER,
          proposedAt: REPORTED,
          status: { kind: "approved", decidedAt: DECIDED },
          motion: 7,
        },
      ]);
    });
  });

  test("removes only a proposal not put to a NaP Motion, and never a report with proposals", () => {
    withStore((store) => {
      store.file(REPORT);
      const first = store.propose({ report: 1, outcome: "exile", note: undefined, proposedBy: PROPOSER, proposedAt: REPORTED });
      store.setMotion(first, 3);
      const second = store.propose({ report: 1, outcome: "dismissed", note: undefined, proposedBy: PROPOSER, proposedAt: REPORTED });
      store.removeProposal(first);
      store.removeProposal(second);
      store.remove(1);
      expect(store.proposals().map((proposal) => [proposal.id, proposal.note])).toEqual([[first, undefined]]);
      expect(store.reports()).toHaveLength(1);
    });
  });

  test("refuses a corrupt row", () => {
    withStore((store) => {
      store.file(REPORT);
      store.propose({ report: 1, outcome: "warning", note: undefined, proposedBy: PROPOSER, proposedAt: REPORTED });
    });
    const db = openDatabase(dataDir);
    try {
      db.exec("UPDATE nap_reports SET reported_at = 'yesterday'");
      db.exec("UPDATE nap_report_proposals SET proposed_at = 'yesterday'");
      const store = new NapReportStore(db);
      expect(() => store.reports()).toThrow("corrupt");
      expect(() => store.proposals()).toThrow("corrupt");
    } finally {
      db.close();
    }
  });

  test("keeps the report and its decided proposal after the reporter's and the proposer's Unlink", () => {
    const db = openDatabase(dataDir);
    try {
      const links = new LinkStore(db);
      for (const [memberId, uid] of [
        [REPORTER, "145563254785"],
        [PROPOSER, "145563254786"],
      ] as const) {
        links.confirm(
          {
            link: {
              memberId,
              uid: uid as Uid,
              linkedAt: REPORTED,
              allianceRank: { source: "no-alliance" },
              madeBy: { kind: "in-game-proof" },
            },
          },
          () => undefined,
        );
      }
      const store = new NapReportStore(db);
      store.file(REPORT);
      store.setThread(1, THREAD);
      const id = store.propose({ report: 1, outcome: "warning", note: undefined, proposedBy: PROPOSER, proposedAt: REPORTED });
      store.setMotion(id, 1);
      store.decide(id, "approved", DECIDED);

      expect(links.unlink(REPORTER)).toBeDefined();
      expect(links.unlink(PROPOSER)).toBeDefined();

      expect(store.reports()).toEqual([{ number: 1, ...REPORT, threadId: THREAD }]);
      expect(store.proposals().map((proposal) => [proposal.proposedBy, proposal.status.kind])).toEqual([[PROPOSER, "approved"]]);
    } finally {
      db.close();
    }
  });
});
