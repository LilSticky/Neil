import { MessageFlags, type InteractionReplyOptions } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import { utcDayOf, type DailyQuota } from "../domain/daily-quota.js";
import type { AllowanceKeeper, MemberUsage } from "../game-api/allowance-keeper.js";
import { handleQuota, type QuotaContext, type QuotaInteraction } from "./quota.js";

const MODERATOR_ROLE_ID = "12345678901234567";
const KING_ROLE_ID = "12345678901234567890";
const MEMBER_ROLE_ID = "98765432109876543";

const NOW = new Date("2026-10-30T18:48:00Z");
const CONFIRMED_AT = new Date("2026-10-30T18:40:00Z");

const NOT_OFFICER_TEXT = "/quota is for Officers (Moderator or King).";

/** The Daily Allowance lines of a day with no lookups yet, for the default allowance of 14 per Member and 70 expected. */
const NO_LOOKUPS_LINES = [
  "Daily Allowance: 14 per Member (Expected Lookup Members: 70)",
  "No lookups yet today.",
];

/** A Daily Quota of 1,875 used out of 2,000 for today (125 remaining), confirmed by the Game API at 18:40 UTC. */
function quota(overrides: Partial<DailyQuota> = {}): DailyQuota {
  return {
    day: utcDayOf(NOW),
    used: 1875,
    limit: 2000,
    limitReached: false,
    confirmedAt: CONFIRMED_AT,
    ...overrides,
  };
}

/** An interaction that records its replies, optionally failing them, and reports the given role IDs. */
class FakeQuotaInteraction implements QuotaInteraction {
  readonly replies: InteractionReplyOptions[] = [];

  constructor(
    private readonly roleIds: readonly string[],
    private readonly failWith?: Error,
  ) {}

  memberRoleIds(): readonly string[] {
    return this.roleIds;
  }

  reply(options: InteractionReplyOptions): Promise<unknown> {
    if (this.failWith !== undefined) return Promise.reject(this.failWith);
    this.replies.push(options);
    return Promise.resolve(undefined);
  }
}

/**
 * The Daily Allowance figures /quota reads: the allowance per Member, the expected Lookup Members and the Members with
 * the most requests today. `top` returns every given Member, whatever n is asked, so the handler must cut the list itself.
 */
function allowanceWith(
  options: { allowance?: number; expected?: number; top?: readonly MemberUsage[] } = {},
): Pick<AllowanceKeeper, "allowance" | "expected" | "top"> {
  const { allowance = 14, expected = 70, top = [] } = options;
  return {
    allowance: () => allowance,
    expected: () => expected,
    top: () => top,
  };
}

/**
 * A context whose quota is the given one, with the Quota Reserve given (100 unless the test says otherwise) and the
 * allowance figures given (14 per Member, 70 expected, nobody yet unless the test says otherwise);
 * quotaToday is a spy so tests can see whether it was read.
 */
function contextWith(
  today: DailyQuota,
  logged: string[] = [],
  quotaReserve = 100,
  allowance = allowanceWith(),
) {
  const quotaToday = vi.fn<() => DailyQuota>(() => today);
  const context: QuotaContext = {
    quotaToday,
    quotaReserve,
    allowance,
    officerRoleIds: [MODERATOR_ROLE_ID, KING_ROLE_ID],
    now: () => NOW,
    logError: (message: string) => {
      logged.push(message);
    },
  };
  return { context, quotaToday };
}

