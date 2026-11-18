import { ButtonStyle, ChannelType, ComponentType, type BaseMessageOptions, type Guild } from "discord.js";
import { dueReminders, type SentReminder } from "../domain/events.js";
import { allianceRoleName } from "../domain/managed-roles.js";
import type { MemberId } from "../domain/rank-approval.js";
import {
  shieldDeadlineOf,
  shieldKindOf,
  shieldLeadMinutesOf,
  shieldStandingOf,
  shieldWeekOf,
  weekStartOf,
  type ShieldStanding,
  type ShieldWeek,
} from "../domain/shield.js";
import type { EventStore } from "../storage/event-store.js";
import type { LinkStore } from "../storage/link-store.js";
import type { ShieldStore } from "../storage/shield-store.js";
import { textWithMentions } from "./mentions.js";
import { allianceMembersOf, raidServerOf, type RaidMember } from "./raid-server.js";
import { shieldButtonId } from "./shield.js";
import { ALLIANCE_CHAT_CHANNEL, ALLIANCE_LEADERS_CHANNEL, packLines, shieldMessages } from "./shield-texts.js";

/** The Discord server as the Shield Reminders use it. */
export interface ShieldServer {
  /** Every Member, read over REST page by page. */
  members(): Promise<readonly RaidMember[]>;
  /** The tags of the server's `[TAG]` Alliance roles: the Home Kingdom Alliances. */
  allianceTags(): readonly string[];
  /** A text channel of an Alliance's area, by name. */
  allianceChannelId(tag: string, name: string): string | undefined;
  post(channelId: string, message: BaseMessageOptions): Promise<unknown>;
  /** A line in #neil-log, with mentions off. */
  log(line: string): Promise<void>;
}

export interface ShieldRemindersDeps {
  readonly shield: Pick<
    ShieldStore,
    "markOf" | "sentLeads" | "recordSent" | "confirmed" | "remindersOff" | "deleteConfirmationsBefore"
  >;
  /** The kingdom's Event Kinds, for the lead times of the Shield kind. */
  readonly events: Pick<EventStore, "listKinds">;
  readonly links: Pick<LinkStore, "linkFor">;
  readonly server: ShieldServer;
  readonly now: () => Date;
  readonly logError: (line: string) => void;
}

export interface ShieldReminders {
  /** Sends the Shield Reminder and the Shield Lists that are due, each lead time at most once. Nothing here throws. */
  tick(): Promise<void>;
}

const KINGDOM = "kingdom";

/**
 * The Shield Reminders (slice 045), on the one-minute tick: in a KvK Week, at each lead time before the Shield Deadline,
 * a reminder in every Alliance's alliance-chat mentioning its Linked Members who have not confirmed and have not switched
 * the reminders off, and a Shield List in its alliance-leaders. Lead times missed collapse into one sent now. Each lead
 * time is recorded before anything is posted, so a failed post is logged once and never sent twice. Confirmations of
 * weeks whose deadline has passed are deleted.
 */
export function createShieldReminders(deps: ShieldRemindersDeps): ShieldReminders {
  const { shield, server } = deps;

  // A line that cannot reach #neil-log is only kept in the error log, so the other Alliances still get theirs.
  async function log(line: string): Promise<void> {
    try {
      await server.log(line);
    } catch (error) {
      deps.logError(`Logging a Shield Reminder line failed: ${errorMessage(error)}`);
    }
  }

  async function postTo(tag: string, channel: string, what: string, messages: readonly BaseMessageOptions[]): Promise<void> {
    const channelId = server.allianceChannelId(tag, channel);
    if (channelId === undefined) {
      await log(shieldMessages.log.noChannel(tag, channel, what));
      return;
    }
    try {
      for (const message of messages) await server.post(channelId, message);
    } catch (error) {
      const line = shieldMessages.log.failed(tag, what, errorMessage(error));
      deps.logError(line);
      await log(line);
    }
  }

  function reminderMessages(week: ShieldWeek, tag: string, deadline: Date, mentioned: readonly MemberId[]): BaseMessageOptions[] {
    const [first, ...rest] = textWithMentions(shieldMessages.reminder(tag, deadline), mentioned);
    if (first === undefined) return [];
    const button: BaseMessageOptions = {
      ...first,
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            { type: ComponentType.Button, style: ButtonStyle.Success, label: shieldMessages.buttonLabel, custom_id: shieldButtonId(week) },
          ],
        },
      ],
    };
    return [button, ...rest];
  }

  function listMessages(tag: string, deadline: Date, standing: ShieldStanding): BaseMessageOptions[] {
    return packLines(shieldMessages.list(tag, deadline, standing)).map((content) => ({
      content,
      allowedMentions: { parse: [], users: [] },
    }));
  }

  async function remind(week: ShieldWeek, deadline: Date, leadMinutes: number): Promise<void> {
    const members = await server.members();
    const confirmed = shield.confirmed(week);
    const off = shield.remindersOff();
    const tags = server.allianceTags();
    let mentioned = 0;
    for (const tag of tags) {
      const linked = allianceMembersOf(members, tag).filter((memberId) => deps.links.linkFor(memberId) !== undefined);
      const standing = shieldStandingOf(linked, confirmed, off);
      if (standing.toRemind.length > 0) {
        mentioned += standing.toRemind.length;
        await postTo(tag, ALLIANCE_CHAT_CHANNEL, "Shield Reminder", reminderMessages(week, tag, deadline, standing.toRemind));
      }
      await postTo(tag, ALLIANCE_LEADERS_CHANNEL, "Shield List", listMessages(tag, deadline, standing));
    }
    await log(shieldMessages.log.round(week, leadMinutes, mentioned, tags.length));
  }

  async function run(): Promise<void> {
    const now = deps.now();
    const deadline = shieldDeadlineOf(now);
    const week = shieldWeekOf(deadline);
    // Once Friday's reset has passed, the Shield Confirmations of that week are no longer needed (ADR 27).
    shield.deleteConfirmationsBefore(week);
    if (shield.markOf(week) === undefined) return;
    const leads = shieldLeadMinutesOf(deps.events.listKinds(KINGDOM));
    const sent = shield.sentLeads(week).map((leadMinutes): SentReminder => ({ target: "start", leadMinutes }));
    const plan = dueReminders(deadline, "scheduled", shieldKindOf(leads), sent, weekStartOf(week), now);
    for (const skipped of plan.record) shield.recordSent(week, skipped.leadMinutes);
    for (const due of plan.send) {
      shield.recordSent(week, due.leadMinutes);
      await remind(week, deadline, due.leadMinutes);
    }
  }

  return {
    async tick() {
      try {
        await run();
      } catch (error) {
        const line = `The Shield Reminders failed: ${errorMessage(error)}`;
        deps.logError(line);
        await server.log(line).catch(() => undefined);
      }
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The Shield Reminders' view of the guild: the Raid's member listing, tags, posts and log, and the Alliance areas' channels. */
export function shieldServerOf(
  guild: Guild,
  options: { readonly log: (message: BaseMessageOptions) => Promise<void> },
): ShieldServer {
  const raidServer = raidServerOf(guild, options);
  return {
    members: () => raidServer.members(),
    allianceTags: () => raidServer.allianceTags(),
    allianceChannelId: (tag, name) =>
      [...guild.channels.cache.values()].find(
        (channel) =>
          channel.type === ChannelType.GuildText && channel.name === name && channel.parent?.name === allianceRoleName(tag),
      )?.id,
    post: (channelId, message) => raidServer.post(channelId, message),
    log: (line) => raidServer.log(line),
  };
}
