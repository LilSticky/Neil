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

  test("accepts roster rows without rank_label, or with one that is not text, as rank unknown", () => {
    const body = {
      ...playerInAlliance,
      alliance_members: playerInAlliance.alliance_members.map((row, index) =>
        index === 0 ? { ...row, rank_label: 104 } : { uid: row.uid },
      ),
    };

    const parsed = playerBodySchema.safeParse(body);

    expect(parsed.success).toBe(true);
    expect(parsed.data?.alliance_members?.every((row) => row.rank_label === null)).toBe(true);
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

/** Language tags the Game may send, such as ja, en, zh-Hans or pt-BR. */
const VALID_LANGUAGE_TAGS = ["ja", "en", "zh-Hans", "pt-BR"];

/** Text that is too long for a language tag, or is not one; it reads as absent and the body is still accepted. */
const UNREADABLE_LANGUAGES = [
  { label: "a text of 1,100 characters", value: "a".repeat(1100) },
  { label: "a text that is not a language tag", value: "ja jp!" },
  { label: "a text of digits", value: "123" },
];

describe("language tags", () => {
  test.each(VALID_LANGUAGE_TAGS)("keeps the language tag %s of a Player", (language) => {
    const parsed = playerBodySchema.safeParse({ ...playerInAlliance, language });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.language).toBe(language);
  });

  test.each(VALID_LANGUAGE_TAGS)("keeps the language tag %s of an Alliance", (language) => {
    const parsed = allianceBodySchema.safeParse({ ...alliance, language });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.language).toBe(language);
  });

  test.each(UNREADABLE_LANGUAGES)(
    "reads a Player language that is $label as absent, and still accepts the body",
    ({ value }) => {
      const parsed = playerBodySchema.safeParse({ ...playerInAlliance, language: value });

      expect(parsed.success).toBe(true);
      expect(parsed.data?.language).toBeUndefined();
    },
  );

  test.each(UNREADABLE_LANGUAGES)(
    "reads an Alliance language that is $label as absent, and still accepts the body",
    ({ value }) => {
      const parsed = allianceBodySchema.safeParse({ ...alliance, language: value });

      expect(parsed.success).toBe(true);
      expect(parsed.data?.language).toBeUndefined();
    },
  );
});

