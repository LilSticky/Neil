import { describe, expect, test } from "vitest";
import {
  parseAllianceKey,
  parseKingdom,
  parseUid,
  type AllianceKey,
  type KingdomNumber,
  type Uid,
} from "../domain/lookup-input.js";
import { lookAgainCustomId, parseLookAgainCustomId, type LookAgainTarget } from "./look-again.js";

const OWNER_ID = "310000000000000001";
/** The largest owner id Discord gives: a snowflake of 20 digits. */
const TWENTY_DIGIT_OWNER_ID = "12345678901234567890";
const UID = "145563254785";
const CUSTOM_ID_MAX_LENGTH = 100;

function uid(text: string): Uid {
  const parsed = parseUid(text);
  if (!parsed.ok) throw new Error(`test uid "${text}" is not a valid uid`);
  return parsed.value;
}

function kingdom(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`test Kingdom ${number.toString()} is not valid`);
  return parsed.value;
}

function tag(text: string): AllianceKey {
  const parsed = parseAllianceKey(text);
  if (!parsed.ok) throw new Error(`test Alliance key "${text}" is not valid`);
  return parsed.value;
}

/** One target of every kind the Look again button can repeat. */
const TARGETS: readonly { readonly label: string; readonly target: LookAgainTarget }[] = [
  { label: "a Player card", target: { kind: "player", uid: uid(UID) } },
  { label: "an Alliance card", target: { kind: "alliance", kingdom: kingdom(330), tag: tag("NML") } },
  { label: "an Alliance Overview", target: { kind: "overview", kingdom: kingdom(330), tag: tag("NML") } },
  { label: "/reaper closest without coordinates", target: { kind: "reaper" } },
  { label: "/reaper closest with coordinates", target: { kind: "reaper", origin: { x: 12, y: 34 } } },
];

describe("lookAgainCustomId", () => {
  test("writes a Player card's target as the owner, then p and the uid", () => {
    expect(lookAgainCustomId(OWNER_ID, { kind: "player", uid: uid(UID) })).toBe(`again:${OWNER_ID}:p:${UID}`);
  });

  test("writes an Alliance card's target as the owner, then a, the Kingdom and the tag", () => {
    expect(lookAgainCustomId(OWNER_ID, { kind: "alliance", kingdom: kingdom(330), tag: tag("NML") })).toBe(
      `again:${OWNER_ID}:a:330:NML`,
    );
  });

  test("writes an Alliance Overview's target as the owner, then o, the Kingdom and the tag", () => {
    expect(lookAgainCustomId(OWNER_ID, { kind: "overview", kingdom: kingdom(330), tag: tag("NML") })).toBe(
      `again:${OWNER_ID}:o:330:NML`,
    );
  });

  test("writes /reaper closest without coordinates as the owner, then r alone", () => {
    expect(lookAgainCustomId(OWNER_ID, { kind: "reaper" })).toBe(`again:${OWNER_ID}:r`);
  });

  test("writes /reaper closest with coordinates as the owner, then r, x and y", () => {
    expect(lookAgainCustomId(OWNER_ID, { kind: "reaper", origin: { x: 12, y: 34 } })).toBe(`again:${OWNER_ID}:r:12:34`);
  });
});

describe("parseLookAgainCustomId", () => {
  test.each(TARGETS)("reads back the id of $label, with the owner who pressed it", ({ target }) => {
    const customId = lookAgainCustomId(OWNER_ID, target);

    expect(parseLookAgainCustomId(customId)).toEqual({ ownerId: OWNER_ID, target });
  });

  test.each([
    { label: "a pick list id", customId: "pick:a1b2c3d4:select" },
    { label: "an Overview id", customId: "overview:a1b2c3d4e5f60718:m:0" },
    { label: "a prefix other than again", customId: `agen:${OWNER_ID}:p:${UID}` },
    { label: "no prefix at all", customId: `${OWNER_ID}:p:${UID}` },
    { label: "an unknown kind", customId: `again:${OWNER_ID}:x:${UID}` },
    { label: "no kind", customId: `again:${OWNER_ID}` },
    { label: "a Player card without a uid", customId: `again:${OWNER_ID}:p` },
    { label: "a Player card with an empty uid", customId: `again:${OWNER_ID}:p:` },
    { label: "an Alliance card without a tag", customId: `again:${OWNER_ID}:a:330` },
    { label: "an Alliance card with an empty tag", customId: `again:${OWNER_ID}:a:330:` },
    { label: "a /reaper closest with only x", customId: `again:${OWNER_ID}:r:12` },
    { label: "a Player card with a uid that is not digits", customId: `again:${OWNER_ID}:p:14556abc` },
    { label: "an Alliance card with a Kingdom that is not a number", customId: `again:${OWNER_ID}:a:kingdom:NML` },
    { label: "an Overview with a Kingdom that is not a number", customId: `again:${OWNER_ID}:o:x3:NML` },
    { label: "/reaper closest with an x that is not a number", customId: `again:${OWNER_ID}:r:x:34` },
    { label: "/reaper closest with a y that is not a number", customId: `again:${OWNER_ID}:r:12:y` },
  ])("returns undefined for $label", ({ customId }) => {
    expect(parseLookAgainCustomId(customId)).toBeUndefined();
  });
});

describe("Look again custom ids", () => {
  test.each(TARGETS)(
    "stay within Discord's 100 characters for $label, with a 20-digit owner and a 12-digit uid",
    ({ target }) => {
      const customId = lookAgainCustomId(TWENTY_DIGIT_OWNER_ID, target);

      expect(customId.length).toBeLessThanOrEqual(CUSTOM_ID_MAX_LENGTH);
    },
  );
});
