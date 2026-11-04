import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { AllianceRef, LastAlliance } from "../domain/daily-sync.js";
import { mayChangeReaper, type Editor } from "../domain/exile.js";
import type { Link, RankOnLink } from "../domain/link.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { MemberId } from "../domain/rank-approval.js";
import { AppliedStore, type AppliedState } from "./applied-store.js";
import { openDatabase } from "./database.js";
import { LinkStore } from "./link-store.js";
import { editorOf } from "./reaper-editor.js";

function uidOf(digits: string): Uid {
  const parsed = parseUid(digits);
  if (!parsed.ok) throw new Error(`the test uid ${digits} is not a valid uid`);
  return parsed.value;
}

function kingdomOf(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`the test Kingdom ${number.toString()} is not a valid Kingdom`);
  return parsed.value;
}

const HOME = kingdomOf(330);
const OTHER_KINGDOM = kingdomOf(331);
const ALICE = "111111111111111111";
const ALICE_UID = uidOf("145563254785");
const LEADER = "444444444444444444";
const LINKED_AT = new Date("2026-10-30T12:00:00Z");
const APPLIED_AT = new Date("2026-10-30T12:01:00Z");
const APPROVED_AT = new Date("2026-10-30T13:00:00Z");
const HOME_ALLIANCE: AllianceRef = { kingdom: HOME, tag: "NML" };
const OTHER_ALLIANCE: AllianceRef = { kingdom: OTHER_KINGDOM, tag: "NML" };

function linkOf(memberId: MemberId, uid: Uid, allianceRank: RankOnLink): Link {
  return { memberId, uid, linkedAt: LINKED_AT, allianceRank, madeBy: { kind: "in-game-proof" } };
}

function appliedOf(memberId: MemberId, alliance: LastAlliance): AppliedState {
  return {
    memberId,
    nickname: "[NML] Rogue",
    roles: ["NML", "T3"],
    appliedAt: APPLIED_AT,
    complete: true,
    alliance,
  };
}

describe("editorOf", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let links: LinkStore;
  let applied: AppliedStore;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-reaper-editor-"));
    db = openDatabase(dataDir);
    links = new LinkStore(db);
    applied = new AppliedStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("is undefined for a Member with no Link", () => {
    expect(editorOf({ links, applied }, ALICE)).toBeUndefined();
  });

  test("takes the Alliance Rank from the Link and the Kingdom from the last Alliance in the Applied State", () => {
    links.confirm({ link: linkOf(ALICE, ALICE_UID, { source: "game-api", rank: "R4" }) }, () => undefined);
    applied.record(appliedOf(ALICE, HOME_ALLIANCE));
    const expected: Editor = { allianceRank: { source: "game-api", rank: "R4" }, allianceKingdom: HOME };

    expect(editorOf({ links, applied }, ALICE)).toEqual(expected);
  });

  test("has no Alliance Kingdom when the Member has no Applied State", () => {
    links.confirm({ link: linkOf(ALICE, ALICE_UID, { source: "game-api", rank: "R5" }) }, () => undefined);
    const expected: Editor = { allianceRank: { source: "game-api", rank: "R5" }, allianceKingdom: undefined };

    expect(editorOf({ links, applied }, ALICE)).toEqual(expected);
  });

  test.each([undefined, "unrecorded"] as const)(
    "has no Alliance Kingdom when the Applied State records no Alliance (%s)",
    (alliance) => {
      links.confirm({ link: linkOf(ALICE, ALICE_UID, { source: "no-alliance" }) }, () => undefined);
      applied.record(appliedOf(ALICE, alliance));
      const expected: Editor = { allianceRank: { source: "no-alliance" }, allianceKingdom: undefined };

      expect(editorOf({ links, applied }, ALICE)).toEqual(expected);
    },
  );
});

describe("mayChangeReaper for the Editor of a Member, in the Home Kingdom", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let links: LinkStore;
  let applied: AppliedStore;

  /** Whether the Member may change REAPER; false when the Member has no Link. */
  function mayChange(memberId: MemberId): boolean {
    const editor = editorOf({ links, applied }, memberId);
    return editor !== undefined && mayChangeReaper(editor, HOME);
  }

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-reaper-may-"));
    db = openDatabase(dataDir);
    links = new LinkStore(db);
    applied = new AppliedStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("lets an R5 from the Game API in the Home Kingdom change REAPER", () => {
    links.confirm({ link: linkOf(ALICE, ALICE_UID, { source: "game-api", rank: "R5" }) }, () => undefined);
    applied.record(appliedOf(ALICE, HOME_ALLIANCE));

    expect(mayChange(ALICE)).toBe(true);
  });

  test("lets an R5 from a Rank Approval in the Home Kingdom change REAPER", () => {
    links.confirm(
      {
        link: linkOf(ALICE, ALICE_UID, {
          source: "rank-approval",
          rank: "R5",
          approvedBy: LEADER,
          approvedAt: APPROVED_AT,
        }),
      },
      () => undefined,
    );
    applied.record(appliedOf(ALICE, HOME_ALLIANCE));

    expect(mayChange(ALICE)).toBe(true);
  });

  test("refuses an R4 in the Home Kingdom", () => {
    links.confirm({ link: linkOf(ALICE, ALICE_UID, { source: "game-api", rank: "R4" }) }, () => undefined);
    applied.record(appliedOf(ALICE, HOME_ALLIANCE));

    expect(mayChange(ALICE)).toBe(false);
  });

  test("refuses an R5 in another Kingdom", () => {
    links.confirm({ link: linkOf(ALICE, ALICE_UID, { source: "game-api", rank: "R5" }) }, () => undefined);
    applied.record(appliedOf(ALICE, OTHER_ALLIANCE));

    expect(mayChange(ALICE)).toBe(false);
  });

  test("refuses a Member whose Alliance Rank is unknown", () => {
    links.confirm({ link: linkOf(ALICE, ALICE_UID, { source: "unknown" }) }, () => undefined);
    applied.record(appliedOf(ALICE, HOME_ALLIANCE));

    expect(mayChange(ALICE)).toBe(false);
  });

  test("refuses a Member with no Alliance", () => {
    links.confirm({ link: linkOf(ALICE, ALICE_UID, { source: "no-alliance" }) }, () => undefined);
    applied.record(appliedOf(ALICE, undefined));

    expect(mayChange(ALICE)).toBe(false);
  });

  test("refuses a Member with no Link", () => {
    expect(mayChange(ALICE)).toBe(false);
  });
});