describe("allianceBodySchema roster", () => {
  test("reads each member of the recorded roster as uid, nick_name and rank_label, with the uid as a string", () => {
    const parsed = allianceBodySchema.parse(alliance);

    expect(parsed.members).toEqual([
      {
        uid: "179060285441",
        nick_name: "etranger",
        power: 26041955,
        rank_label: "R4",
        kid: 1,
        lv: 22,
        active: 490,
        daily_honor: 40,
        daily_tech: 4600,
        online: false,
        last_online_at: 1793285439,
      },
      {
        uid: "93159425",
        nick_name: "Benedict",
        power: 17081208,
        rank_label: "R3",
        kid: 1,
        lv: 26,
        active: null,
        daily_honor: null,
        daily_tech: null,
        online: false,
        last_online_at: 1793191591,
      },
      {
        uid: "147744374785",
        nick_name: "Settong",
        power: 16713141,
        rank_label: "R1",
        kid: 1,
        lv: 21,
        active: null,
        daily_honor: null,
        daily_tech: null,
        online: false,
        last_online_at: 1792878480,
      },
    ]);
  });

  test("reads the Kingdom (kid) and sanctuary level (lv) of each recorded member as whole numbers", () => {
    const parsed = allianceBodySchema.parse(alliance);

    expect(parsed.members.map((member) => [member.kid, member.lv])).toEqual([
      [1, 22],
      [1, 26],
      [1, 21],
    ]);
  });

  test("keeps a member whose kid or lv is not a whole number, and reads that figure as absent", () => {
    const body = {
      ...alliance,
      members: [{ uid: 179060285441, nick_name: "etranger", rank_label: "R4", kid: "1", lv: 22.5 }],
    };

    const parsed = allianceBodySchema.parse(body);

    expect(parsed.members).toHaveLength(1);
    expect(parsed.members[0]?.kid).toBeUndefined();
    expect(parsed.members[0]?.lv).toBeUndefined();
  });

  test("reads the activity figures and online fields of a recorded member, null included", () => {
    const parsed = allianceBodySchema.parse(alliance);

    expect(parsed.members[0]).toMatchObject({ active: 490, daily_honor: 40, daily_tech: 4600, online: false });
    expect(parsed.members[1]).toMatchObject({ active: null, daily_honor: null, daily_tech: null });
  });

  test("keeps a member whose activity figure is not a whole number, and reads that figure as absent", () => {
    const body = {
      ...alliance,
      members: [{ uid: 179060285441, nick_name: "etranger", rank_label: "R4", active: "490", daily_honor: 4.5 }],
    };

    const parsed = allianceBodySchema.parse(body);

    expect(parsed.members).toHaveLength(1);
    expect(parsed.members[0]?.active).toBeUndefined();
    expect(parsed.members[0]?.daily_honor).toBeUndefined();
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

  test("reads a last_online_at beyond the range of a date as absent, and keeps the member", () => {
    const body = {
      ...alliance,
      members: [{ uid: 179060285441, nick_name: "etranger", rank_label: "R4", last_online_at: Number.MAX_SAFE_INTEGER }],
    };

    const parsed = allianceBodySchema.parse(body);

    expect(parsed.members).toEqual([{ uid: "179060285441", nick_name: "etranger", rank_label: "R4" }]);
  });

  test("reads a last_online_at of 0 as absent, not as the Unix epoch, and keeps the member", () => {
    const body = {
      ...alliance,
      members: [{ uid: 179060285441, nick_name: "etranger", rank_label: "R4", last_online_at: 0 }],
    };

    const parsed = allianceBodySchema.parse(body);

    expect(parsed.members).toEqual([{ uid: "179060285441", nick_name: "etranger", rank_label: "R4" }]);
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

describe("playerBodySchema alliance leader", () => {
  test("reads alliance.leader_id of the recorded body as the Leader's uid text", () => {
    const parsed = playerBodySchema.safeParse(playerInAlliance);

    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ alliance: { leader_id: "145563254785" } });
  });

  test.each<[string, number | string]>([
    ["a number", 145563254785],
    ["a digit string", "145563254785"],
  ])("reads a leader_id given as %s as the same uid text", (_label, leaderId) => {
    const body = { ...playerInAlliance, alliance: { ...playerInAlliance.alliance, leader_id: leaderId } };

    expect(playerBodySchema.safeParse(body).data).toMatchObject({ alliance: { leader_id: "145563254785" } });
  });

  test("accepts a leader_id that is neither a number nor a string of digits, and reads no Leader", () => {
    const body = { ...playerInAlliance, alliance: { ...playerInAlliance.alliance, leader_id: "not-an-id" } };
    const parsed = playerBodySchema.safeParse(body);

    expect(parsed.success).toBe(true);
    expect(parsed.data?.alliance?.leader_id).toBeUndefined();
  });
});

describe("playerBodySchema empty text", () => {
  test("rejects a body whose nick is an empty string", () => {
    expect(playerBodySchema.safeParse({ ...playerInAlliance, nick: "" }).success).toBe(false);
  });
});

/**
 * Values a new Game field may hold without failing the body: missing, null, of the wrong type, out of range, or a
 * picture path that is not under /static/, has "..", or is not a picture.
 */
const UNREADABLE: readonly unknown[] = [
  undefined,
  null,
  "text",
  -1,
  1.5,
  Number.MAX_SAFE_INTEGER,
  {},
  [],
  "/avatars/head_90002.png",
  "https://example.com/static/avatars/head_90002.png",
  "/static/avatars/../head_90002.png",
  "/static/avatars/head_90002.svg",
];

const PLAYER_DETAIL_FIELDS = [
  "kills",
  "vip",
  "likes",
  "last_online_at",
  "language",
  "x",
  "y",
  "avatar_url",
  "server_badge_url",
  "shielding",
] as const;

const ALLIANCE_DETAIL_FIELDS = ["level", "exp", "gift_level", "language", "rank", "join", "badge_url", "server_badge_url"] as const;

describe("playerBodySchema Player details", () => {
  test("reads the recorded Player details under the Game's own names", () => {
    expect(playerBodySchema.parse(playerInAlliance)).toMatchObject({
      kills: 4420,
      vip: 4,
      likes: 110,
      last_online_at: 1793154302,
      language: "en",
      x: 807,
      y: 846,
      avatar_url: "/static/avatars/head_90002.png",
      server_badge_url: "/static/kingdom/badge_1.png",
    });
  });

  test.each(PLAYER_DETAIL_FIELDS)("accepts a body whose %s is unreadable, and keeps the Player's own fields", (field) => {
    const rejected = UNREADABLE.filter((value) => !playerBodySchema.safeParse({ ...playerInAlliance, [field]: value }).success);

    expect(rejected).toEqual([]);
  });
});

describe("allianceBodySchema Alliance details", () => {
  test("reads the recorded Alliance details under the Game's own names", () => {
    expect(allianceBodySchema.parse(alliance)).toMatchObject({
      level: 4,
      exp: 8829850,
      gift_level: 6,
      language: "ja",
      badge_url: "/static/alliance/badge_103.png",
      server_badge_url: "/static/kingdom/badge_1.png",
    });
  });

  test.each(ALLIANCE_DETAIL_FIELDS)("accepts a body whose %s is unreadable, and keeps the Alliance's own fields", (field) => {
    const rejected = UNREADABLE.filter((value) => !allianceBodySchema.safeParse({ ...alliance, [field]: value }).success);

    expect(rejected).toEqual([]);
  });

  test("reads the power of each recorded roster member", () => {
    expect(allianceBodySchema.parse(alliance).members.map((member) => member.power)).toEqual([
      26041955, 17081208, 16713141,
    ]);
  });

  test("keeps a roster member whose power is unreadable, and accepts the body", () => {
    const kept = UNREADABLE.filter((value) => {
      const parsed = allianceBodySchema.safeParse({
        ...alliance,
        members: [{ uid: 179060285441, nick_name: "etranger", rank_label: "R4", power: value }],
      });
      return !parsed.success || parsed.data.members.length !== 1;
    });

    expect(kept).toEqual([]);
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
