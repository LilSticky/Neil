import {
  MessageFlags,
  type APIEmbed,
  type ApplicationCommandOptionChoiceData,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
} from "discord.js";
import {
  addObjective,
  addPhase,
  assign,
  cancel,
  confirmationDeadlineOf,
  confirmPlan,
  currentRaidOf,
  FIXED_OBJECTIVES,
  newRaid,
  objectivesOf,
  planDeadlineOf,
  publish,
  removeObjective,
  removePhase,
  setNotes,
  unassign,
  type Raid,
  type RaidResult,
} from "../domain/raid.js";
import type { LinkStore } from "../storage/link-store.js";
import type { RaidStore, StoredRaid } from "../storage/raid-store.js";
import { ledAllianceOf } from "./alliance-standing.js";
import type { EventRole } from "./events.js";
import { textWithMentions } from "./mentions.js";
import {
  confirmationCard,
  confirmRefusalText,
  confirmRow,
  fitsDiscord,
  planCard,
  raidIdOfButton,
  raidMessages,
  refusalText,
  stateLine,
} from "./raid-texts.js";
import { leadersOf, type RaidServer } from "./raid-server.js";

/** The channel the plan card goes to. */
export const PLAN_CHANNEL = "kvk-announcements";
/** The closed channel of the confirmation card, the chases and the deadlines. */
export const LEADERS_CHANNEL = "kvk-leaders";

/** The Raid settings from configuration; planning is off while the War Council role is unset. */
export interface RaidSettings {
  readonly warCouncilRoleId: string | undefined;
  /** The Raid start on Saturday, minutes after 00:00 Server Time. */
  readonly startMinutes: number | undefined;
  readonly planHours: number;
  readonly confirmationHours: number;
}

/** The part of a discord.js /raid-plan command that the Raid planning uses. */
export interface RaidPlanInteraction {
  readonly user: { readonly id: string };
  readonly options: {
    getSubcommand(): string;
    getString(name: string): string | null;
  };
  memberRoles(): readonly EventRole[];
  reply(options: InteractionReplyOptions): Promise<unknown>;
  deferReply(options: { readonly flags: MessageFlags.Ephemeral }): Promise<unknown>;
  editReply(options: InteractionEditReplyOptions): Promise<unknown>;
}

/** An autocomplete request of /raid-plan: the focused option and what is typed so far. */
export interface RaidPlanAutocomplete {
  readonly options: { getFocused(full: true): { readonly name: string; readonly value: string } };
  respond(choices: ApplicationCommandOptionChoiceData<string>[]): Promise<unknown>;
}

