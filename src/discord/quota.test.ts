import { MessageFlags, type InteractionReplyOptions } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import { utcDayOf, type DailyQuota } from "../domain/daily-quota.js";
import { handleQuota, type QuotaContext, type QuotaInteraction } from "./quota.js";

const MODERATOR_ROLE_ID = "12345678901234567";
const KING_ROLE_ID = "12345678901234567890";
const MEMBER_ROLE_ID = "98765432109876543";

const NOW = new Date("2026-10-30T18:48:00Z");
const CONFIRMED_AT = new Date("2026-10-30T18:40:00Z");

const NOT_OFFICER_TEXT = "/quota is for Officers (Moderator or King).";

/** A Daily Quota of 123 used out of 2,000 for today, confirmed by the Game API at 18:40 UTC. */
function quota(overrides: Partial<DailyQuota> = {}): DailyQuota {
  return {
    day: utcDayOf(NOW),
    used: 123,
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

/** A context whose quota is the given one; quotaToday is a spy so tests can see whether it was read. */
function contextWith(today: DailyQuota, logged: string[] = []) {
  const quotaToday = vi.fn<() => DailyQuota>(() => today);
  const context: QuotaContext = {
    quotaToday,
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
  ])("replies once, privately, with the four lines for a $label", async ({ roleIds }) => {
    const interaction = new FakeQuotaInteraction([MEMBER_ROLE_ID, ...roleIds]);
    const { context } = contextWith(quota());

    await handleQuota(interaction, context);

    expect(interaction.replies).toEqual([
      {
        content: [
          "Daily Quota for 2026-10-30 (UTC)",
          "Used: 123 · Remaining: 1,877 · Limit: 2,000",
          "Resets at 00:00 UTC (in 5 h 12 min).",
          "Last confirmed by the Game API at 18:40 UTC.",
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
          "Used: 123 · Remaining: 1,877 · Limit: 2,000 · Spent: the Game API reported the limit reached",
          "Resets at 00:00 UTC (in 5 h 12 min).",
          "Last confirmed by the Game API at 18:40 UTC.",
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
          "Used: 123 · Remaining: 1,877 · Limit: 2,000",
          "Resets at 00:00 UTC (in 5 h 12 min).",
          "Not confirmed by the Game API yet today.",
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
