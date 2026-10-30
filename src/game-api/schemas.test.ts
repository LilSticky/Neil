import { describe, expect, test } from "vitest";
import alliance from "./__fixtures__/alliance.json" with { type: "json" };
import playerInAlliance from "./__fixtures__/player-in-alliance.json" with { type: "json" };
import playersAmbiguous from "./__fixtures__/players-ambiguous.json" with { type: "json" };
import { allianceBodySchema, ambiguousBodySchema, playerBodySchema, quotaFiguresFrom } from "./schemas.js";

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

describe("allianceBodySchema roster", () => {
  test("reads each member of the recorded roster as uid, nick_name and rank_label, with the uid as a string", () => {
    const parsed = allianceBodySchema.parse(alliance);

    expect(parsed.members).toEqual([
      { uid: "179060285441", nick_name: "etranger", rank_label: "R4" },
      { uid: "93159425", nick_name: "Benedict", rank_label: "R3" },
      { uid: "147744374785", nick_name: "Settong", rank_label: "R1" },
    ]);
  });

  test("accepts a member whose nick_name is null and whose rank_label is null", () => {
    const body = {
      ...alliance,
      members: [
        { uid: 93159425, nick_name: null, rank_label: null },
        { uid: 147744374785, nick_name: "Settong", rank_label: null },
      ],
    };

    expect(allianceBodySchema.safeParse(body).success).toBe(true);
  });

  test("drops a member without a uid and keeps the others", () => {
    const body = {
      ...alliance,
      members: [
        { nick_name: "Ghost", rank_label: "R1" },
        { uid: 93159425, nick_name: "Benedict", rank_label: "R3" },
      ],
    };

    const parsed = allianceBodySchema.parse(body);

    expect(parsed.members).toEqual([{ uid: "93159425", nick_name: "Benedict", rank_label: "R3" }]);
  });

  test("gives an empty roster when the body has no members", () => {
    const parsed = allianceBodySchema.parse(withoutField(alliance, "members"));

    expect(parsed.members).toEqual([]);
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

  test("reads the matches of the recorded 409, where the Game nests them under detail", () => {
    const parsed = ambiguousBodySchema.safeParse(playersAmbiguous);

    expect(parsed.success).toBe(true);
    expect(parsed.data?.matches).toEqual([
      { uid: "145563254785", server: 1, name: "DrLOL" },
      { uid: "169178267828", server: 180, name: "Drlol" },
    ]);
  });

  test("rejects a body without a matches list", () => {
    expect(ambiguousBodySchema.safeParse({ detail: "alliance_ambiguous" }).success).toBe(false);
  });
});

describe("playerBodySchema empty text", () => {
  test("rejects a body whose nick is an empty string", () => {
    expect(playerBodySchema.safeParse({ ...playerInAlliance, nick: "" }).success).toBe(false);
  });
});

/** The recorded body of a lookup (GAME-API.md): the Daily Quota is in `quota`. */
const recordedBodyWithQuota: unknown = {
  ok: true,
  cached: true,
  cache_seconds: 600,
  quota: { limit: 1000, used: 1, remaining: 999, patron: false, resets: "00:00 UTC" },
};

function headersWith(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("quotaFiguresFrom", () => {
  test("reads used and limit from the body quota of a recorded response", () => {
    expect(quotaFiguresFrom(recordedBodyWithQuota, new Headers())).toEqual({ used: 1, limit: 1000 });
  });

  test("prefers the body quota over the rate-limit headers", () => {
    const headers = headersWith({ "x-ratelimit-limit": "500", "x-ratelimit-remaining": "100" });

    expect(quotaFiguresFrom(recordedBodyWithQuota, headers)).toEqual({ used: 1, limit: 1000 });
  });

  test("takes used from the body quota even when the headers would give another value", () => {
    const body = { quota: { limit: 1000, used: 7, remaining: 993 } };
    const headers = headersWith({ "x-ratelimit-limit": "1000", "x-ratelimit-remaining": "990" });

    expect(quotaFiguresFrom(body, headers)).toEqual({ used: 7, limit: 1000 });
  });

  test("derives used as limit minus remaining from the headers when the body has no quota", () => {
    const headers = headersWith({ "x-ratelimit-limit": "1000", "x-ratelimit-remaining": "999" });

    expect(quotaFiguresFrom({ ok: true }, headers)).toEqual({ used: 1, limit: 1000 });
  });

  test("reads the headers of a response that has no body quota", () => {
    const headers = headersWith({ "x-ratelimit-limit": "1000", "x-ratelimit-remaining": "0" });

    expect(quotaFiguresFrom(null, headers)).toEqual({ used: 1000, limit: 1000 });
  });

  test("never reports used below zero when remaining is above limit", () => {
    const headers = headersWith({ "x-ratelimit-limit": "1000", "x-ratelimit-remaining": "1200" });

    expect(quotaFiguresFrom({}, headers)).toEqual({ used: 0, limit: 1000 });
  });

  test("returns undefined when the response carries no figures", () => {
    expect(quotaFiguresFrom({ ok: true }, new Headers())).toBeUndefined();
  });

  test("returns undefined for a body that is not an object and has no headers", () => {
    expect(quotaFiguresFrom(null, new Headers())).toBeUndefined();
  });

  test.each<[string, unknown]>([
    ["a limit of 0", { quota: { limit: 0, used: 0, remaining: 0 } }],
    ["a negative limit", { quota: { limit: -1000, used: 0, remaining: 0 } }],
    ["a negative used", { quota: { limit: 1000, used: -1, remaining: 999 } }],
    ["a fractional used", { quota: { limit: 1000, used: 1.5, remaining: 998.5 } }],
    ["a used given as a string", { quota: { limit: 1000, used: "1", remaining: 999 } }],
    ["a quota that is not an object", { quota: "1000" }],
    ["a quota missing its limit", { quota: { used: 1, remaining: 999 } }],
  ])("returns malformed for a body quota with %s", (_label, body) => {
    expect(quotaFiguresFrom(body, new Headers())).toBe("malformed");
  });

  test.each<[string, string]>([
    ["a limit of 0", "0"],
    ["a negative limit", "-1000"],
    ["a non-numeric limit", "abc"],
    ["a fractional limit", "1000.5"],
  ])("returns malformed for a rate-limit header with %s", (_label, limit) => {
    const headers = headersWith({ "x-ratelimit-limit": limit, "x-ratelimit-remaining": "999" });

    expect(quotaFiguresFrom({}, headers)).toBe("malformed");
  });

  test("returns malformed for a non-numeric remaining header", () => {
    const headers = headersWith({ "x-ratelimit-limit": "1000", "x-ratelimit-remaining": "abc" });

    expect(quotaFiguresFrom({}, headers)).toBe("malformed");
  });

  test("returns malformed when only x-ratelimit-limit is present", () => {
    const headers = headersWith({ "x-ratelimit-limit": "1000" });

    expect(quotaFiguresFrom({}, headers)).toBe("malformed");
  });

  test("returns malformed when only x-ratelimit-remaining is present", () => {
    const headers = headersWith({ "x-ratelimit-remaining": "999" });

    expect(quotaFiguresFrom({}, headers)).toBe("malformed");
  });
});