/** A press of the confirmation card's button. */
export interface RaidConfirmPress {
  readonly customId: string;
  readonly user: { readonly id: string };
  memberRoles(): readonly EventRole[];
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

export interface RaidPlanningDeps {
  readonly raids: Pick<
    RaidStore,
    "find" | "save" | "savePlanCard" | "saveConfirmationCard" | "confirmations" | "addConfirmation"
  >;
  readonly links: Pick<LinkStore, "linkFor">;
  readonly server: RaidServer;
  readonly settings: RaidSettings;
  readonly now: () => Date;
  readonly logError: (line: string) => void;
}

export interface RaidPlanning {
  onCommand(interaction: RaidPlanInteraction): Promise<void>;
  onAutocomplete(interaction: RaidPlanAutocomplete): Promise<void>;
  onConfirm(press: RaidConfirmPress): Promise<void>;
}

/** Discord shows at most 25 autocomplete choices. */
const MAX_CHOICES = 25;

/** The changes of the plan, by subcommand: each reads its options and gives the changed Raid or a refusal. */
type Change = (raid: Raid, option: (name: string) => string, optional: (name: string) => string | undefined, tags: readonly string[]) => RaidResult;

const CHANGES: Record<string, Change> = {
  "objective-add": (raid, option) => addObjective(raid, option("name")),
  "objective-remove": (raid, option) => removeObjective(raid, option("objective")),
  "phase-add": (raid, option) => addPhase(raid, option("name"), option("time")),
  "phase-remove": (raid, option) => removePhase(raid, option("phase")),
  assign: (raid, option, optional, tags) =>
    assign(raid, { tag: option("alliance"), objective: option("objective"), phase: optional("phase"), task: optional("task") }, tags),
  unassign: (raid, option, optional, tags) =>
    unassign(raid, { tag: option("alliance"), objective: option("objective"), phase: optional("phase") }, tags),
  notes: (raid, _option, optional) => setNotes(raid, optional("text") ?? ""),
};

/** What a change is logged as, by subcommand. */
const CHANGE_NAMES: Record<string, string> = {
  "objective-add": "added an Objective",
  "objective-remove": "removed an Objective",
  "phase-add": "added a Phase",
  "phase-remove": "removed a Phase",
  assign: "added an Assignment",
  unassign: "removed an Assignment",
  notes: "set the notes",
};

/**
 * The Raid planning: /raid-plan for the War Council, its autocomplete, and the confirmation card's button. Every answer
 * is private. A failure is logged and answered as unavailable; nothing here throws.
 */
export function createRaidPlanning(deps: RaidPlanningDeps): RaidPlanning {
  const { raids, server, settings } = deps;

  function current(startMinutes: number): StoredRaid {
    const { id, start } = currentRaidOf(deps.now(), startMinutes);
    return raids.find(id) ?? { raid: newRaid(id, start), planCard: undefined, confirmationCard: undefined };
  }

  function confirmationDeadline(raid: Raid): Date {
    return confirmationDeadlineOf(raid, settings.confirmationHours);
  }

  function preview(raid: Raid, note: string): InteractionEditReplyOptions {
    const status = stateLine(raid, planDeadlineOf(raid, settings.planHours), confirmationDeadline(raid));
    return { content: `${note}\n${status}`, embeds: [planCard(raid)], allowedMentions: { parse: [] } };
  }

  function confirmationEmbed(raid: Raid): APIEmbed {
    return confirmationCard(raid, raids.confirmations(raid.id), server.allianceTags(), confirmationDeadline(raid));
  }

  /** Edits both posted cards to the Raid; a card that is gone is posted again, without mentions, and logged. */
  async function refreshCards(stored: StoredRaid, raid: Raid): Promise<string | undefined> {
    const plan = { embeds: [planCard(raid)], components: [] };
    const planMissing = await refreshCard(stored.planCard, PLAN_CHANNEL, plan, (card) => {
      raids.savePlanCard(raid.id, card);
    });
    return planMissing ?? (await refreshConfirmationCard(stored, raid));
  }

  async function refreshConfirmationCard(stored: StoredRaid, raid: Raid): Promise<string | undefined> {
    const confirmation = { embeds: [confirmationEmbed(raid)], components: [confirmRow(raid)] };
    return refreshCard(stored.confirmationCard, LEADERS_CHANNEL, confirmation, (card) => {
      raids.saveConfirmationCard(raid.id, card);
    });
  }

  async function refreshCard(
    card: StoredRaid["planCard"],
    channelName: string,
    edit: Parameters<RaidServer["edit"]>[1],
    keep: (card: { readonly channelId: string; readonly messageId: string }) => void,
  ): Promise<string | undefined> {
    if (card !== undefined && (await server.edit(card, edit))) return undefined;
    const channelId = server.channelIdNamed(channelName);
    if (channelId === undefined) {
      await server.log(`The Battle Plan card for #${channelName} was not posted: the server has no #${channelName}.`);
      return channelName;
    }
    keep(await server.post(channelId, { ...edit, allowedMentions: { parse: [] } }));
    if (card !== undefined) await server.log(`The Battle Plan card in #${channelName} was gone; Neil has posted it again.`);
    return undefined;
  }

  async function firstPublish(caller: string, raid: Raid): Promise<string> {
    const planChannel = server.channelIdNamed(PLAN_CHANNEL);
    const leadersChannel = server.channelIdNamed(LEADERS_CHANNEL);
    if (planChannel === undefined || leadersChannel === undefined) {
      const name = planChannel === undefined ? PLAN_CHANNEL : LEADERS_CHANNEL;
      await server.log(`<@${caller}> tried to publish the Battle Plan, but the server has no #${name}; nothing was posted.`);
      return raidMessages.missingChannel(name);
    }
    const posted = await server.post(planChannel, { embeds: [planCard(raid)], allowedMentions: { parse: [] } });
    raids.save(raid);
    raids.savePlanCard(raid.id, posted);
    const leaders = leadersOf(await server.members(), server.allianceTags());
    const [head, ...rest] = textWithMentions(raidMessages.confirmationAsk(raid.start), leaders, [confirmationEmbed(raid)]);
    if (head !== undefined) {
      raids.saveConfirmationCard(raid.id, await server.post(leadersChannel, { ...head, components: [confirmRow(raid)] }));
    }
    for (const message of rest) await server.post(leadersChannel, message);
    await server.log(`<@${caller}> published the Battle Plan for the Raid of ${raid.id}; ${leaders.length.toString()} R5s and R4s were asked.`);
    return raidMessages.published;
  }

  async function onPublish(caller: string, stored: StoredRaid): Promise<InteractionEditReplyOptions> {
    const result = publish(stored.raid, deps.now());
    if (!result.ok) return preview(stored.raid, refusalText(result.refusal));
    if (stored.raid.state.kind === "draft") return preview(result.raid, await firstPublish(caller, result.raid));
    raids.save(result.raid);
    const missing = await refreshCards(stored, result.raid);
    await server.log(`<@${caller}> amended the published Battle Plan for the Raid of ${result.raid.id}.`);
    return preview(result.raid, missing === undefined ? raidMessages.amended : raidMessages.missingChannel(missing));
  }

  async function onCancel(caller: string, stored: StoredRaid): Promise<InteractionEditReplyOptions> {
    const result = cancel(stored.raid, deps.now());
    if (!result.ok) return preview(stored.raid, refusalText(result.refusal));
    raids.save(result.raid);
    await server.log(`<@${caller}> cancelled the Raid of ${result.raid.id}.`);
    if (stored.raid.state.kind === "published") {
      await refreshCards(stored, result.raid);
      const leadersChannel = server.channelIdNamed(LEADERS_CHANNEL);
      if (leadersChannel === undefined) await server.log(`The cancel was not posted: the server has no #${LEADERS_CHANNEL}.`);
      else await server.post(leadersChannel, { content: raidMessages.cancelledLine(result.raid.start), allowedMentions: { parse: [] } });
    }
    return preview(result.raid, raidMessages.cancelled);
  }

  async function onChange(interaction: RaidPlanInteraction, subcommand: string, stored: StoredRaid): Promise<InteractionEditReplyOptions> {
    const change = CHANGES[subcommand];
    if (change === undefined) throw new Error(`unknown /raid-plan subcommand ${subcommand}`);
    const option = (name: string): string => interaction.options.getString(name) ?? "";
    const optional = (name: string): string | undefined => interaction.options.getString(name) ?? undefined;
    const result = change(stored.raid, option, optional, server.allianceTags());
    if (!result.ok) return preview(stored.raid, refusalText(result.refusal));
    if (!fitsDiscord(planCard(result.raid))) return preview(stored.raid, raidMessages.tooLong);
    raids.save(result.raid);
    await server.log(`<@${interaction.user.id}> ${CHANGE_NAMES[subcommand] ?? subcommand} of the Battle Plan for the Raid of ${result.raid.id}.`);
    const note = result.raid.state.kind === "published" ? "Saved. Publish again to update the posted cards." : "Saved.";
    return preview(result.raid, note);
  }

  async function answerCommand(interaction: RaidPlanInteraction, startMinutes: number): Promise<InteractionEditReplyOptions> {
    const stored = current(startMinutes);
    const subcommand = interaction.options.getSubcommand();
    const caller = interaction.user.id;
    if (subcommand === "show") return preview(stored.raid, "The Battle Plan of this week's Raid:");
    if (subcommand === "publish") return onPublish(caller, stored);
    if (subcommand === "cancel") return onCancel(caller, stored);
    return onChange(interaction, subcommand, stored);
  }

  async function replyPrivately(interaction: { reply(options: InteractionReplyOptions): Promise<unknown> }, content: string): Promise<void> {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  }

  return {
    async onCommand(interaction) {
      try {
        const { warCouncilRoleId, startMinutes } = settings;
        if (warCouncilRoleId === undefined || startMinutes === undefined) {
          await replyPrivately(interaction, raidMessages.notSetUp);
          return;
        }
        if (!interaction.memberRoles().some((role) => role.id === warCouncilRoleId)) {
          await replyPrivately(interaction, raidMessages.notWarCouncil);
          return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        let answer: InteractionEditReplyOptions;
        try {
          answer = await answerCommand(interaction, startMinutes);
        } catch (error) {
          deps.logError(`/raid-plan failed: ${errorMessage(error)}`);
          await server.log(`/raid-plan ${interaction.options.getSubcommand()} by <@${interaction.user.id}> failed: ${errorMessage(error)}`).catch(() => undefined);
          answer = { content: raidMessages.unavailable, embeds: [] };
        }
        await interaction.editReply(answer);
      } catch (error) {
        deps.logError(`Answering /raid-plan failed: ${errorMessage(error)}`);
      }
    },

    async onAutocomplete(interaction) {
      try {
        const focused = interaction.options.getFocused(true);
        const typed = focused.value.trim().toLowerCase();
        let names: readonly string[] = [];
        if (settings.startMinutes !== undefined) {
          const { raid } = current(settings.startMinutes);
          if (focused.name === "objective") names = objectivesOf(raid.plan);
          if (focused.name === "phase") names = raid.plan.phases.map((phase) => phase.name);
        } else if (focused.name === "objective") names = FIXED_OBJECTIVES;
        if (focused.name === "alliance") names = server.allianceTags();
        const choices = names
          .filter((name) => name.toLowerCase().includes(typed))
          .slice(0, MAX_CHOICES)
          .map((name) => ({ name, value: name }));
        await interaction.respond(choices);
      } catch (error) {
        deps.logError(`Answering /raid-plan autocomplete failed: ${errorMessage(error)}`);
      }
    },

    async onConfirm(press) {
      try {
        const raidId = raidIdOfButton(press.customId);
        const stored = raidId === undefined ? undefined : raids.find(raidId);
        if (settings.warCouncilRoleId === undefined || stored === undefined) {
          await replyPrivately(press, raidMessages.notSetUp);
          return;
        }
        const { raid } = stored;
        const tag = ledAllianceOf(press.memberRoles(), deps.links.linkFor(press.user.id)?.allianceRank);
        const confirmations = raids.confirmations(raid.id);
        const confirmation = { tag: tag ?? "", memberId: press.user.id, at: deps.now() };
        const check = confirmPlan(raid, confirmations, confirmation);
        if (!check.ok && check.refusal.kind !== "already-confirmed") {
          await replyPrivately(press, confirmRefusalText(check.refusal));
          return;
        }
        if (tag === undefined) {
          await replyPrivately(press, raidMessages.notLeader);
          return;
        }
        if (!check.ok || !raids.addConfirmation(raid.id, confirmation)) {
          const earlier = raids.confirmations(raid.id).find((existing) => existing.tag === tag);
          await replyPrivately(
            press,
            earlier === undefined ? raidMessages.unavailable : confirmRefusalText({ kind: "already-confirmed", confirmation: earlier }),
          );
          return;
        }
        await replyPrivately(press, raidMessages.confirmed(tag));
        await server.log(`<@${press.user.id}> confirmed the Battle Plan for [${tag}] (Raid of ${raid.id}).`);
        await refreshConfirmationCard(stored, raid);
      } catch (error) {
        deps.logError(`The Plan Confirmation failed: ${errorMessage(error)}`);
      }
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
