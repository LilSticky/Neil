import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type APIEmbed,
  type BaseMessageOptions,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type InteractionUpdateOptions,
} from "discord.js";
import {
  isBootyCallCoolingDown,
  isBootyMatch,
  isBootyOnline,
  isConfirmationExpired,
  type GamePresence,
} from "../domain/booty.js";
import type { PresenceStatus } from "../domain/interview-start.js";
import type { Uid } from "../domain/lookup-input.js";
import { tagOfAllianceRole } from "../domain/managed-roles.js";
import type { LookupResult, Player, RosterPresence } from "../domain/player.js";
import type { RequestPurpose } from "../domain/daily-quota.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { BootyAlertsStore, StoredBootyAlerts } from "../storage/booty-alerts-store.js";
import type { LinkStore } from "../storage/link-store.js";
import { localMinuteOf } from "./booty-time.js";
import { bootyCallMessages } from "./booty-texts.js";
import { CARD_COLOR, escapeText } from "./lookup-cards.js";

/** The channel a Booty Call is made in, by its name and the name of its category (an Alliance's role name). */
export interface BootyChannel {
  readonly id: string;
  readonly name: string;
  readonly categoryName: string | undefined;
}

/** The part of the Discord server a Booty Call uses: role holders, presence, posts to a channel, and #neil-log. */
export interface BootyCallServer {
  holdersOf(roleName: string): Promise<readonly MemberId[]>;
  presenceOf(memberId: MemberId): Promise<PresenceStatus | undefined>;
  /** Posts the message and resolves to the link Discord gives it. */
  post(channelId: string, message: BaseMessageOptions): Promise<string>;
  log(line: string): Promise<void>;
}

/** The part of a discord.js interaction a Booty Call uses: who ran it, where, and the private reply. */
interface BootyCallInteraction {
  readonly user: { readonly id: string; readonly displayName: string };
  readonly channel: BootyChannel | undefined;
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

/** The /booty command, as a Booty Call receives it. */
export type BootyCallCommand = BootyCallInteraction;

/** A press of a Booty Call button, as a Booty Call receives it: the custom id names the button, and the press is updated or edited. */
export interface BootyCallButton extends BootyCallInteraction {
  readonly customId: string;
  update(options: InteractionUpdateOptions): Promise<unknown>;
  editReply(options: InteractionEditReplyOptions): Promise<unknown>;
}

export interface BootyCallDeps {
  readonly links: Pick<LinkStore, "linkFor" | "memberForUid">;
  readonly bootyAlerts: Pick<BootyAlertsStore, "get">;
  /** The uncharged Player lookup: the Alliance roster comes with the caller's Player. */
  readonly game: { getPlayer(uid: Uid, purpose: RequestPurpose): Promise<LookupResult<Player>> };
  readonly server: BootyCallServer;
  readonly now: () => Date;
  readonly logError: (line: string) => void;
}

export interface BootyCalls {
  onCommand(interaction: BootyCallCommand): Promise<void>;
  onButton(interaction: BootyCallButton): Promise<void>;
}

/** The Discord limit on mentioned users per message is 100; 80 keeps each message under that and under 2,000 characters. */
const MENTIONS_PER_MESSAGE = 80;
const ALLIANCE_CHAT = "alliance-chat";
const CONFIRM_ID = /^booty:confirm:(\d+):(\d+)$/;
const CANCEL_ID = /^booty:cancel:(\d+)$/;

/** The last Booty Call of an Alliance: when it was made, and the card's link once it is posted. */
interface Cooldown {
  readonly calledAtMs: number;
  link: string | undefined;
}

/** A Booty Call a Member pressed Confirm on: the Alliance it is for, and the channel the card goes to. */
interface Alliance {
  readonly roleName: string;
  readonly channelId: string;
}

type ButtonAction =
  | { readonly kind: "confirm"; readonly memberId: MemberId; readonly issuedAtMs: number }
  | { readonly kind: "cancel"; readonly memberId: MemberId };

/** Who may be alerted, as the Game gave it: a roster of the Alliance, or none, when the Game could not answer. */
type Reach = { readonly roster: readonly RosterPresence[] } | undefined;

/**
 * Creates the /booty command and its buttons. A Booty Call asks for a private Confirm, then posts one card to the
 * Alliance's alliance-chat that mentions the Members whose Booty Alerts match. The cooldown per Alliance is claimed
 * before the first await of a Confirm, and released if the card does not post. Replies and updates that fail are logged,
 * never thrown.
 */
export function createBootyCalls(deps: BootyCallDeps): BootyCalls {
  const cooldowns = new Map<string, Cooldown>();

  function activeCooldown(roleName: string, nowMs: number): Cooldown | undefined {
    const cooldown = cooldowns.get(roleName);
    if (cooldown === undefined || !isBootyCallCoolingDown(cooldown.calledAtMs, nowMs)) return undefined;
    return cooldown;
  }

  async function answer(what: string, action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      deps.logError(`${what} failed: ${errorMessage(error)}`);
    }
  }

