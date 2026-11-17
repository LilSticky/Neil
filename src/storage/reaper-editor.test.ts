import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { AllianceRef, LastAlliance } from "../domain/daily-sync.js";
import type { Editor } from "../domain/exile.js";
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
const ALICE = "111111111111111111";
const ALICE_UID = uidOf("145563254785");
const LINKED_AT = new Date("2026-10-30T12:00:00Z");
const APPLIED_AT = new Date("2026-10-30T12:01:00Z");
const HOME_ALLIANCE: AllianceRef = { kingdom: HOME, tag: "NML" };

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

  test("takes the Alliance Rank from the Link and the Kingdom and tag from the last Alliance in the Applied State", () => {
    links.confirm({ link: linkOf(ALICE, ALICE_UID, { source: "game-api", rank: "R4" }) }, () => undefined);
    applied.record(appliedOf(ALICE, HOME_ALLIANCE));
    const expected: Editor = { allianceRank: { source: "game-api", rank: "R4" }, allianceKingdom: HOME, allianceTag: "NML" };

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
