import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Link } from "../domain/link.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { AllianceRef } from "../domain/daily-sync.js";
import { openDatabase } from "./database.js";
import { AppliedStore, type AppliedState } from "./applied-store.js";
import { LinkStore } from "./link-store.js";

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

const ALICE = "111111111111111111";
const BOB = "222222222222222222";
const ALICE_UID = uidOf("145563254785");
const BOB_UID = uidOf("145563254786");
const LINKED_AT = new Date("2026-10-30T12:00:00Z");
const APPLIED_AT = new Date("2026-10-30T12:01:00Z");
const NML: AllianceRef = { kingdom: kingdomOf(330), tag: "NML" };
const ABC: AllianceRef = { kingdom: kingdomOf(330), tag: "ABC" };

function linkOf(memberId: string, uid: Uid): Link {
  return { memberId, uid, linkedAt: LINKED_AT, allianceRank: { source: "no-alliance" } };
}

function appliedOf(memberId: string, complete: boolean): AppliedState {
  return {
    memberId,
    nickname: "[NML] Rogue",
    roles: ["NML", "#331", "T3"],
    appliedAt: APPLIED_AT,
    complete,
    alliance: undefined,
  };
}

describe("AppliedStore", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let links: LinkStore;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-applied-"));
    db = openDatabase(dataDir);
    links = new LinkStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("get finds no Applied State for a Member who was never applied", () => {
    const store = new AppliedStore(db);

    expect(store.get(ALICE)).toBeUndefined();
  });

  test("record then get returns the nickname, roles, time and completeness it recorded", () => {
    const store = new AppliedStore(db);
    links.confirm({ link: linkOf(ALICE, ALICE_UID) }, () => undefined);

    store.record(appliedOf(ALICE, true));

    expect(store.get(ALICE)).toEqual(appliedOf(ALICE, true));
  });

  test("record replaces the Applied State of a Member with the latest one", () => {
    const store = new AppliedStore(db);
    links.confirm({ link: linkOf(ALICE, ALICE_UID) }, () => undefined);
    store.record(appliedOf(ALICE, false));

    store.record({ ...appliedOf(ALICE, true), nickname: "[NML|R4] Rogue", roles: ["NML", "R4"] });

    expect(store.get(ALICE)).toEqual({ ...appliedOf(ALICE, true), nickname: "[NML|R4] Rogue", roles: ["NML", "R4"] });
  });

  test("record then get keeps the last Alliance the Member was applied in", () => {
    const store = new AppliedStore(db);
    links.confirm({ link: linkOf(ALICE, ALICE_UID) }, () => undefined);

    store.record({ ...appliedOf(ALICE, true), alliance: NML });

    expect(store.get(ALICE)?.alliance).toEqual(NML);
  });

  test("record keeps the Alliance of the latest apply, replacing the earlier one", () => {
    const store = new AppliedStore(db);
    links.confirm({ link: linkOf(ALICE, ALICE_UID) }, () => undefined);
    store.record({ ...appliedOf(ALICE, true), alliance: NML });

    store.record({ ...appliedOf(ALICE, true), alliance: ABC });

    expect(store.get(ALICE)?.alliance).toEqual(ABC);
  });

  test("record of a Player in no Alliance keeps no last Alliance", () => {
    const store = new AppliedStore(db);
    links.confirm({ link: linkOf(ALICE, ALICE_UID) }, () => undefined);
    store.record({ ...appliedOf(ALICE, true), alliance: NML });

    store.record({ ...appliedOf(ALICE, true), alliance: undefined });

    expect(store.get(ALICE)?.alliance).toBeUndefined();
  });

  test("get reads the Alliance of an Applied State written before the Alliance was recorded as unrecorded, not as no Alliance", () => {
    const store = new AppliedStore(db);
    links.confirm({ link: linkOf(ALICE, ALICE_UID) }, () => undefined);
    // The row as it was written before the Alliance columns existed: the five columns the apply always set.
    db.prepare("INSERT INTO applied (member_id, nickname, roles_json, applied_at, complete) VALUES (?, ?, ?, ?, ?)").run(
      ALICE,
      "[NML] Rogue",
      JSON.stringify(["NML", "#331", "T3"]),
      APPLIED_AT.toISOString(),
      1,
    );

    expect(store.get(ALICE)?.alliance).toBe("unrecorded");
  });

  test("get reads a Member recorded in no Alliance as no Alliance, not as unrecorded", () => {
    const store = new AppliedStore(db);
    links.confirm({ link: linkOf(ALICE, ALICE_UID) }, () => undefined);
    store.record({ ...appliedOf(ALICE, true), alliance: undefined });

    expect(store.get(ALICE)?.alliance).toBeUndefined();
  });

  test("linkedWithoutCompleteApply lists a Link with no Applied State", () => {
    const store = new AppliedStore(db);
    const alice = linkOf(ALICE, ALICE_UID);
    links.confirm({ link: alice }, () => undefined);

    expect(store.linkedWithoutCompleteApply()).toEqual([alice]);
  });

  test("linkedWithoutCompleteApply lists a Link whose Applied State is not complete", () => {
    const store = new AppliedStore(db);
    const alice = linkOf(ALICE, ALICE_UID);
    links.confirm({ link: alice }, () => undefined);
    store.record(appliedOf(ALICE, false));

    expect(store.linkedWithoutCompleteApply()).toEqual([alice]);
  });

  test("linkedWithoutCompleteApply leaves out a Link whose Applied State is complete", () => {
    const store = new AppliedStore(db);
    const alice = linkOf(ALICE, ALICE_UID);
    const bob = linkOf(BOB, BOB_UID);
    links.confirm({ link: alice }, () => undefined);
    links.confirm({ link: bob }, () => undefined);
    store.record(appliedOf(ALICE, true));

    expect(store.linkedWithoutCompleteApply()).toEqual([bob]);
  });

  test("deleting a Link deletes its Applied State", () => {
    const store = new AppliedStore(db);
    links.confirm({ link: linkOf(ALICE, ALICE_UID) }, () => undefined);
    store.record(appliedOf(ALICE, true));

    db.prepare("DELETE FROM link WHERE member_id = ?").run(ALICE);

    expect(store.get(ALICE)).toBeUndefined();
  });
});