  function refuse(interaction: BootyCallInteraction, content: string): Promise<void> {
    return answer("Replying to /booty", () => interaction.reply({ content, flags: MessageFlags.Ephemeral }));
  }

  async function onCommand(interaction: BootyCallCommand): Promise<void> {
    const alliance = allianceOf(interaction.channel);
    if (alliance === undefined) return refuse(interaction, bootyCallMessages.wrongChannel);
    const memberId = interaction.user.id;
    if (deps.links.linkFor(memberId) === undefined) return refuse(interaction, bootyCallMessages.notLinked);

    const holders = await holdersOf(alliance.roleName);
    if (holders === undefined) return refuse(interaction, bootyCallMessages.unavailable);
    if (!holders.includes(memberId)) return refuse(interaction, bootyCallMessages.notInAlliance);

    const nowMs = deps.now().getTime();
    const cooling = activeCooldown(alliance.roleName, nowMs);
    if (cooling !== undefined) {
      return refuse(interaction, bootyCallMessages.coolingDown(alliance.roleName, cooling.link));
    }
    const confirmId = `booty:confirm:${memberId}:${nowMs.toString()}`;
    const cancelId = `booty:cancel:${memberId}`;
    await answer("Replying to /booty", () =>
      interaction.reply({
        content: bootyCallMessages.confirmation(alliance.roleName),
        components: [confirmRow(confirmId, cancelId)],
        flags: MessageFlags.Ephemeral,
      }),
    );
    return undefined;
  }

  async function onButton(interaction: BootyCallButton): Promise<void> {
    const action = parseButton(interaction.customId);
    if (action === undefined) return refuse(interaction, bootyCallMessages.unknownButton);
    if (action.memberId !== interaction.user.id) return refuse(interaction, bootyCallMessages.notYours);
    if (action.kind === "cancel") {
      return answer("Updating the Booty Call", () =>
        interaction.update({ content: bootyCallMessages.cancelled, components: [] }),
      );
    }

    const nowMs = deps.now().getTime();
    if (isConfirmationExpired(action.issuedAtMs, nowMs)) return refuse(interaction, bootyCallMessages.expired);
    const alliance = allianceOf(interaction.channel);
    if (alliance === undefined) return refuse(interaction, bootyCallMessages.wrongChannel);
    const link = deps.links.linkFor(action.memberId);
    if (link === undefined) return refuse(interaction, bootyCallMessages.notLinked);
    const cooling = activeCooldown(alliance.roleName, nowMs);
    if (cooling !== undefined) {
      return refuse(interaction, bootyCallMessages.coolingDown(alliance.roleName, cooling.link));
    }

    // Claimed before the first await, so a second Confirm in the same moment finds the cooldown and posts nothing.
    const claim: Cooldown = { calledAtMs: nowMs, link: undefined };
    cooldowns.set(alliance.roleName, claim);
    await answer("Updating the Booty Call", () =>
      interaction.update({ content: bootyCallMessages.calling, components: [] }),
    );
    await callTheAlliance(interaction, alliance, claim, link.uid);
    return undefined;
  }