describe("handleQuota for an Officer", () => {
  test.each([
    { label: "Moderator", roleIds: [MODERATOR_ROLE_ID] },
    { label: "King", roleIds: [KING_ROLE_ID] },
  ])("replies once, privately, with the five lines and the Daily Allowance lines for a $label", async ({ roleIds }) => {
    const interaction = new FakeQuotaInteraction([MEMBER_ROLE_ID, ...roleIds]);
    const { context } = contextWith(quota());

    await handleQuota(interaction, context);

    expect(interaction.replies).toEqual([
      {
        content: [
          "Daily Quota for 2026-10-30 (UTC)",
          "Used: 1,875 · Remaining: 125 · Limit: 2,000",
          "Quota Reserve: 100 (for Onboarding Interviews) · Left for lookups: 25",
          "Resets at 00:00 UTC (in 5 h 12 min).",
          "Last confirmed by the Game API at 18:40 UTC.",
          ...NO_LOOKUPS_LINES,
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    ]);
  });

  test("shows the Quota Reserve the context gives, not a fixed one, with what is left above it", async () => {
    const interaction = new FakeQuotaInteraction([MODERATOR_ROLE_ID]);
    const { context } = contextWith(quota(), [], 50);

    await handleQuota(interaction, context);

    expect(interaction.replies).toEqual([
      {
        content: [
          "Daily Quota for 2026-10-30 (UTC)",
          "Used: 1,875 · Remaining: 125 · Limit: 2,000",
          "Quota Reserve: 50 (for Onboarding Interviews) · Left for lookups: 75",
          "Resets at 00:00 UTC (in 5 h 12 min).",
          "Last confirmed by the Game API at 18:40 UTC.",
          ...NO_LOOKUPS_LINES,
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    ]);
  });

  test("adds the spent note to the second line when the Game API reported the limit reached", async () => {
    const interaction = new FakeQuotaInteraction([MODERATOR_ROLE_ID]);
    const { context } = contextWith(quota({ limitReached: true }));

    await handleQuota(interaction, context);

    expect(interaction.replies).toEqual([
      {
        content: [
          "Daily Quota for 2026-10-30 (UTC)",
          "Used: 1,875 · Remaining: 125 · Limit: 2,000 · Spent: the Game API reported the limit reached",
          "Quota Reserve: 100 (for Onboarding Interviews) · Left for lookups: 25",
          "Resets at 00:00 UTC (in 5 h 12 min).",
          "Last confirmed by the Game API at 18:40 UTC.",
          ...NO_LOOKUPS_LINES,
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    ]);
  });

  test("says the day is not confirmed yet when no answer has confirmed the limit today", async () => {
    const interaction = new FakeQuotaInteraction([KING_ROLE_ID]);
    const { context } = contextWith(quota({ confirmedAt: undefined }));

    await handleQuota(interaction, context);

    expect(interaction.replies).toEqual([
      {
        content: [
          "Daily Quota for 2026-10-30 (UTC)",
          "Used: 1,875 · Remaining: 125 · Limit: 2,000",
          "Quota Reserve: 100 (for Onboarding Interviews) · Left for lookups: 25",
          "Resets at 00:00 UTC (in 5 h 12 min).",
          "Not confirmed by the Game API yet today.",
          ...NO_LOOKUPS_LINES,
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    ]);
  });
});

describe("handleQuota's Daily Allowance and Most requests today", () => {
  const FIVE_LINES = [
    "Daily Quota for 2026-10-30 (UTC)",
    "Used: 1,875 · Remaining: 125 · Limit: 2,000",
    "Quota Reserve: 100 (for Onboarding Interviews) · Left for lookups: 25",
    "Resets at 00:00 UTC (in 5 h 12 min).",
    "Last confirmed by the Game API at 18:40 UTC.",
  ];

  test("adds the Daily Allowance, the Expected Lookup Members and the Members with the most requests, most first, and pings nobody", async () => {
    const interaction = new FakeQuotaInteraction([MODERATOR_ROLE_ID]);
    const { context } = contextWith(
      quota(),
      [],
      100,
      allowanceWith({
        allowance: 14,
        expected: 70,
        top: [
          { memberId: "111111111111111111", requests: 12 },
          { memberId: "222222222222222222", requests: 7 },
        ],
      }),
    );

    await handleQuota(interaction, context);

    expect(interaction.replies).toEqual([
      {
        content: [
          ...FIVE_LINES,
          "Daily Allowance: 14 per Member (Expected Lookup Members: 70)",
          "Most requests today:",
          "1. <@111111111111111111> · 12",
          "2. <@222222222222222222> · 7",
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    ]);
  });

  test.each([
    { expected: 70, shown: "70" },
    { expected: 70.34, shown: "70.3" },
  ])("shows the Expected Lookup Members $shown with at most one decimal", async ({ expected, shown }) => {
    const interaction = new FakeQuotaInteraction([MODERATOR_ROLE_ID]);
    const { context } = contextWith(quota(), [], 100, allowanceWith({ expected }));

    await handleQuota(interaction, context);

    expect(interaction.replies).toEqual([
      {
        content: [
          ...FIVE_LINES,
          `Daily Allowance: 14 per Member (Expected Lookup Members: ${shown})`,
          "No lookups yet today.",
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    ]);
  });

  test("lists at most 10 Members, even when the allowance figures give more", async () => {
    const interaction = new FakeQuotaInteraction([MODERATOR_ROLE_ID]);
    const top: MemberUsage[] = Array.from({ length: 12 }, (_, index) => ({
      memberId: `10000000000000000${(index + 1).toString()}`,
      requests: 12 - index,
    }));
    const { context } = contextWith(quota(), [], 100, allowanceWith({ top }));

    await handleQuota(interaction, context);

    const listed = top.slice(0, 10).map((usage, index) => `${(index + 1).toString()}. <@${usage.memberId}> · ${usage.requests.toString()}`);
    expect(interaction.replies).toEqual([
      {
        content: [
          ...FIVE_LINES,
          "Daily Allowance: 14 per Member (Expected Lookup Members: 70)",
          "Most requests today:",
          ...listed,
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    ]);
  });

  test("says No lookups yet today. in place of the list when no Member has made a request today", async () => {
    const interaction = new FakeQuotaInteraction([KING_ROLE_ID]);
    const { context } = contextWith(quota(), [], 100, allowanceWith({ top: [] }));

    await handleQuota(interaction, context);

    expect(interaction.replies).toEqual([
      {
        content: [
          ...FIVE_LINES,
          "Daily Allowance: 14 per Member (Expected Lookup Members: 70)",
          "No lookups yet today.",
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    ]);
  });
});

describe("handleQuota for a Member who is not an Officer", () => {
  test("replies privately that /quota is for Officers, without reading the Daily Quota", async () => {
    const interaction = new FakeQuotaInteraction([MEMBER_ROLE_ID]);
    const { context, quotaToday } = contextWith(quota());

    await handleQuota(interaction, context);

    expect(interaction.replies).toEqual([
      {
        content: NOT_OFFICER_TEXT,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    ]);
    expect(quotaToday).not.toHaveBeenCalled();
  });

  test("replies the same to a Member with no roles at all", async () => {
    const interaction = new FakeQuotaInteraction([]);
    const { context, quotaToday } = contextWith(quota());

    await handleQuota(interaction, context);

    expect(interaction.replies).toEqual([
      {
        content: NOT_OFFICER_TEXT,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    ]);
    expect(quotaToday).not.toHaveBeenCalled();
  });
});

describe("handleQuota when Discord refuses the reply", () => {
  test("logs the failure mentioning /quota and resolves instead of throwing", async () => {
    const logged: string[] = [];
    const interaction = new FakeQuotaInteraction(
      [MODERATOR_ROLE_ID],
      new Error("Unknown interaction"),
    );
    const { context } = contextWith(quota(), logged);

    await expect(handleQuota(interaction, context)).resolves.toBeUndefined();

    expect(logged).toEqual([expect.stringContaining("/quota")]);
  });
});
