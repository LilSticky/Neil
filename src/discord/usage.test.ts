import { MessageFlags, type InteractionReplyOptions } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import type { AllowanceKeeper } from "../game-api/allowance-keeper.js";
import type { MemberId } from "../domain/rank-approval.js";
import { lookupMessages } from "./lookup-cards.js";
import { handleUsage, type UsageContext, type UsageInteraction } from "./usage.js";

const UNREADABLE_ALLOWANCE_MESSAGE = "allowance store is down";

const MODERATOR_ROLE_ID = "12345678901234567";
const KING_ROLE_ID = "12345678901234567890";
const MEMBER_ROLE_ID = "98765432109876543";
const CALLER: MemberId = "11111111111111111";

const NOW = new Date("2026-10-30T18:48:00Z");

/** The last four lines of the /usage reply, the same for a Member and an Officer. */
const SHARED_LINES = [
  "A lookup costs a request when Neil has not answered it in the last 10 minutes; cached answers are free.",
  "Onboarding is never charged.",
  "Resets at 00:00 UTC (in 5 h 12 min).",
];

/** An interaction that records its private replies and reports the given role IDs for the caller. */
class FakeUsageInteraction implements UsageInteraction {
  readonly callerId: MemberId = CALLER;
  readonly replies: InteractionReplyOptions[] = [];

  constructor(private readonly roleIds: readonly string[]) {}

  memberRoleIds(): readonly string[] {
    return this.roleIds;
  }

  reply(options: InteractionReplyOptions): Promise<unknown> {
    this.replies.push(options);
    return Promise.resolve(undefined);
  }
}

/** A context in which the caller has made 4 requests today against a Daily Allowance of 14. */
function contextWith() {
  const usageOf = vi.fn((memberId: MemberId) => (memberId === CALLER ? 4 : 0));
  const context: UsageContext = {
    allowance: {
      allowance: () => 14,
      usageOf,
    } satisfies Pick<AllowanceKeeper, "allowance" | "usageOf">,
    officerRoleIds: [MODERATOR_ROLE_ID, KING_ROLE_ID],
    now: () => NOW,
    logError: () => undefined,
  };
  return { context, usageOf };
}

describe("handleUsage for a Member", () => {
  test("replies privately with the requests used of the Daily Allowance, what costs a request, that Onboarding is never charged, and the reset with the time left", async () => {
    const interaction = new FakeUsageInteraction([MEMBER_ROLE_ID]);
    const { context } = contextWith();

    await handleUsage(interaction, context);

    expect(interaction.replies).toEqual([
      {
        content: [
          "Your lookups today: 4 of 14 Game API requests used.",
          ...SHARED_LINES,
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
      },
    ]);
  });

  test("replies the same to a Member with no roles at all", async () => {
    const interaction = new FakeUsageInteraction([]);
    const { context } = contextWith();

    await handleUsage(interaction, context);

    expect(interaction.replies).toEqual([
      {
        content: [
          "Your lookups today: 4 of 14 Game API requests used.",
          ...SHARED_LINES,
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
      },
    ]);
  });

  test("reads only the caller's own requests today from the allowance", async () => {
    const interaction = new FakeUsageInteraction([MEMBER_ROLE_ID]);
    const { context, usageOf } = contextWith();

    await handleUsage(interaction, context);

    expect(usageOf).toHaveBeenCalledWith(CALLER);
    expect(usageOf).toHaveBeenCalledTimes(1);
  });
});

describe("handleUsage for an Officer", () => {
  test.each([
    { label: "Moderator", roleIds: [MODERATOR_ROLE_ID] },
    { label: "King", roleIds: [KING_ROLE_ID] },
  ])("replies privately to a $label with the count and that Officers are not limited", async ({ roleIds }) => {
    const interaction = new FakeUsageInteraction([MEMBER_ROLE_ID, ...roleIds]);
    const { context } = contextWith();

    await handleUsage(interaction, context);

    expect(interaction.replies).toEqual([
      {
        content: [
          "Your lookups today: 4 Game API requests used. Officers are not limited.",
          ...SHARED_LINES,
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
      },
    ]);
  });
});

describe("handleUsage when the Daily Allowance cannot be read", () => {
  /** A context whose Daily Allowance figures throw, logging into `logged`. */
  function contextWithUnreadableAllowance(logged: string[]): UsageContext {
    return {
      allowance: {
        allowance: () => {
          throw new Error(UNREADABLE_ALLOWANCE_MESSAGE);
        },
        usageOf: () => 4,
      },
      officerRoleIds: [MODERATOR_ROLE_ID, KING_ROLE_ID],
      now: () => NOW,
      logError: (message: string) => {
        logged.push(message);
      },
    };
  }

  test("replies privately with the unavailable text, and logs the failure", async () => {
    const interaction = new FakeUsageInteraction([MEMBER_ROLE_ID]);
    const logged: string[] = [];

    await handleUsage(interaction, contextWithUnreadableAllowance(logged));

    expect(interaction.replies).toEqual([
      {
        content: lookupMessages.unavailable,
        flags: MessageFlags.Ephemeral,
      },
    ]);
    expect(logged).toEqual([expect.stringContaining(UNREADABLE_ALLOWANCE_MESSAGE)]);
  });

  test("logs a refused unavailable reply and resolves instead of throwing", async () => {
    const interaction: UsageInteraction = {
      callerId: CALLER,
      memberRoleIds: () => [MEMBER_ROLE_ID],
      reply: () => Promise.reject(new Error("Unknown interaction")),
    };
    const logged: string[] = [];

    await expect(handleUsage(interaction, contextWithUnreadableAllowance(logged))).resolves.toBeUndefined();

    expect(logged).toEqual(expect.arrayContaining([expect.stringContaining("Unknown interaction")]));
  });
});