  /** Runs after the Confirm is acknowledged: the caller's holding is read now, and the Game API is asked only once it holds. */
  async function callTheAlliance(
    interaction: BootyCallButton,
    alliance: Alliance,
    claim: Cooldown,
    callerUid: Uid,
  ): Promise<void> {
    const callerId = interaction.user.id;
    const holders = await holdersOf(alliance.roleName);
    if (holders === undefined || !holders.includes(callerId)) {
      release(alliance.roleName, claim);
      const content = holders === undefined ? bootyCallMessages.unavailable : bootyCallMessages.notInAlliance;
      return answer("Editing the Booty Call reply", () => interaction.editReply({ content }));
    }
    const reach = await rosterOf(callerUid);
    const mentioned = await alertedMembers(callerId, holders, reach);
    const [first = [], ...rest] = chunksOf(mentioned, MENTIONS_PER_MESSAGE);

    let link: string;
    try {
      link = await deps.server.post(alliance.channelId, cardMessage(interaction.user.displayName, alliance.roleName, first));
    } catch (error) {
      release(alliance.roleName, claim);
      deps.logError(`Posting the Booty Call failed: ${errorMessage(error)}`);
      return answer("Editing the Booty Call reply", () => interaction.editReply({ content: bootyCallMessages.postFailed }));
    }
    claim.link = link;

    for (const ids of rest) {
      try {
        await deps.server.post(alliance.channelId, mentionsMessage(ids));
      } catch (error) {
        deps.logError(`Posting mentions of a Booty Call failed: ${errorMessage(error)}`);
      }
    }
    try {
      await deps.server.log(bootyCallMessages.logLine(callerId, alliance.roleName, mentioned.length, reach !== undefined));
    } catch (error) {
      deps.logError(`Logging a Booty Call failed: ${errorMessage(error)}`);
    }
    return answer("Editing the Booty Call reply", () => interaction.editReply({ content: bootyCallMessages.posted(link) }));
  }

  function release(roleName: string, claim: Cooldown): void {
    if (cooldowns.get(roleName) === claim) cooldowns.delete(roleName);
  }

  /** The Members to mention: the roster matched to Links, or the Alliance role's holders when the Game gave no roster. */
  async function alertedMembers(callerId: MemberId, holders: readonly MemberId[], reach: Reach): Promise<MemberId[]> {
    const candidates: { readonly memberId: MemberId; readonly game: GamePresence | undefined }[] =
      reach === undefined
        ? holders.map((memberId) => ({ memberId, game: undefined }))
        : reach.roster.flatMap((row) => {
            const memberId = deps.links.memberForUid(row.uid);
            return memberId === undefined ? [] : [{ memberId, game: row }];
          });
    const matched: MemberId[] = [];
    for (const { memberId, game } of candidates) {
      if (memberId !== callerId && (await matches(memberId, game))) matched.push(memberId);
    }
    return matched;
  }

  /** Whether a Member's Booty Alerts match now. A Member whose Booty Alerts do not read, or whose time zone is unknown, is skipped. */
  async function matches(memberId: MemberId, game: GamePresence | undefined): Promise<boolean> {
    let alerts: StoredBootyAlerts | undefined;
    try {
      alerts = deps.bootyAlerts.get(memberId);
    } catch (error) {
      deps.logError(`Booty Alerts of ${memberId} were skipped: ${errorMessage(error)}`);
      return false;
    }
    if (alerts === undefined || alerts.mode === "off") return false;
    const localMinute = localMinuteOf(deps.now(), alerts.timeZone);
    if (localMinute === undefined) {
      deps.logError(`Booty Alerts of ${memberId} were skipped: the time zone ${alerts.timeZone} is not known`);
      return false;
    }
    const online = isBootyOnline(game, await discordOnline(memberId));
    return isBootyMatch(alerts, { online, localMinute });
  }

