import { MessageFlags, SlashCommandBuilder, type InteractionReplyOptions, type APIEmbed } from "discord.js";
import { describe, expect, test } from "vitest";
import { commands } from "./commands.js";
import { handleHelp, type HelpContext, type HelpInteraction } from "./help.js";

const MODERATOR_ROLE_ID = "12345678901234567";
const KING_ROLE_ID = "12345678901234567890";
const MEMBER_ROLE_ID = "98765432109876543";

/** Mentions are switched off: the answer names commands and never pings anyone. */
const NO_MENTIONS = { parse: [] };

/** Every embed of the given messages, in order. */
function embedsOf(messages: readonly InteractionReplyOptions[]): APIEmbed[] {
  return messages.flatMap((message) => (message.embeds ?? []) as APIEmbed[]);
}

/** The descriptions of every embed of the reply and the follow-ups, joined line by line. */
function textOf(interaction: FakeHelpInteraction): string {
  return embedsOf(interaction.messages())
    .map((embed) => embed.description ?? "")
    .join("\n");
}

/** An interaction that records its private replies and reports the given role IDs for the caller. */
class FakeHelpInteraction implements HelpInteraction {
  readonly replies: InteractionReplyOptions[] = [];

  constructor(private readonly roleIds: readonly string[]) {}

  memberRoleIds(): readonly string[] {
    return this.roleIds;
  }

  readonly followUps: InteractionReplyOptions[] = [];

  reply(options: InteractionReplyOptions): Promise<unknown> {
    this.replies.push(options);
    return Promise.resolve(undefined);
  }

  followUp(options: InteractionReplyOptions): Promise<unknown> {
    this.followUps.push(options);
    return Promise.resolve(undefined);
  }

  /** The reply first, then the follow-ups. */
  messages(): InteractionReplyOptions[] {
    return [...this.replies, ...this.followUps];
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
  test("replies privately, with no mentions, with untitled embeds listing the Member commands", async () => {
    const interaction = new FakeHelpInteraction([MEMBER_ROLE_ID]);

    await handleHelp(interaction, contextWith());

    expect(interaction.replies).toHaveLength(1);
    expect(interaction.replies[0]?.embeds?.length).toBeGreaterThan(0);
    for (const message of interaction.messages()) {
      expect(message.flags).toBe(MessageFlags.Ephemeral);
      expect(message.allowedMentions).toEqual(NO_MENTIONS);
    }
    expect(embedsOf(interaction.messages()).every((embed) => embed.title === undefined)).toBe(true);
  });

  test("lists the usage and purpose of a Member command", async () => {
    const interaction = new FakeHelpInteraction([MEMBER_ROLE_ID]);

    await handleHelp(interaction, contextWith());

    expect(textOf(interaction)).toContain("`/usage` — Show your Game API requests today and your Daily Allowance");
  });

  test("lists /help itself", async () => {
    const interaction = new FakeHelpInteraction([MEMBER_ROLE_ID]);

    await handleHelp(interaction, contextWith());

    expect(textOf(interaction)).toContain("`/help` — Show the commands you can use and what they are for");
  });

  test("leaves out /quota, /rank and /link", async () => {
    const interaction = new FakeHelpInteraction([MEMBER_ROLE_ID]);

    await handleHelp(interaction, contextWith());

    expect(textOf(interaction)).not.toContain("`/quota`");
    expect(textOf(interaction)).not.toContain("`/rank`");
    expect(textOf(interaction)).not.toContain("`/link`");
  });

  test("lists /event-kinds with its three usages in the Member commands, since an Alliance's R4 and R5 use it", async () => {
    const interaction = new FakeHelpInteraction([MEMBER_ROLE_ID]);

    await handleHelp(interaction, contextWith());

    expect(textOf(interaction)).toContain(
      "`/event-kinds add <name> <before-start> [signup-deadline] [before-signup] [list]`",
    );
    expect(textOf(interaction)).toContain("`/event-kinds remove <name> [list]`");
    expect(textOf(interaction)).toContain("`/event-kinds list [list]`");
  });

  test("lists /event-invitations with its usage in the Member commands, since every Linked Member may switch invitations", async () => {
    const interaction = new FakeHelpInteraction([MEMBER_ROLE_ID]);

    await handleHelp(interaction, contextWith());

    expect(textOf(interaction)).toContain(
      "`/event-invitations [invitations]` — Choose whether Event Invitations mention you, on or off",
    );
  });

  test("gives the Member list to a member with no roles at all, such as a Guest or an unlinked Member", async () => {
    const interaction = new FakeHelpInteraction([]);

    await handleHelp(interaction, contextWith());

    expect(textOf(interaction)).toContain("`/usage`");
    expect(textOf(interaction)).not.toContain("`/quota`");
  });
});

