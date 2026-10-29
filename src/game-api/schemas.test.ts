import { describe, expect, test } from "vitest";
import alliance from "./__fixtures__/alliance.json" with { type: "json" };
import playerInAlliance from "./__fixtures__/player-in-alliance.json" with { type: "json" };
import { allianceBodySchema, ambiguousBodySchema, playerBodySchema } from "./schemas.js";

type PlayerBodyField = "uid" | "nick" | "kid" | "power" | "lv";

function withoutField(body: Record<string, unknown>, field: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([key]) => key !== field));
}

describe("playerBodySchema", () => {
  test("parses the recorded body of a Player in an Alliance", () => {
    expect(playerBodySchema.safeParse(playerInAlliance).success).toBe(true);
  });

  test.each<PlayerBodyField>(["uid", "nick", "kid", "power", "lv"])("rejects a body without %s", (field) => {
    expect(playerBodySchema.safeParse(withoutField(playerInAlliance, field)).success).toBe(false);
  });

  test("accepts a roster row whose rank_label is null", () => {
    const body = {
      ...playerInAlliance,
      alliance_members: playerInAlliance.alliance_members.map((row) => ({ ...row, rank_label: null })),
    };

    expect(playerBodySchema.safeParse(body).success).toBe(true);
  });

  test("ignores fields it does not know about", () => {
    const body = { ...playerInAlliance, a_field_the_game_added_later: { anything: true } };

    expect(playerBodySchema.safeParse(body).success).toBe(true);
  });
});

type AllianceBodyField = "abbr" | "name" | "sid" | "power" | "member_count" | "capacity";

describe("allianceBodySchema", () => {
  test("parses the recorded body of the alliance NML", () => {
    expect(allianceBodySchema.safeParse(alliance).success).toBe(true);
  });

  test.each<AllianceBodyField>(["abbr", "name", "sid", "power", "member_count", "capacity"])(
    "rejects a body without %s",
    (field) => {
      expect(allianceBodySchema.safeParse(withoutField(alliance, field)).success).toBe(false);
    },
  );

  test("accepts a body whose leader_name is null", () => {
    expect(allianceBodySchema.safeParse({ ...alliance, leader_name: null }).success).toBe(true);
  });

  test("ignores fields it does not know about", () => {
    const body = {
      ...alliance,
      a_field_the_game_added_later: { anything: true },
    };

    expect(allianceBodySchema.safeParse(body).success).toBe(true);
  });
});

/**
 * Hand-written, not recorded (research R9): the 409 body the alliance endpoint may answer when a name
 * is shared by more than one alliance. Its exact shape is unverified, so the schema stays lenient.
 */
const handWrittenAmbiguousBody = {
  matches: [
    { tag: "NML", name: "No Man's Land", server: 1, uid: 145563254785 },
    { tag: "NMX", name: "No Man's Land", server: 2, uid: 93159425 },
  ],
};

describe("ambiguousBodySchema", () => {
  test("parses the hand-written 409 body with two matches", () => {
    expect(ambiguousBodySchema.safeParse(handWrittenAmbiguousBody).success).toBe(true);
  });

  test("accepts a match that gives only some of its fields", () => {
    expect(ambiguousBodySchema.safeParse({ matches: [{ name: "No Man's Land" }] }).success).toBe(true);
  });

  test("rejects a body without a matches list", () => {
    expect(ambiguousBodySchema.safeParse({ detail: "alliance_ambiguous" }).success).toBe(false);
  });
});