  async function discordOnline(memberId: MemberId): Promise<boolean> {
    try {
      const status = await deps.server.presenceOf(memberId);
      return status !== undefined && status !== "offline";
    } catch (error) {
      deps.logError(`Reading the presence of ${memberId} failed: ${errorMessage(error)}`);
      return false;
    }
  }

  /** The Alliance role's holders, or undefined when Discord could not say who holds it. */
  async function holdersOf(roleName: string): Promise<readonly MemberId[] | undefined> {
    try {
      return await deps.server.holdersOf(roleName);
    } catch (error) {
      deps.logError(`Reading the holders of ${roleName} failed: ${errorMessage(error)}`);
      return undefined;
    }
  }

  /** The Alliance roster from the caller's Player lookup; undefined when the Game gave none (a refusal, a failure, no roster or an empty one). */
  async function rosterOf(callerUid: Uid): Promise<Reach> {
    try {
      const result = await deps.game.getPlayer(callerUid, "lookup");
      if (result.kind !== "found") return undefined;
      const roster = result.value.roster;
      return roster === undefined || roster.length === 0 ? undefined : { roster };
    } catch (error) {
      deps.logError(`The Game API lookup for the Booty Call failed: ${errorMessage(error)}`);
      return undefined;
    }
  }

  return { onCommand, onButton };
}

function allianceOf(channel: BootyChannel | undefined): Alliance | undefined {
  if (channel === undefined || channel.name !== ALLIANCE_CHAT || channel.categoryName === undefined) return undefined;
  if (tagOfAllianceRole(channel.categoryName) === undefined) return undefined;
  return { roleName: channel.categoryName, channelId: channel.id };
}

/** Reads the custom id of a Booty Call button; any other id reads as undefined. */
function parseButton(customId: string): ButtonAction | undefined {
  const confirm = CONFIRM_ID.exec(customId);
  if (confirm !== null) {
    const [, memberId, issued] = confirm;
    const issuedAtMs = Number(issued);
    if (memberId === undefined || !Number.isSafeInteger(issuedAtMs)) return undefined;
    return { kind: "confirm", memberId, issuedAtMs };
  }
  const cancel = CANCEL_ID.exec(customId);
  const memberId = cancel?.[1];
  return memberId === undefined ? undefined : { kind: "cancel", memberId };
}

function confirmRow(confirmId: string, cancelId: string): APIActionRowComponent<APIButtonComponentWithCustomId> {
  return {
    type: ComponentType.ActionRow,
    components: [
      { type: ComponentType.Button, style: ButtonStyle.Danger, label: "Confirm", custom_id: confirmId },
      { type: ComponentType.Button, style: ButtonStyle.Secondary, label: "Cancel", custom_id: cancelId },
    ],
  };
}

/** The card: the caller's line and the first mentions in the content, the card's embed, and allowedMentions exactly those Members. */
function cardMessage(callerName: string, roleName: string, mentioned: readonly MemberId[]): BaseMessageOptions {
  const embed: APIEmbed = {
    color: CARD_COLOR,
    title: bootyCallMessages.card.title,
    description: bootyCallMessages.card.description,
  };
  const line = bootyCallMessages.callLine(escapeText(callerName), escapeText(roleName));
  const content = mentioned.length === 0 ? line : `${line} ${mentionText(mentioned)}`;
  return { content, embeds: [embed], allowedMentions: { parse: [], users: [...mentioned] } };
}

/** A follow-up message of mentions only, for the Members beyond the first chunk. */
function mentionsMessage(mentioned: readonly MemberId[]): BaseMessageOptions {
  return { content: mentionText(mentioned), allowedMentions: { parse: [], users: [...mentioned] } };
}

function mentionText(mentioned: readonly MemberId[]): string {
  return mentioned.map((memberId) => `<@${memberId}>`).join(" ");
}

function chunksOf<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
