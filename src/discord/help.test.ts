import { MessageFlags, type InteractionReplyOptions, type APIEmbed } from "discord.js";
import { describe, expect, test } from "vitest";
import { commands } from "./commands.js";
import { handleHelp, type HelpContext, type HelpInteraction } from "./help.js";

const MODERATOR_ROLE_ID = "12345678901234567";
const KING_ROLE_ID = "12345678901234567890";
const MEMBER_ROLE_ID = "98765432109876543";

/** Mentions are switched off: the answer names commands and never pings anyone. */
const NO_MENTIONS = { parse: [] };

/** The description of a reply embed; a reply without one fails the assertions that read it. */
function textOf(embed: APIEmbed | undefined): string {
  return embed?.description ?? "";
}

/** An interaction that records its private replies and reports the given role IDs for the caller. */
class FakeHelpInteraction implements HelpInteraction {
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

function contextWith(logged: string[] = []): HelpContext {
  return {
    commands,
    officerRoleIds: [MODERATOR_ROLE_ID, KING_ROLE_ID],
    logError: (message: string) => {
      logged.push(message);
    },
  };
}

describe("handleHelp for a Member", () => {
  test("replies privately, with no mentions, with one embed listing the Member commands", async () => {
    const interaction = new FakeHelpInteraction([MEMBER_ROLE_ID]);

    await handleHelp(interaction, contextWith());

    expect(interaction.replies).toHaveLength(1);
    expect(interaction.replies[0]?.embeds).toHaveLength(1);
    expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    expect(interaction.replies[0]?.allowedMentions).toEqual(NO_MENTIONS);
  });

  test("lists the usage and purpose of a Member command", async () => {
    const interaction = new FakeHelpInteraction([MEMBER_ROLE_ID]);

    await handleHelp(interaction, contextWith());

    const embed = interaction.replies[0]?.embeds?.[0] as APIEmbed | undefined;
    expect(textOf(embed)).toContain("`/usage` — Show your Game API requests today and your Daily Allowance");
  });

  test("lists /help itself", async () => {
    const interaction = new FakeHelpInteraction([MEMBER_ROLE_ID]);

    await handleHelp(interaction, contextWith());

    const embed = interaction.replies[0]?.embeds?.[0] as APIEmbed | undefined;
    expect(textOf(embed)).toContain("`/help` — Show the commands you can use and what they are for");
  });

  test("leaves out /quota, /rank and /link", async () => {
    const interaction = new FakeHelpInteraction([MEMBER_ROLE_ID]);

    await handleHelp(interaction, contextWith());

    const embed = interaction.replies[0]?.embeds?.[0] as APIEmbed | undefined;
    expect(textOf(embed)).not.toContain("`/quota`");
    expect(textOf(embed)).not.toContain("`/rank`");
    expect(textOf(embed)).not.toContain("`/link`");
  });

  test("gives the Member list to a member with no roles at all, such as a Guest or an unlinked Member", async () => {
    const interaction = new FakeHelpInteraction([]);

    await handleHelp(interaction, contextWith());

    const embed = interaction.replies[0]?.embeds?.[0] as APIEmbed | undefined;
    expect(textOf(embed)).toContain("`/usage`");
    expect(textOf(embed)).not.toContain("`/quota`");
  });
});

describe("handleHelp for an Officer", () => {
  test.each([
    { label: "Moderator", roleIds: [MODERATOR_ROLE_ID] },
    { label: "King", roleIds: [KING_ROLE_ID] },
  ])("lists the Officer commands too, to a $label", async ({ roleIds }) => {
    const interaction = new FakeHelpInteraction([MEMBER_ROLE_ID, ...roleIds]);

    await handleHelp(interaction, contextWith());

    expect(interaction.replies[0]?.embeds).toHaveLength(1);
    expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    expect(interaction.replies[0]?.allowedMentions).toEqual(NO_MENTIONS);
    const embed = interaction.replies[0]?.embeds?.[0] as APIEmbed | undefined;
    expect(textOf(embed)).toContain("`/quota` — Show today's Daily Quota of Game API requests (Officers)");
    expect(textOf(embed)).toContain("`/rank <member> <rank>`");
    expect(textOf(embed)).toContain("`/link <member> <uid>`");
  });
});

describe("handleHelp when the reply fails", () => {
  test("logs the failure and resolves instead of throwing", async () => {
    const interaction = {
      memberRoleIds: () => [MEMBER_ROLE_ID],
      reply: () => Promise.reject(new Error("Unknown interaction")),
    } satisfies HelpInteraction;
    const logged: string[] = [];

    await expect(handleHelp(interaction, contextWith(logged))).resolves.toBeUndefined();

    expect(logged).toEqual([expect.stringContaining("Unknown interaction")]);
  });
});
