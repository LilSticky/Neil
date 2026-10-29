import { describe, expect, test } from "vitest";
import playerInAlliance from "./__fixtures__/player-in-alliance.json" with { type: "json" };
import { playerBodySchema } from "./schemas.js";

type PlayerBodyField = "uid" | "nick" | "kid" | "power" | "lv";

function withoutField(body: Record<string, unknown>, field: PlayerBodyField): Record<string, unknown> {
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