describe("handleHelp for an Officer", () => {
  test.each([
    { label: "Moderator", roleIds: [MODERATOR_ROLE_ID] },
    { label: "King", roleIds: [KING_ROLE_ID] },
  ])("lists the Officer commands too, to a $label", async ({ roleIds }) => {
    const interaction = new FakeHelpInteraction([MEMBER_ROLE_ID, ...roleIds]);

    await handleHelp(interaction, contextWith());

    for (const message of interaction.messages()) {
      expect(message.flags).toBe(MessageFlags.Ephemeral);
      expect(message.allowedMentions).toEqual(NO_MENTIONS);
    }
    const embeds = embedsOf(interaction.messages());
    expect(embeds[0]?.title).toBeUndefined();
    expect(embeds.at(-1)?.title).toBe("Officer commands");
    const officerText = embeds
      .filter((embed) => embed.title === "Officer commands")
      .map((embed) => embed.description ?? "")
      .join("\n");
    expect(officerText).toContain("`/quota` — Show today's Daily Quota of Game API requests (Officers)");
    expect(officerText).toContain("`/rank <member> <rank>`");
    expect(officerText).toContain("`/link <member> <uid>`");
  });
});

describe("handleHelp when the answer cannot be built", () => {
  test("logs the failure and still answers privately", async () => {
    const replies: InteractionReplyOptions[] = [];
    const interaction = {
      memberRoleIds: (): readonly string[] => {
        throw new Error("no roles");
      },
      reply: (options: InteractionReplyOptions) => {
        replies.push(options);
        return Promise.resolve(undefined);
      },
      followUp: (options: InteractionReplyOptions) => {
        replies.push(options);
        return Promise.resolve(undefined);
      },
    } satisfies HelpInteraction;
    const logged: string[] = [];

    await handleHelp(interaction, contextWith(logged));

    expect(logged).toEqual([expect.stringContaining("no roles")]);
    expect(replies).toHaveLength(1);
    expect(replies[0]?.content).toContain("tell an Officer");
    expect(replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    expect(replies[0]?.allowedMentions).toEqual(NO_MENTIONS);
  });
});

describe("handleHelp when the reply fails", () => {
  test("logs the failure and resolves instead of throwing", async () => {
    const interaction = {
      memberRoleIds: () => [MEMBER_ROLE_ID],
      reply: () => Promise.reject(new Error("Unknown interaction")),
      followUp: () => Promise.resolve(undefined),
    } satisfies HelpInteraction;
    const logged: string[] = [];

    await expect(handleHelp(interaction, contextWith(logged))).resolves.toBeUndefined();

    expect(logged).toEqual([expect.stringContaining("Unknown interaction")]);
  });
});

/** Many long Member commands, so that /help needs more than one message. */
const manyCommands = Array.from({ length: 150 }, (_, index) =>
  new SlashCommandBuilder()
    .setName(`command-${String(index)}`)
    .setDescription(`Command ${String(index)} `.padEnd(100, "x"))
    .toJSON(),
);

describe("handleHelp when the list needs more than one message", () => {
  test("sends the first page as the reply and the rest as follow-ups, all private with no mentions, in order", async () => {
    const interaction = new FakeHelpInteraction([MEMBER_ROLE_ID]);

    await handleHelp(interaction, { ...contextWith(), commands: manyCommands });

    expect(interaction.replies).toHaveLength(1);
    expect(interaction.followUps.length).toBeGreaterThan(1);
    for (const message of interaction.messages()) {
      expect(message.flags).toBe(MessageFlags.Ephemeral);
      expect(message.allowedMentions).toEqual(NO_MENTIONS);
    }
    const lines = textOf(interaction).split("\n");
    expect(lines).toHaveLength(150);
    expect(lines[0]).toContain("`/command-0`");
    expect(lines[149]).toContain("`/command-149`");
  });

  test("logs a failed follow-up, sends no more and resolves instead of throwing", async () => {
    let followUps = 0;
    const interaction = {
      memberRoleIds: () => [MEMBER_ROLE_ID],
      reply: () => Promise.resolve(undefined),
      followUp: () => {
        followUps += 1;
        return Promise.reject(new Error("Unknown webhook"));
      },
    } satisfies HelpInteraction;
    const logged: string[] = [];

    await expect(
      handleHelp(interaction, {
        ...contextWith(logged),
        commands: manyCommands,
      }),
    ).resolves.toBeUndefined();

    expect(followUps).toBe(1);
    expect(logged).toEqual([expect.stringContaining("Unknown webhook")]);
  });

  test("sends no follow-up when the reply fails", async () => {
    let followUps = 0;
    const interaction = {
      memberRoleIds: () => [MEMBER_ROLE_ID],
      reply: () => Promise.reject(new Error("Unknown interaction")),
      followUp: () => {
        followUps += 1;
        return Promise.resolve(undefined);
      },
    } satisfies HelpInteraction;

    await handleHelp(interaction, { ...contextWith(), commands: manyCommands });

    expect(followUps).toBe(0);
  });
});
