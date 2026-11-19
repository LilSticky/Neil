import {
  ChannelType,
  Client,
  Events,
  type AutocompleteInteraction,
  type BaseMessageOptions,
  GatewayIntentBits,
  GuildMember,
  Partials,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type InteractionReplyOptions,
  type ModalSubmitInteraction,
  type Role,
  type StringSelectMenuInteraction,
  type User,
} from "discord.js";
import { z } from "zod";
import type { BuildInfo } from "../build-info.js";
import type { AllowanceKeeper, LookupCaller } from "../game-api/allowance-keeper.js";
import type { GameApiClient } from "../game-api/client.js";
import type { KingdomNumber } from "../domain/lookup-input.js";
import { cameOnline, type PresenceStatus } from "../domain/interview-start.js";
import type { StartRecord } from "../domain/start-record.js";
import type { AppliedStore } from "../storage/applied-store.js";
import type { BootyAlertsStore } from "../storage/booty-alerts-store.js";
import type { DailySyncStore } from "../storage/daily-sync-store.js";
import type { InterviewStore } from "../storage/interview-store.js";
import type { KnownAllianceStore } from "../storage/known-alliance-store.js";
import type { LinkStore } from "../storage/link-store.js";
import { editorOf } from "../storage/reaper-editor.js";
import type { ReaperStore } from "../storage/reaper-store.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { PreferenceStore } from "../storage/preference-store.js";
import type { EventStore } from "../storage/event-store.js";
import type { CityRotationStore } from "../storage/city-rotation-store.js";
import type { KingMoveStore } from "../storage/king-move-store.js";
import type { HandoverStore } from "../storage/handover-store.js";
import type { CityRotationMode } from "../domain/city-rotation.js";
import { napStatusOf } from "../domain/nap.js";
import { DUEL_PLAN } from "../duel-plan.js";
import { handleAllianceAutocomplete } from "./alliance-autocomplete.js";
import { createDuelPlanPoster } from "./duel-plan.js";
import { createHandoverReminders } from "./handover-reminders.js";
import { createCityRotation, type CityRotation, type RotationButton, type RotationCommand } from "./city-rotation.js";
import { cityRotationServerOf } from "./city-rotation-server.js";
import { cityRotationMessages, ROTATION_CONFIRM_PREFIX } from "./city-rotation-texts.js";
import { createKingMoves, type KingMoveButton, type KingMoves } from "./king-move.js";
import { kingMoveServerOf } from "./king-move-server.js";
import { KING_MOVE_PREFIX } from "./king-move-texts.js";
import type { NapStore } from "../storage/nap-store.js";
import { createNap, type Nap, type NapButton, type NapCommand } from "./nap.js";
import { NAP_APPROVE_PREFIX, NAP_DECLINE_PREFIX, napMessages } from "./nap-texts.js";
import type { NapMotionStore } from "../storage/nap-motion-store.js";
import { createNapMotions, type NapMotionButton, type NapMotionCommand, type NapMotions } from "./nap-motions.js";
import { NAP_MOTION_APPROVE_PREFIX, NAP_MOTION_DECLINE_PREFIX } from "./nap-motion-texts.js";
import type { NapRulesStore } from "../storage/nap-rules-store.js";
import { createNapRules, type NapRules, type NapRulesCommand, type NapRulesModal } from "./nap-rules.js";
import type { NapReportStore } from "../storage/nap-report-store.js";
import { createNapReports, type NapReportCommand, type NapReports } from "./nap-reports.js";
import { NAP_RULES_PREFIX } from "./nap-rules-texts.js";
import { createEventReminders, REMINDER_TICK_MS, type EventReminders } from "./event-reminders.js";
import { eventServerOf } from "./event-server.js";
import { handleEventInvitations, type EventInvitationsInteraction } from "./event-invitations.js";
import { handleEventKinds, type EventKindsInteraction } from "./event-kinds.js";
import type { RaidStore } from "../storage/raid-store.js";
import type { AvailabilityStore } from "../storage/availability-store.js";
import type { FighterClassThresholds } from "../domain/availability.js";
import { createAvailabilityBoard } from "./availability-board.js";
import { createAvailabilityClock, type AvailabilityClock } from "./availability-clock.js";
import { createAvailabilityPoll, type AvailabilityPoll, type AvailabilityPress } from "./availability-poll.js";
import { AVAILABILITY_PREFIX } from "./availability-texts.js";
import { createRaidClock, type RaidClock } from "./raid-clock.js";
import {
  createRaidPlanning,
  type RaidConfirmPress,
  type RaidPlanAutocomplete,
  type RaidPlanInteraction,
  type RaidPlanning,
  type RaidSettings,
} from "./raid-plan.js";
import { raidServerOf } from "./raid-server.js";
import { RAID_PREFIX } from "./raid-texts.js";
import type { ShieldStore } from "../storage/shield-store.js";
import {
  createShieldCommands,
  type KvkWeekInteraction,
  type ShieldCommands,
  type ShieldPress,
  type ShieldRemindersInteraction,
} from "./shield.js";
import { createShieldReminders, shieldServerOf } from "./shield-reminders.js";
import { SHIELD_PREFIX } from "./shield-texts.js";
import { createEventInvitations, eventIdOf, type EventInvitations } from "./events.js";
import {
  createBootyCalls,
  type BootyCalls,
  type BootyCallButton,
  type BootyCallCommand,
  type BootyCallServer,
  type BootyChannel,
} from "./booty-call.js";
import { handleBootyAlerts, type BootyAlertsInteraction } from "./booty.js";
import { handleTimeZoneAutocomplete } from "./booty-time.js";
import {
  createInterviews,
  type ButtonInteractionLike,
  type CommandLike,
  type Interviews,
  type JoinedMember,
  type LeftMember,
  type ModalInteractionLike,
  type StartupMember,
} from "./interview.js";
import { startDailySync } from "./daily-sync.js";
import { createSweeper, startSweeper } from "./interview-sweeper.js";
import {
  checkChannels,
  createOnboardingChannels,
  type ChannelProblem,
  type OnboardingChannels,
} from "./onboarding-channels.js";
import { createDoctorRole } from "./doctor-role.js";
import { listEveryMember } from "./member-listing.js";
import { createNameAndRoles, type ServerMembers } from "./name-and-roles.js";
import { createOnboardingRole } from "./onboarding-role.js";
import { createPreferenceRoles } from "./preferences.js";
import { createPreferencesAfterLink } from "./preferences-after-link.js";
import {
  createPreferenceChoices,
  type ChannelsCommand,
  type PreferenceChoices,
  type PreferencePress,
} from "./preferences-choices.js";
import { PREFERENCES_PREFIX } from "./preferences-texts.js";
import { reportRolePermissions } from "./role-permissions.js";
import type { RoleLike, RolesGuild, RolesMember } from "./member-roles.js";
import { createRankApprovals, type RankApprovals, type RankButtonLike } from "./rank-approval.js";
import { createUnlink } from "./unlink.js";
import {
  handleLink,
  handleLinkButton,
  handleRank,
  handleUnlink,
  PendingLinkConfirmations,
  type CorrectionInteraction,
  type LinkButtonInteraction,
  type LinkInteraction,
} from "./corrections.js";
import { handlePing, type PingInteraction } from "./ping.js";
import {
  answer,
  handleAlliance,
  handlePlayer,
  replyPrivately,
  type AllianceLookupContext,
  type LookupApi,
  type LookupInteraction,
  type NapStatusOf,
} from "./lookup.js";
import { handleOverview, handlePick, type PickContext, type PickInteraction } from "./pick.js";
import { handleLookAgain, type LookAgainContext, type LookAgainInteraction } from "./look-again.js";
import { PickSessions } from "./pick-sessions.js";
import { ReaperPages, type ReaperPageContent } from "./reaper-pages.js";
import {
  handleReaperAdd,
  handleReaperClosest,
  handleReaperList,
  handleReaperPage,
  type ReaperAddInteraction,
} from "./reaper.js";
import { handleReaperAutocomplete, handleReaperRemove } from "./reaper-remove.js";
import { reaperMessages } from "./reaper-texts.js";
import { handleQuota } from "./quota.js";
import { handleUsage, type UsageInteraction } from "./usage.js";
import { usageLine } from "./usage-texts.js";
import { commands } from "./commands.js";
import { handleHelp } from "./help.js";

/** The Game API client as connect uses it: the lookups and the Daily Quota figures. */
export type GameApi = LookupApi & Pick<GameApiClient, "quotaToday">;

/** The part of a discord.js chat-input interaction that /quota uses: who ran it, and the reply. */
export interface QuotaCommandInteraction {
  readonly member: unknown;
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

/** One handler per slash command, component and event this client answers. */
export interface CommandHandlers {
  readonly ping: (interaction: PingInteraction) => Promise<void>;
  readonly player: (interaction: ChatInputCommandInteraction) => Promise<void>;
  readonly alliance: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** An autocomplete request of /alliance, for its name or tag option. */
  readonly allianceAutocomplete: (interaction: AutocompleteInteraction) => Promise<void>;
  readonly quota: (interaction: QuotaCommandInteraction) => Promise<void>;
  /** The /usage command: the caller's Game API requests today, privately. */
  readonly usage: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** The /help command: the commands the caller can use and what they are for, privately. */
  readonly help: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** The /channels command: a Linked Member sees their Preferences message, privately, and changes nothing. */
  readonly channels: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** A button or string select menu of a pick list, whose custom id starts with `pick:`. */
  readonly pick: (press: ButtonInteraction | StringSelectMenuInteraction) => Promise<void>;
  /** /reaper closest: the Exiles nearest the caller, or nearest x and y. */
  readonly reaperClosest: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** /reaper list: every Exile on REAPER. */
  readonly reaperList: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** /reaper add: the NaP Council (an Officer while the NaP is empty) adds a Player to REAPER. */
  readonly reaperAdd: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** /reaper remove: the NaP Council (an Officer while the NaP is empty) takes an Exile off REAPER. */
  readonly reaperRemove: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** An autocomplete request of /reaper, for the exile option of /reaper remove. */
  readonly reaperAutocomplete: (interaction: AutocompleteInteraction) => Promise<void>;
  /** A button whose custom id starts with `reaper:`, the page buttons of a paged /reaper answer. */
  readonly reaperPage: (button: ButtonInteraction) => Promise<void>;
  /** A button whose custom id starts with `overview:`, the page buttons of an Alliance Overview. */
  readonly overview: (press: ButtonInteraction) => Promise<void>;
  /** A button whose custom id starts with `again:`, a Look again button under a card, an Overview or /reaper closest. */
  readonly lookAgain: (press: ButtonInteraction) => Promise<void>;
  /** The /booty command: a Linked holder of an Alliance role asks for a Booty Call, privately, to confirm. */
  readonly booty: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** The /booty-alerts command: a Member chooses their Booty Alerts, privately. */
  readonly bootyAlerts: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** The /event-invitations command: a Linked Member shows or switches their Event Invitations, privately. */
  readonly eventInvitations: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** The /event-kinds command: the Event Kinds of the kingdom or an Alliance, privately. */
  readonly eventKinds: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** The /shield-reminders command: a Linked Member shows or switches their Shield Reminders, privately. */
  readonly shieldReminders: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** The /kvk-week command: an Officer marks, unmarks or shows the KvK Week, privately. */
  readonly kvkWeek: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** A button whose custom id starts with `shield:`, the Shielded button of a Shield Reminder. */
  readonly shieldButton: (button: ButtonInteraction) => Promise<void>;
  /** The /raid-plan command: the War Council plans Saturday's Raid, privately. */
  readonly raidPlan: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** An autocomplete request of /raid-plan, for its objective, phase and alliance options. */
  readonly raidPlanAutocomplete: (interaction: AutocompleteInteraction) => Promise<void>;
  /** A button whose custom id starts with `raid:`, the Read and confirmed button of a Battle Plan. */
  readonly raidButton: (button: ButtonInteraction) => Promise<void>;
  /** A button whose custom id starts with `avail:`, the Availability Poll's buttons and its class buttons. */
  readonly availabilityButton: (button: ButtonInteraction) => Promise<void>;
  /** An autocomplete request of /booty-alerts, for its time-zone option. */
  readonly bootyAlertsAutocomplete: (interaction: AutocompleteInteraction) => Promise<void>;
  /** A button whose custom id starts with `booty:`, the Confirm and Cancel buttons of a Booty Call. */
  readonly bootyButton: (button: ButtonInteraction) => Promise<void>;
  /** A guild member joined the server; the Interview may start for them. */
  readonly memberJoined: (member: JoinedMember) => Promise<void>;
  /** A guild member came online; the Interview may start for them. */
  readonly memberOnline: (member: JoinedMember) => Promise<void>;
  /** A guild member left the server; their open Interview and pending Rank Approval end. */
  readonly memberLeft: (member: LeftMember) => Promise<void>;
  /** A scheduled event of the served guild was created; the handler reads it as discord.js gives it. */
  readonly scheduledEventCreated: (scheduledEvent: unknown) => Promise<void>;
  /** A scheduled event of the served guild was edited; the handler reads its new state. */
  readonly scheduledEventUpdated: (scheduledEvent: unknown) => Promise<void>;
  /** A scheduled event of the served guild was deleted. */
  readonly scheduledEventDeleted: (scheduledEvent: unknown) => Promise<void>;
  /** The /interview command, which starts an Onboarding Interview on demand. */
  readonly interview: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** A button or string select menu whose custom id starts with `interview:`. */
  readonly interviewButton: (button: ButtonInteraction | StringSelectMenuInteraction) => Promise<void>;
  /** A modal submit whose custom id starts with `interview:`. */
  readonly interviewModal: (modal: ModalSubmitInteraction) => Promise<void>;
  /** A button whose custom id starts with `rank:`, the Rank Approval buttons. */
  readonly rankButton: (button: ButtonInteraction) => Promise<void>;
  /** The /unlink command: a Member ends their own Link, or an Officer ends another Member's. */
  readonly unlink: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** The /rank command: an Officer gives a Linked Member their Alliance Rank. */
  readonly rank: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** The /link command: an Officer links a handed-off Member to a uid, after confirming the Player shown. */
  readonly link: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** A button whose custom id starts with `link:`, the Confirm and Cancel buttons of an Officer Link. */
  readonly linkButton: (button: ButtonInteraction) => Promise<void>;
  /** A button or string select menu whose custom id starts with `pref:`, the Preferences message's components. */
  readonly preferencesPress: (press: ButtonInteraction | StringSelectMenuInteraction) => Promise<void>;
  /** The /rotation command: the City Rotation, its order and the Holding Alliance. */
  readonly rotation: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** An autocomplete request of /rotation, for the alliance option of /rotation move and /rotation leave. */
  readonly rotationAutocomplete: (interaction: AutocompleteInteraction) => Promise<void>;
  /** A button whose custom id starts with `rotation-confirm:`, the Confirm handover button. */
  readonly rotationButton: (button: ButtonInteraction) => Promise<void>;
  /** The /nap command: the NaP register, its join requests, leaves and history. */
  readonly nap: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /**
   * A button whose custom id starts with `nap-approve:` or `nap-decline:`, the Approve or Decline button of a NaP join
   * request.
   */
  readonly napButton: (button: ButtonInteraction) => Promise<void>;
  /** A button whose custom id starts with `nap-motion-approve:` or `nap-motion-decline:`, a vote on a NaP Motion. */
  readonly napMotionButton: (button: ButtonInteraction) => Promise<void>;
  /** A modal submit whose custom id starts with `nap-rules:`, the form of /nap rules-propose. */
  readonly napRulesModal: (modal: ModalSubmitInteraction) => Promise<void>;
  /** A button whose custom id starts with `king:`, the Apply button of a King Move. */
  readonly kingMoveButton: (button: ButtonInteraction) => Promise<void>;
}

/** The services that exist once the client is ready and the channels are checked. */
interface Services {
  readonly interviews: Interviews;
  readonly rankApprovals: RankApprovals;
  /** The Event invitations: a new or edited Event is posted once, and the Events ahead are invited at startup. */
  readonly eventInvitations: EventInvitations;
  /** The Event reminders, ticked every minute, and forgotten when their Event is deleted. */
  readonly eventReminders: EventReminders;
  /** /reaper add and /reaper remove, which log to the log channel, and the pick lists, whose pick of /reaper add stores into REAPER. */
  readonly reaperAdd: (interaction: ChatInputCommandInteraction) => Promise<void>;
  readonly reaperRemove: (interaction: ChatInputCommandInteraction) => Promise<void>;
  readonly pick: (interaction: PickInteraction) => Promise<void>;
  /** /unlink, /rank and /link, and the Officer Link buttons, as the Discord client routes them. */
  readonly corrections: {
    readonly unlink: (interaction: CorrectionInteraction) => Promise<void>;
    readonly rank: (interaction: CorrectionInteraction) => Promise<void>;
    readonly link: (interaction: LinkInteraction) => Promise<void>;
    readonly linkButton: (button: LinkButtonInteraction) => Promise<void>;
  };
  /** The Preferences message's presses and /channels. */
  readonly preferenceChoices: PreferenceChoices;
  /** /booty and the Booty Call buttons. */
  readonly bootyCalls: BootyCalls;
  /** /rotation, the Confirm handover button, the pinned card and the after-siege step. */
  readonly cityRotation: CityRotation;
  /** /nap, the Approve and Decline buttons of its join requests, and the tick of their NaP Votes. */
  readonly nap: Nap;
  /** /nap motion, the Approve and Decline buttons of NaP Motions, and the tick of their reminders and results. */
  readonly napMotions: NapMotions;
  /** /nap rules, rules-history and rules-propose, its form, and the tick that settles versions by their NaP Motion. */
  readonly napRules: NapRules;
  /** /nap report and report-outcome, and the tick that records each outcome by its NaP Motion. */
  readonly napReports: NapReports;
  /** The King Move after each Handover, and its Apply button. */
  readonly kingMoves: KingMoves;
  /** /raid-plan, its autocomplete and the Read and confirmed button. */
  readonly raidPlanning: RaidPlanning;
  /** The Availability Poll's buttons. */
  readonly availabilityPoll: AvailabilityPoll;
  /** /kvk-week, /shield-reminders and the Shielded button. */
  readonly shield: ShieldCommands;
}

/** The custom id prefix of every pick list component; other component custom ids are not Neil's. */
const PICK_PREFIX = "pick:";
/** The custom id prefix of every Alliance Overview page button. */
const OVERVIEW_PREFIX = "overview:";
/** The custom id prefix of every Look again button. */
const AGAIN_PREFIX = "again:";
/** The custom id prefix of every paged /reaper answer button. */
const REAPER_PREFIX = "reaper:";
/** The custom id prefix of every Booty Call button. */
const BOOTY_PREFIX = "booty:";
/** The custom id prefix of every Onboarding Interview button and modal. */
const INTERVIEW_PREFIX = "interview:";
/** The custom id prefix of every Rank Approval button. */
const RANK_PREFIX = "rank:";
/** The custom id prefix of every Officer Link button. */
const LINK_PREFIX = "link:";

/** A user id picked in a command option: digits only, as every Discord snowflake is. */
const memberIdSchema = z.string().regex(/^\d+$/);

/** A guild member's roles, from the discord.js cache (a GuildMemberRoleManager) or from an API member (a string array). */
const memberSchema = z.union([
  z.object({ roles: z.array(z.string()) }).transform((member) => member.roles),
  z
    .object({ roles: z.object({ cache: z.map(z.string(), z.unknown()) }) })
    .transform((member) => [...member.roles.cache.keys()]),
]);

/** The role IDs of a Member, or none when the member is not in the shape discord.js gives. */
export function memberRoleIds(member: unknown): readonly string[] {
  const parsed = memberSchema.safeParse(member);
  return parsed.success ? parsed.data : [];
}

/** What createClient needs: the server Neil serves, and where client errors are logged. */
export interface ClientOptions {
  /** The server Neil serves; member events of other servers are not handed on. */
  readonly guildId: string;
  readonly logError?: (message: string) => void;
}

/** Hands a /reaper command to the handler of its subcommand. */
function routeReaper(
  handlers: CommandHandlers,
  interaction: ChatInputCommandInteraction,
  logError: (message: string) => void,
): void {
  switch (interaction.options.getSubcommand()) {
    case "closest":
      void handlers.reaperClosest(interaction);
      break;
    case "list":
      void handlers.reaperList(interaction);
      break;
    case "add":
      void handlers.reaperAdd(interaction);
      break;
    case "remove":
      void handlers.reaperRemove(interaction);
      break;
    default:
      void answer("/reaper", { logError }, () => replyPrivately(interaction, reaperMessages.unknownSubcommand));
  }
}

/** The status of a presence as Neil reads it, or undefined for no presence or a status Neil does not know. */
const presenceStatusSchema = z
  .enum(["online", "idle", "dnd", "invisible", "offline"])
  .transform((status): PresenceStatus => (status === "invisible" ? "offline" : status));

function presenceStatusOf(status: unknown): PresenceStatus | undefined {
  const parsed = presenceStatusSchema.safeParse(status);
  return parsed.success ? parsed.data : undefined;
}

/** A guild member as the Interview needs them. */
function joinedMemberOf(member: GuildMember): JoinedMember {
  return { id: member.id, username: member.user.username, displayName: member.displayName, bot: member.user.bot };
}

/**
 * The Member who came online, read with a single-Member fetch: the presence's own Member can be a stub, so it is not used.
 * Undefined when the user is not on the guild.
 */
async function onlineMemberOf(guild: Guild, userId: string): Promise<JoinedMember | undefined> {
  const member = await fetchMember(guild, userId);
  return member === undefined ? undefined : joinedMemberOf(member);
}

/**
 * The Members Discord reports online, each read with a single-Member fetch; the listing never asks Discord for every
 * Member at once. A Member who is not on the guild any more is skipped. A Member who cannot be read is logged and listed
 * as unreadable, so the startup counts them as failed. Stops before the next Member once `isStopping` says so.
 */
async function onlineMembersOf(
  guild: Guild,
  logError: (message: string) => void,
  isStopping: () => boolean,
): Promise<StartupMember[]> {
  const userIds = [...guild.presences.cache.values()]
    .filter((presence) => {
      const status = presenceStatusOf(presence.status);
      return status !== undefined && status !== "offline";
    })
    .map((presence) => presence.userId);
  const members: StartupMember[] = [];
  for (const userId of userIds) {
    if (isStopping()) break;
    try {
      const member = await fetchMember(guild, userId);
      if (member !== undefined) members.push(joinedMemberOf(member));
    } catch (error: unknown) {
      logError(`Reading the Member ${userId} failed: ${String(error)}`);
      members.push({ id: userId, unreadable: true });
    }
  }
  return members;
}

/** A discord.js client with the Guilds, GuildMembers, GuildPresences and GuildScheduledEvents intents that routes each event to its handler. */
export function createClient(handlers: CommandHandlers, options: ClientOptions): Client {
  const logError = options.logError ?? console.error;
  // Partials let a Member who left uncached still be announced: GuildMemberRemove is emitted for them, with their user.
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildScheduledEvents,
    ],
    partials: [Partials.GuildMember, Partials.User],
  });
  // Without a listener, an emitted error would crash the process; discord.js reconnects by itself.
  client.on(Events.Error, (error) => {
    logError(`Discord client error: ${error.message}`);
  });
  client.on(Events.GuildMemberAdd, (member) => {
    if (member.guild.id !== options.guildId) return;
    void handlers.memberJoined({
      id: member.id,
      username: member.user.username,
      displayName: member.displayName,
      bot: member.user.bot,
    });
  });
  // The member may be partial when they left; the Discord event carries their user, with the username, so it is still there.
  client.on(Events.GuildMemberRemove, (member) => {
    if (member.guild.id !== options.guildId) return;
    void handlers.memberLeft({ id: member.id, username: member.user.username });
  });
  // The scheduled events of the served guild only: created, edited (the new state is handed on) and deleted.
  client.on(Events.GuildScheduledEventCreate, (scheduledEvent) => {
    if (scheduledEvent.guildId !== options.guildId) return;
    void handlers.scheduledEventCreated(scheduledEvent);
  });
  client.on(Events.GuildScheduledEventUpdate, (_before, scheduledEvent) => {
    if (scheduledEvent.guildId !== options.guildId) return;
    void handlers.scheduledEventUpdated(scheduledEvent);
  });
  client.on(Events.GuildScheduledEventDelete, (scheduledEvent) => {
    if (scheduledEvent.guildId !== options.guildId) return;
    void handlers.scheduledEventDeleted(scheduledEvent);
  });
  // A Member who was offline and now is not comes online; the status itself is not logged or kept (ADR 11).
  client.on(Events.PresenceUpdate, (before, after) => {
    const guild = after.guild;
    if (guild === null || guild.id !== options.guildId) return;
    const status = presenceStatusOf(after.status);
    if (status === undefined || !cameOnline(presenceStatusOf(before?.status), status)) return;
    void onlineMemberOf(guild, after.userId).then(
      (member) => {
        if (member !== undefined) void handlers.memberOnline(member);
      },
      (error: unknown) => {
        logError(`Reading a Member who came online failed: ${String(error)}`);
      },
    );
  });
  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case "ping":
          void handlers.ping(interaction);
          break;
        case "player":
          void handlers.player(interaction);
          break;
        case "alliance":
          void handlers.alliance(interaction);
          break;
        case "quota":
          void handlers.quota(interaction);
          break;
        case "usage":
          void handlers.usage(interaction);
          break;
        case "help":
          void handlers.help(interaction);
          break;
        case "channels":
          void handlers.channels(interaction);
          break;
        case "interview":
          void handlers.interview(interaction);
          break;
        case "unlink":
          void handlers.unlink(interaction);
          break;
        case "rank":
          void handlers.rank(interaction);
          break;
        case "link":
          void handlers.link(interaction);
          break;
        case "reaper":
          routeReaper(handlers, interaction, logError);
          break;
        case "booty":
          void handlers.booty(interaction);
          break;
        case "booty-alerts":
          void handlers.bootyAlerts(interaction);
          break;
        case "event-invitations":
          void handlers.eventInvitations(interaction);
          break;
        case "event-kinds":
          void handlers.eventKinds(interaction);
          break;
        case "shield-reminders":
          void handlers.shieldReminders(interaction);
          break;
        case "kvk-week":
          void handlers.kvkWeek(interaction);
          break;
        case "rotation":
          void handlers.rotation(interaction);
          break;
        case "nap":
          void handlers.nap(interaction);
          break;
        case "raid-plan":
          void handlers.raidPlan(interaction);
          break;
      }
      return;
    }
    if (interaction.isAutocomplete()) {
      if (interaction.commandName === "alliance") void handlers.allianceAutocomplete(interaction);
      if (interaction.commandName === "reaper") void handlers.reaperAutocomplete(interaction);
      if (interaction.commandName === "booty-alerts") void handlers.bootyAlertsAutocomplete(interaction);
      if (interaction.commandName === "raid-plan") void handlers.raidPlanAutocomplete(interaction);
      if (interaction.commandName === "rotation") void handlers.rotationAutocomplete(interaction);
      return;
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith(INTERVIEW_PREFIX)) void handlers.interviewModal(interaction);
      else if (interaction.customId.startsWith(NAP_RULES_PREFIX)) void handlers.napRulesModal(interaction);
      return;
    }
    if (interaction.isButton()) {
      if (interaction.customId.startsWith(INTERVIEW_PREFIX)) {
        void handlers.interviewButton(interaction);
      } else if (interaction.customId.startsWith(RANK_PREFIX)) {
        void handlers.rankButton(interaction);
      } else if (interaction.customId.startsWith(LINK_PREFIX)) {
        void handlers.linkButton(interaction);
      } else if (interaction.customId.startsWith(PICK_PREFIX)) {
        void handlers.pick(interaction);
      } else if (interaction.customId.startsWith(OVERVIEW_PREFIX)) {
        void handlers.overview(interaction);
      } else if (interaction.customId.startsWith(AGAIN_PREFIX)) {
        void handlers.lookAgain(interaction);
      } else if (interaction.customId.startsWith(REAPER_PREFIX)) {
        void handlers.reaperPage(interaction);
      } else if (interaction.customId.startsWith(BOOTY_PREFIX)) {
        void handlers.bootyButton(interaction);
      } else if (interaction.customId.startsWith(PREFERENCES_PREFIX)) {
        void handlers.preferencesPress(interaction);
      } else if (interaction.customId.startsWith(ROTATION_CONFIRM_PREFIX)) {
        void handlers.rotationButton(interaction);
      } else if (interaction.customId.startsWith(KING_MOVE_PREFIX)) {
        void handlers.kingMoveButton(interaction);
      } else if (
        interaction.customId.startsWith(NAP_MOTION_APPROVE_PREFIX) ||
        interaction.customId.startsWith(NAP_MOTION_DECLINE_PREFIX)
      ) {
        void handlers.napMotionButton(interaction);
      } else if (
        interaction.customId.startsWith(NAP_APPROVE_PREFIX) ||
        interaction.customId.startsWith(NAP_DECLINE_PREFIX)
      ) {
        void handlers.napButton(interaction);
      } else if (interaction.customId.startsWith(RAID_PREFIX)) {
        void handlers.raidButton(interaction);
      } else if (interaction.customId.startsWith(AVAILABILITY_PREFIX)) {
        void handlers.availabilityButton(interaction);
      } else if (interaction.customId.startsWith(SHIELD_PREFIX)) {
        void handlers.shieldButton(interaction);
      }
      return;
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith(INTERVIEW_PREFIX)) {
        void handlers.interviewButton(interaction);
      } else if (interaction.customId.startsWith(PICK_PREFIX)) {
        void handlers.pick(interaction);
      } else if (interaction.customId.startsWith(PREFERENCES_PREFIX)) {
        void handlers.preferencesPress(interaction);
      }
    }
  });
  return client;
}

export interface ConnectOptions {
  readonly buildInfo: BuildInfo;
  /** The clock: the time of each Daily Quota check, apply and run record. */
  readonly now: () => Date;
  readonly startRecord: StartRecord;
  readonly gameApi: GameApi;
  /** Requests kept back for Onboarding Interviews; from GAME_API_QUOTA_RESERVE, shown by /quota. */
  readonly quotaReserve: number;
  /** The Daily Allowance of today, read by the lookups to refuse a Member who has used it up, and by /usage and /quota. */
  readonly allowance: Pick<AllowanceKeeper, "allowance" | "expected" | "top" | "usageOf">;
  /** The Moderator and King role IDs from config, in that order; holders of either are Officers. */
  readonly officerRoleIds: readonly [string, string];
  /** The server Neil serves; its channels are checked at ready. */
  readonly guildId: string;
  readonly onboardingChannelId: string;
  readonly logChannelId: string;
  /** How long an Onboarding Interview may stay silent; the interview store applies it when it saves a deadline. */
  readonly interviewTimeoutMs: number;
  readonly interviews: InterviewStore;
  readonly links: LinkStore;
  /** The Applied State of each Linked Member: what the name and roles last set. */
  readonly applied: AppliedStore;
  /** The Known Alliances of the Home Kingdom, for the name and tag suggestions and the close names of /alliance. */
  readonly knownAlliances: Pick<KnownAllianceStore, "all">;
  /** The Home Kingdom from config: members of it are Home Kingdom Players. */
  readonly homeKingdom: KingdomNumber;
  /** The first level of each Troop Bracket from config, T1 first. */
  readonly troopBracketLevels: readonly number[];
  /** The record of the last Daily Sync run: its day and the Members it left over. */
  readonly dailySync: Pick<DailySyncStore, "load" | "save">;
  /** REAPER: the Exiles the /reaper commands read and write. */
  readonly reaper: ReaperStore;
  /** The Preferences and the open Preferences messages, in neil.db. */
  readonly preferences: PreferenceStore;
  /** The Booty Alerts of the Members, in neil.db: an Unlink forgets them. */
  readonly bootyAlerts: BootyAlertsStore;
  /** The Events Neil has seen, their reminders and Kinds, and the Event Invitations Off, in neil.db. */
  readonly events: EventStore;
  /** The Raids, their Battle Plans, Plan Confirmations and notices sent, in neil.db. */
  readonly raids: RaidStore;
  /** The War Council role, the Raid start and the deadlines from config; Raid planning is off without the role. */
  readonly raidSettings: RaidSettings;
  /** The Availability Polls, their cards and the Members' answers, in neil.db: an Unlink forgets the answers. */
  readonly availability: AvailabilityStore;
  /** The KvK Weeks, the Shield Reminders sent, the Shield Confirmations and Shield Reminders Off, in neil.db (ADR 27). */
  readonly shield: ShieldStore;
  /** The Fighter Class thresholds from config, for Neil's suggestion in the Availability Poll. */
  readonly fighterClassThresholds: FighterClassThresholds;
  /** The guides forum channel from DISCORD_GUIDES_FORUM_ID, named in the guides line; undefined when not set. */
  readonly guidesForumId: string | undefined;
  /** The hour (UTC) the Daily Sync runs at, from SYNC_HOUR_UTC. */
  readonly syncHourUtc: number;
  /** The most Game API requests one Daily Sync run may send, from SYNC_SHARE. */
  readonly syncShare: number;
  /** The City Rotation, its waiting Handover and its pinned card, in neil.db. */
  readonly cityRotation: Pick<CityRotationStore, "load" | "update">;
  /** Rotation or Contested, from CITY_ROTATION_MODE. */
  readonly cityRotationMode: CityRotationMode;
  /** The latest King Move, in neil.db. */
  readonly kingMoves: Pick<KingMoveStore, "load" | "save" | "update">;
  /** The Handover Reminders and next-holder announcements handled per Royal City siege, in neil.db. */
  readonly handovers: Pick<HandoverStore, "handoverPosted" | "recordHandoverPosted">;
  /** The NaP register: the history of joins, declines and leaves, the open join requests and their votes, in neil.db. */
  readonly nap: Pick<
    NapStore,
    | "history"
    | "append"
    | "openRequests"
    | "request"
    | "addRequest"
    | "setRequestMessage"
    | "setVoteEnd"
    | "castVote"
    | "votes"
    | "removeRequest"
    | "listMessageId"
    | "setListMessageId"
  >;
  /** The NaP Motions: each motion, its votes per Alliance and its result, in neil.db. */
  readonly napMotions: Pick<
    NapMotionStore,
    "add" | "setMessage" | "remove" | "open" | "get" | "castVote" | "votes" | "markReminded" | "close"
  >;
  /** The NaP Rules: every NaP Rules Version, its proposer and its NaP Motion, in neil.db. */
  readonly napRules: Pick<NapRulesStore, "versions" | "propose" | "setMotion" | "remove" | "decide">;
  /** The NaP Reports: every report, its thread and the outcomes proposed for it, in neil.db (ADR 28). */
  readonly napReports: Pick<
    NapReportStore,
    "reports" | "proposals" | "file" | "setThread" | "remove" | "propose" | "setMotion" | "removeProposal" | "decide"
  >;
}

/** discord.js's code for a user who is not a member of the guild. */
const UNKNOWN_MEMBER = 10007;
/** Discord's code for an unknown user: a user who is no longer a member is answered the same way. */
const UNKNOWN_USER = 10013;
const unknownMemberError = z.object({ code: z.union([z.literal(UNKNOWN_MEMBER), z.literal(UNKNOWN_USER)]) });

/** A role of the guild as the name and roles apply reads it. */
function roleLikeOf(role: Role): RoleLike {
  return {
    id: role.id,
    name: role.name,
    managed: role.managed,
    permissions: { bitfield: role.permissions.bitfield },
    position: role.position,
  };
}

/** The guild as the name and roles apply reads it; the bot's highest role places the bot among the roles. */
function rolesGuildOf(guild: Guild, botTopRolePosition: number): RolesGuild {
  return {
    id: guild.id,
    ownerId: guild.ownerId,
    botTopRolePosition,
    get roles() {
      return [...guild.roles.cache.values()].map(roleLikeOf);
    },
    createRole: async (options) => {
      const role = await guild.roles.create({
        name: options.name,
        permissions: options.permissions,
        hoist: options.hoist,
        mentionable: options.mentionable,
      });
      return roleLikeOf(role);
    },
    renameRole: async (role, name) => {
      await guild.roles.edit(role.id, { name });
    },
  };
}

/** A guild member as the name and roles apply reads and changes it. */
function rolesMemberOf(member: GuildMember): RolesMember {
  return {
    id: member.id,
    bot: member.user.bot,
    get nickname() {
      return member.nickname;
    },
    get roles() {
      return [...member.roles.cache.values()].map(roleLikeOf);
    },
    addRole: async (role) => {
      await member.roles.add(role.id);
    },
    removeRole: async (role) => {
      await member.roles.remove(role.id);
    },
    setNickname: async (nickname) => {
      await member.setNickname(nickname);
    },
  };
}

/** The member, or undefined when the user is not on the guild; any other failure is thrown. */
async function fetchMember(guild: Guild, memberId: string): Promise<GuildMember | undefined> {
  try {
    return await guild.members.fetch(memberId);
  } catch (error) {
    if (unknownMemberError.safeParse(error).success) return undefined;
    throw error;
  }
}

/**
 * Posts the server permissions Neil lacks to the log, at startup. Runs in the background: a failure to read the bot's
 * member or post the line is logged, never thrown.
 */
async function reportServerPermissions(
  guild: Guild,
  log: (message: BaseMessageOptions) => Promise<void>,
  logError: (message: string) => void,
): Promise<void> {
  try {
    const me = guild.members.me ?? (await guild.members.fetchMe());
    await reportRolePermissions({ members: { me } }, log, logError);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logError(`Checking the server permissions failed: ${reason}`);
  }
}

/** Every Member of the guild, listed over REST page by page (see listEveryMember), never by the gateway. */
function everyMemberOf(guild: Guild): Promise<GuildMember[]> {
  return listEveryMember(async (after, limit) => {
    const page = await guild.members.list(after === undefined ? { limit } : { after, limit });
    return [...page.values()];
  });
}

/** The members of the guild for the name and roles; undefined for a user who is not on the guild. */
function serverMembersOf(guild: Guild): ServerMembers {
  return {
    memberOf: async (memberId) => {
      const member = await fetchMember(guild, memberId);
      if (member === undefined) return undefined;
      const me = guild.members.me ?? (await guild.members.fetchMe());
      return { guild: rolesGuildOf(guild, me.roles.highest.position), member: rolesMemberOf(member) };
    },
    all: async () => {
      const members = await everyMemberOf(guild);
      const me = guild.members.me ?? (await guild.members.fetchMe());
      const botTopRolePosition = me.roles.highest.position;
      return members.map((member) => ({
        guild: rolesGuildOf(guild, botTopRolePosition),
        member: rolesMemberOf(member),
      }));
    },
  };
}

/**
 * The discord.js button press or string select menu press as the Interview reads it. discord.js types reply with
 * overloads that the Interview's narrower signatures do not match, so each method is passed on with the one shape Neil
 * uses. A select menu press also carries the values picked.
 */
function buttonLike(button: ButtonInteraction | StringSelectMenuInteraction): ButtonInteractionLike {
  const like: ButtonInteractionLike = {
    customId: button.customId,
    user: button.user,
    reply: async (message) => {
      await button.reply(message);
    },
    showModal: async (modal) => {
      await button.showModal(modal);
    },
    update: async (options) => {
      await button.update(options);
    },
    followUp: async (message) => {
      await button.followUp(message);
    },
  };
  return button.isStringSelectMenu() ? { ...like, values: [...button.values] } : like;
}

/**
 * The discord.js chat-input command as /player and /alliance read it: the caller and their roles, the options, and the
 * placeholder and reply methods. Each method is passed on with the one shape the lookups use.
 */
/** The discord.js chat-input command as /usage reads it: who ran it, their roles, and the private reply. */
function usageLike(command: ChatInputCommandInteraction): UsageInteraction {
  return {
    callerId: command.user.id,
    memberRoleIds: () => memberRoleIds(command.member),
    reply: (reply) => command.reply(reply),
  };
}

/** The discord.js /reaper add or remove command: the caller and their roles, the options, and the reply methods. */
function reaperAddLike(command: ChatInputCommandInteraction): ReaperAddInteraction {
  return {
    user: command.user,
    options: command.options,
    memberRoleIds: () => memberRoleIds(command.member),
    deferReply: (options) => command.deferReply(options),
    editReply: (options) => command.editReply(options),
    reply: (options) => command.reply(options),
  };
}

function lookupLike(command: ChatInputCommandInteraction): LookupInteraction {
  return {
    user: command.user,
    options: command.options,
    memberRoleIds: () => memberRoleIds(command.member),
    deferReply: async (options) => {
      await command.deferReply(options);
    },
    editReply: async (options) => {
      await command.editReply(options);
    },
    deleteReply: async () => {
      await command.deleteReply();
    },
    followUp: async (message) => {
      await command.followUp(message);
    },
    reply: async (message) => {
      await command.reply(message);
    },
  };
}

/**
 * The discord.js button press as a Look again button reads it: the custom id, the Member who pressed and their roles, and
 * the reply methods. See buttonLike for why each method is passed on.
 */
function lookAgainLike(press: ButtonInteraction): LookAgainInteraction {
  return {
    customId: press.customId,
    user: press.user,
    memberRoleIds: () => memberRoleIds(press.member),
    deferUpdate: async () => {
      await press.deferUpdate();
    },
    editReply: async (options) => {
      await press.editReply(options);
    },
    followUp: async (message) => {
      await press.followUp(message);
    },
    reply: async (message) => {
      await press.reply(message);
    },
  };
}

/**
 * The discord.js button press or string select menu press as a pick list reads it: the owner and the roles of the
 * Member who pressed, the values picked, and the reply methods. See buttonLike for why each method is passed on.
 */
function pickLike(press: ButtonInteraction | StringSelectMenuInteraction): PickInteraction {
  const like: PickInteraction = {
    customId: press.customId,
    user: press.user,
    memberRoleIds: () => memberRoleIds(press.member),
    deferReply: async (options) => {
      await press.deferReply(options);
    },
    editReply: async (options) => {
      await press.editReply(options);
    },
    deleteReply: async () => {
      await press.deleteReply();
    },
    followUp: async (message) => {
      await press.followUp(message);
    },
    reply: async (message) => {
      await press.reply(message);
    },
    update: async (options) => {
      await press.update(options);
    },
  };
  return press.isStringSelectMenu() ? { ...like, values: [...press.values] } : like;
}

/** The discord.js button press as a Rank Approval reads it; see buttonLike for why each method is passed on. */
function rankButtonLike(button: ButtonInteraction): RankButtonLike {
  return {
    customId: button.customId,
    user: button.user,
    reply: async (message) => {
      await button.reply(message);
    },
    update: async (options) => {
      await button.update(options);
    },
  };
}

/**
 * The discord.js chat-input command as the corrections read it: the caller, their roles, and the options given. A message
 * with buttons keeps them; the deferral already made the answer private, so editReply takes no flags.
 */
function correctionLike(command: ChatInputCommandInteraction): CorrectionInteraction & LinkInteraction {
  return {
    callerId: command.user.id,
    memberRoleIds: () => memberRoleIds(command.member),
    memberOption: () => {
      const parsed = memberIdSchema.safeParse(command.options.getUser("member")?.id);
      return parsed.success ? parsed.data : undefined;
    },
    rankOption: () => command.options.getString("rank") ?? undefined,
    uidOption: () => command.options.getString("uid") ?? undefined,
    deferReply: async (options) => {
      await command.deferReply(options);
    },
    editReply: async (message) => {
      await command.editReply({
        content: message.content,
        allowedMentions: message.allowedMentions,
        ...("components" in message ? { components: message.components } : {}),
      });
    },
  };
}

/**
 * The discord.js button press as an Officer Link reads it. The press is acknowledged with deferUpdate, so the card is then
 * edited (not updated) and every answer is a follow-up.
 */
function linkButtonLike(button: ButtonInteraction): LinkButtonInteraction {
  return {
    customId: button.customId,
    user: button.user,
    memberRoleIds: () => memberRoleIds(button.member),
    deferUpdate: async () => {
      await button.deferUpdate();
    },
    followUp: async (message) => {
      await button.followUp(message);
    },
    update: async (message) => {
      await button.editReply({ ...message, components: [] });
    },
  };
}

/** The discord.js /rotation command as the City Rotation reads it: the caller and their roles, the options, the reply. */
function rotationCommandLike(command: ChatInputCommandInteraction): RotationCommand {
  return {
    user: command.user,
    memberRoleIds: () => memberRoleIds(command.member),
    options: {
      getString: (name) => command.options.getString(name),
      getInteger: (name) => command.options.getInteger(name),
    },
    reply: (options) => command.reply(options),
  };
}

/** The discord.js press of a Confirm handover button: the presser and their roles, a private reply, or the message replaced. */
function rotationButtonLike(button: ButtonInteraction): RotationButton {
  return {
    customId: button.customId,
    user: button.user,
    memberRoleIds: () => memberRoleIds(button.member),
    reply: (options) => button.reply(options),
    update: (options) => button.update(options),
  };
}

/** The discord.js press of a King Move's Apply button: the presser and their roles, and a private reply. */
function kingMoveButtonLike(button: ButtonInteraction): KingMoveButton {
  return {
    customId: button.customId,
    user: button.user,
    memberRoleIds: () => memberRoleIds(button.member),
    reply: (options) => button.reply(options),
  };
}

/** Hands a /rotation command to the City Rotation's subcommand. */
async function routeRotation(cityRotation: CityRotation, interaction: ChatInputCommandInteraction): Promise<void> {
  const command = rotationCommandLike(interaction);
  switch (interaction.options.getSubcommand()) {
    case "show":
      await cityRotation.show(command);
      break;
    case "set":
      await cityRotation.set(command);
      break;
    case "holder":
      await cityRotation.holder(command);
      break;
    case "move":
      await cityRotation.move(command);
      break;
    case "skip":
      await cityRotation.skip(command);
      break;
    case "leave":
      await cityRotation.leave(command);
      break;
    case "pause":
      await cityRotation.pause(command);
      break;
    case "resume":
      await cityRotation.resume(command);
      break;
    default:
      await replyPrivately(interaction, cityRotationMessages.unknownSubcommand);
  }
}

/** The discord.js /nap command as the NaP register reads it: the caller and their roles, and the reply. */
function napCommandLike(command: ChatInputCommandInteraction): NapCommand {
  return {
    user: command.user,
    memberRoleIds: () => memberRoleIds(command.member),
    reply: (options) => command.reply(options),
  };
}

/** The discord.js press of an Approve or Decline button: the presser and their roles, a private reply, or the message replaced. */
function napButtonLike(button: ButtonInteraction): NapButton {
  return {
    customId: button.customId,
    user: button.user,
    memberRoleIds: () => memberRoleIds(button.member),
    reply: (options) => button.reply(options),
    update: (options) => button.update(options),
  };
}

/** The discord.js /nap motion command as NaP Motions read it: the caller, the text and hours options, and the reply. */
function napMotionCommandLike(command: ChatInputCommandInteraction): NapMotionCommand {
  return {
    user: command.user,
    options: {
      getString: (name) => command.options.getString(name),
      getInteger: (name) => command.options.getInteger(name),
    },
    reply: (options) => command.reply(options),
  };
}

/** The discord.js press of a NaP Motion's Approve or Decline button: the presser and a private reply. */
function napMotionButtonLike(button: ButtonInteraction): NapMotionButton {
  return {
    customId: button.customId,
    user: button.user,
    reply: (options) => button.reply(options),
  };
}

/** The discord.js /nap rules, rules-history and rules-propose command as the NaP Rules read it. */
function napRulesCommandLike(command: ChatInputCommandInteraction): NapRulesCommand {
  return {
    user: command.user,
    options: { getInteger: (name) => command.options.getInteger(name) },
    reply: (options) => command.reply(options),
    showModal: (modal) => command.showModal(modal),
  };
}

/** The discord.js submit of the /nap rules-propose form as the NaP Rules read it. */
function napRulesModalLike(modal: ModalSubmitInteraction): NapRulesModal {
  return {
    customId: modal.customId,
    user: modal.user,
    fields: { getTextInputValue: (id) => modal.fields.getTextInputValue(id) },
    reply: (options) => modal.reply(options),
  };
}

/** The discord.js /nap report and report-outcome command as the NaP Reports read it. */
function napReportCommandLike(command: ChatInputCommandInteraction): NapReportCommand {
  return {
    user: command.user,
    options: {
      getString: (name) => command.options.getString(name),
      getInteger: (name) => command.options.getInteger(name),
    },
    reply: (options) => command.reply(options),
    deferReply: (options) => command.deferReply(options),
    editReply: (options) => command.editReply(options),
  };
}

/**
 * Hands a /nap command to the NaP register's subcommand, /nap motion to NaP Motions, /nap rules… to the NaP Rules, or
 * /nap report… to the NaP Reports.
 */
async function routeNap(
  { nap, napMotions, napRules, napReports }: Pick<Services, "nap" | "napMotions" | "napRules" | "napReports">,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const command = napCommandLike(interaction);
  switch (interaction.options.getSubcommand()) {
    case "show":
      await nap.show(command);
      break;
    case "join":
      await nap.join(command);
      break;
    case "leave":
      await nap.leave(command);
      break;
    case "history":
      await nap.history(command);
      break;
    case "motion":
      await napMotions.open(napMotionCommandLike(interaction));
      break;
    case "rules":
      await napRules.show(napRulesCommandLike(interaction));
      break;
    case "rules-history":
      await napRules.history(napRulesCommandLike(interaction));
      break;
    case "rules-propose":
      await napRules.propose(napRulesCommandLike(interaction));
      break;
    case "report":
      await napReports.report(napReportCommandLike(interaction));
      break;
    case "report-outcome":
      await napReports.proposeOutcome(napReportCommandLike(interaction));
      break;
    default:
      await replyPrivately(interaction, napMessages.unknownSubcommand);
  }
}

/** The discord.js /channels command as the choices read it: the caller, and the private reply. */
function channelsCommandLike(command: ChatInputCommandInteraction): ChannelsCommand {
  return {
    user: command.user,
    reply: async (message) => {
      await command.reply(message);
    },
  };
}

/**
 * The discord.js button press or string select menu press on a Preferences message as the choices read it. A select menu
 * press also carries the values picked; see buttonLike for why each method is passed on.
 */
function preferencesPressLike(press: ButtonInteraction | StringSelectMenuInteraction): PreferencePress {
  const like: PreferencePress = {
    customId: press.customId,
    user: press.user,
    reply: async (message) => {
      await press.reply(message);
    },
    update: async (options) => {
      await press.update(options);
    },
  };
  return press.isStringSelectMenu() ? { ...like, values: [...press.values] } : like;
}

/** The discord.js chat-input command as the Interview reads it; see buttonLike for why each method is passed on. */
function commandLike(command: ChatInputCommandInteraction): CommandLike {
  return {
    user: command.user,
    // A command from a member of the server carries the guild member, whose display name is the server's; else the username.
    displayName: command.member instanceof GuildMember ? command.member.displayName : command.user.username,
    deferReply: async (options) => {
      await command.deferReply(options);
    },
    // The deferral already made the answer ephemeral; editReply takes no flags.
    editReply: async (message) => {
      await command.editReply({ content: message.content, allowedMentions: message.allowedMentions });
    },
  };
}

/** The discord.js modal submit as the Interview reads it; see buttonLike for why each method is passed on. */
function modalLike(modal: ModalSubmitInteraction): ModalInteractionLike {
  return {
    customId: modal.customId,
    user: modal.user,
    fields: { getTextInputValue: (id) => modal.fields.getTextInputValue(id) },
    reply: async (message) => {
      await modal.reply(message);
    },
    deferUpdate: async () => {
      await modal.deferUpdate();
    },
  };
}

/** A guild text channel as a Booty Call reads it: its id, its name and the name of its category; any other channel is not one. */
const guildTextChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.literal(ChannelType.GuildText),
  parent: z.object({ name: z.string() }).nullish(),
});

function bootyChannelOf(channel: unknown): BootyChannel | undefined {
  const parsed = guildTextChannelSchema.safeParse(channel);
  if (!parsed.success) return undefined;
  return { id: parsed.data.id, name: parsed.data.name, categoryName: parsed.data.parent?.name };
}

/** The caller of a Booty Call: the server display name when the interaction gives a guild member, else the username. */
function bootyCallerOf(user: User, member: unknown): { readonly id: string; readonly displayName: string } {
  return { id: user.id, displayName: member instanceof GuildMember ? member.displayName : user.username };
}

/** The discord.js /booty command as a Booty Call reads it: the caller, the channel, and the private reply. */
function bootyCommandLike(command: ChatInputCommandInteraction): BootyCallCommand {
  return {
    user: bootyCallerOf(command.user, command.member),
    channel: bootyChannelOf(command.channel),
    reply: async (options) => {
      await command.reply(options);
    },
    deferReply: async (options) => {
      await command.deferReply(options);
    },
    editReply: async (options) => {
      await command.editReply(options);
    },
  };
}

/** The discord.js Booty Call button press as a Booty Call reads it; see buttonLike for why each method is passed on. */
function bootyButtonLike(button: ButtonInteraction): BootyCallButton {
  return {
    customId: button.customId,
    user: bootyCallerOf(button.user, button.member),
    channel: bootyChannelOf(button.channel),
    reply: async (options) => {
      await button.reply(options);
    },
    update: async (options) => {
      await button.update(options);
    },
    editReply: async (options) => {
      await button.editReply(options);
    },
  };
}

/** The discord.js /event-kinds command as the Event Kinds read it: the caller and their roles by id and name, and the options. */
function eventKindsLike(command: ChatInputCommandInteraction): EventKindsInteraction {
  return {
    user: { id: command.user.id },
    options: {
      getSubcommand: () => command.options.getSubcommand(),
      getString: (name) => command.options.getString(name),
    },
    memberRoles: () =>
      command.member instanceof GuildMember
        ? [...command.member.roles.cache.values()].map((role) => ({ id: role.id, name: role.name }))
        : [],
    reply: (reply) => command.reply(reply),
  };
}

/** The discord.js /shield-reminders command as the Shield Reminders read it: the caller, the option and the private reply. */
function shieldRemindersLike(command: ChatInputCommandInteraction): ShieldRemindersInteraction {
  return {
    user: { id: command.user.id },
    options: { getString: (name) => command.options.getString(name) },
    reply: (reply) => command.reply(reply),
  };
}

/** The discord.js /kvk-week command as the KvK Week reads it: the caller, their role ids, the subcommand and the reply. */
function kvkWeekLike(command: ChatInputCommandInteraction): KvkWeekInteraction {
  return {
    user: { id: command.user.id },
    options: { getSubcommand: () => command.options.getSubcommand() },
    memberRoleIds: () => memberRoleIds(command.member),
    reply: (reply) => command.reply(reply),
  };
}

/** The discord.js Shielded button press as the Shield Confirmation reads it: the presser, their roles, the channel and the reply. */
function shieldPressLike(button: ButtonInteraction): ShieldPress {
  const channel = bootyChannelOf(button.channel);
  return {
    customId: button.customId,
    user: { id: button.user.id },
    channel: channel === undefined ? undefined : { name: channel.name, categoryName: channel.categoryName },
    memberRoleNames: () => rolesOfMember(button.member).map((role) => role.name),
    reply: (reply) => button.reply(reply),
  };
}

/** The roles of the Member behind an interaction, by id and name; none outside a guild. */
function rolesOfMember(member: unknown): { readonly id: string; readonly name: string }[] {
  return member instanceof GuildMember ? [...member.roles.cache.values()].map((role) => ({ id: role.id, name: role.name })) : [];
}

/** The discord.js /raid-plan command as the Raid planning reads it: the caller, their roles, the options and the private replies. */
function raidPlanLike(command: ChatInputCommandInteraction): RaidPlanInteraction {
  return {
    user: { id: command.user.id },
    options: {
      getSubcommand: () => command.options.getSubcommand(),
      getString: (name) => command.options.getString(name),
    },
    memberRoles: () => rolesOfMember(command.member),
    reply: (reply) => command.reply(reply),
    deferReply: (options) => command.deferReply(options),
    editReply: (options) => command.editReply(options),
  };
}

/** A discord.js /raid-plan autocomplete request as the Raid planning reads it: the focused option, the typer's roles and the answer. */
function raidPlanAutocompleteLike(request: AutocompleteInteraction): RaidPlanAutocomplete {
  return {
    options: { getFocused: (full) => request.options.getFocused(full) },
    memberRoles: () => rolesOfMember(request.member),
    respond: (choices) => request.respond(choices),
  };
}

/** The discord.js Availability Poll button press as the poll reads it: the presser, their roles and the private replies. */
function availabilityPressLike(button: ButtonInteraction): AvailabilityPress {
  return {
    customId: button.customId,
    user: { id: button.user.id },
    memberRoles: () => rolesOfMember(button.member),
    reply: (reply) => button.reply(reply),
    deferReply: (options) => button.deferReply(options),
    editReply: (options) => button.editReply(options),
    update: (options) => button.update(options),
  };
}

/** The discord.js Read and confirmed button press as the Raid planning reads it. */
function raidConfirmLike(button: ButtonInteraction): RaidConfirmPress {
  return {
    customId: button.customId,
    user: { id: button.user.id },
    memberRoles: () => rolesOfMember(button.member),
    reply: (reply) => button.reply(reply),
  };
}

/** The discord.js /event-invitations command as the Event Invitations read it: the caller by id, the option and the private reply. */
function eventInvitationsLike(command: ChatInputCommandInteraction): EventInvitationsInteraction {
  return {
    user: { id: command.user.id },
    options: { getString: (name) => command.options.getString(name) },
    reply: (reply) => command.reply(reply),
  };
}

/** The discord.js /booty-alerts command as the Booty Alerts reads it: the caller and the options, and the private reply. */
function bootyAlertsLike(command: ChatInputCommandInteraction): BootyAlertsInteraction {
  return {
    user: command.user,
    options: { getString: (name) => command.options.getString(name) },
    reply: async (options) => {
      await command.reply(options);
    },
  };
}

/**
 * The Discord server as a Booty Call uses it: the holders of an Alliance role by its name (from the REST member listing),
 * presences from the cache only, posts to a channel and the log. A channel that is not a guild text channel cannot be posted to.
 */
function bootyServerOf(guild: Guild, channels: OnboardingChannels): BootyCallServer {
  return {
    holdersOf: async (roleName) => {
      const members = await everyMemberOf(guild);
      return members
        .filter((member) => [...member.roles.cache.values()].some((role) => role.name === roleName))
        .map((member) => member.id);
    },
    presenceOf: (memberId) => Promise.resolve(presenceStatusOf(guild.presences.cache.get(memberId)?.status)),
    post: async (channelId, message) => {
      const channel = await guild.channels.fetch(channelId);
      if (channel?.type !== ChannelType.GuildText) throw new Error(`The channel ${channelId} is not a guild text channel.`);
      const sent = await channel.send(message);
      return sent.url;
    },
    // Mentions are off in the log: a line names a Member by id, and must not ping them.
    log: (line) => channels.log({ content: line, allowedMentions: { parse: [] } }),
  };
}

/** Resolves once the client is ready; a client that is already ready resolves at once. */
function whenReady(client: Client): Promise<void> {
  if (client.isReady()) return Promise.resolve();
  return new Promise((resolve) => {
    client.once(Events.ClientReady, () => {
      resolve();
    });
  });
}

/** One line per channel problem, naming the configuration setting that points at the channel. */
function describeChannelProblem(problem: ChannelProblem): string {
  const setting = problem.channel === "onboarding" ? "DISCORD_ONBOARDING_CHANNEL_ID" : "DISCORD_LOG_CHANNEL_ID";
  switch (problem.kind) {
    case "missing-channel":
      return `${setting}: no channel of this server has that ID`;
    case "not-text-channel":
      return `${setting}: the channel is not a text channel`;
    case "missing-permission":
      return `${setting}: Neil lacks the ${problem.permission} permission in the channel`;
  }
}

/** Logs in, checks the onboarding and log channels, and answers commands and Interview events until disconnected. A rejected login or a failed check rejects. */
export async function connect(token: string, options: ConnectOptions): Promise<{ disconnect(): Promise<void> }> {
  const logError = (message: string): void => {
    console.error(message);
  };
  // One store for every pick list: the lookups open them, the pick handler answers them.
  const pickSessions = new PickSessions();
  // The Officer Link confirmations waiting for their Officer's button press.
  const linkConfirmations = new PendingLinkConfirmations();
  const now = options.now;
  // One store for every paged /reaper answer: the list and closest answers open them, the page buttons turn them.
  const reaperPages = new ReaperPages<ReaperPageContent>();
  // The lookups' view of the Officers and the Daily Allowance: the same for /player, /alliance, the pick lists and Overview.
  const lookupRoles = {
    officerRoleIds: options.officerRoleIds,
    allowance: () => options.allowance.allowance(),
    usage: (caller: LookupCaller): string =>
      usageLine({
        used: options.allowance.usageOf(caller.memberId),
        allowance: options.allowance.allowance(),
        officer: caller.officer,
      }),
  };
  // The NaP line of every Alliance card, read from the NaP register; none for an Alliance outside the Home Kingdom.
  const napStatus: NapStatusOf = (alliance) => napStatusOf(options.nap.history(), options.homeKingdom, alliance);
  const allianceContext: AllianceLookupContext = {
    gameApi: options.gameApi,
    pickSessions,
    now,
    logError,
    ...lookupRoles,
    homeKingdom: options.homeKingdom,
    knownAlliances: options.knownAlliances,
    napStatusOf: napStatus,
  };
  // The Look again button repeats a card, an Overview or /reaper closest, so it has what those lookups have.
  const lookAgainContext: LookAgainContext = {
    gameApi: options.gameApi,
    pickSessions,
    links: options.links,
    reaper: options.reaper,
    pages: reaperPages,
    homeKingdom: options.homeKingdom,
    now,
    logError,
    ...lookupRoles,
    napStatusOf: napStatus,
  };
  // Interview and Rank Approval events wait here until ready and the channel check have passed; then they reach the services.
  let openServices: (services: Services) => void = () => undefined;
  const services = new Promise<Services>((resolve) => {
    openServices = resolve;
  });
  const client: Client = createClient(
    {
      ping: (interaction) =>
        handlePing(interaction, {
          now: Date.now,
          gatewayPingMs: () => client.ws.ping,
          buildInfo: options.buildInfo,
          startRecord: options.startRecord,
          logError,
        }),
      player: (interaction) =>
        handlePlayer(lookupLike(interaction), {
          gameApi: options.gameApi,
          pickSessions,
          now,
          logError,
          ...lookupRoles,
        }),
      alliance: (interaction) => handleAlliance(lookupLike(interaction), allianceContext),
      allianceAutocomplete: (interaction) =>
        answer("/alliance autocomplete", { logError }, () =>
          handleAllianceAutocomplete(interaction, { knownAlliances: options.knownAlliances, now, logError }),
        ),
      pick: async (press) => (await services).pick(pickLike(press)),
      reaperClosest: (interaction) =>
        handleReaperClosest(interaction, {
          links: options.links,
          gameApi: options.gameApi,
          reaper: options.reaper,
          pages: reaperPages,
          homeKingdom: options.homeKingdom,
          now,
          logError,
        }),
      reaperList: (interaction) =>
        handleReaperList(interaction, { reaper: options.reaper, pages: reaperPages, now, logError }),
      reaperAdd: async (interaction) => (await services).reaperAdd(interaction),
      reaperRemove: async (interaction) => (await services).reaperRemove(interaction),
      reaperAutocomplete: (interaction) =>
        answer("/reaper autocomplete", { logError }, () =>
          handleReaperAutocomplete(interaction, { reaper: options.reaper }),
        ),
      reaperPage: (button) => handleReaperPage(button, { pages: reaperPages, now, logError }),
      overview: (press) =>
        handleOverview(pickLike(press), { gameApi: options.gameApi, pickSessions, now, logError, ...lookupRoles }),
      lookAgain: (press) => handleLookAgain(lookAgainLike(press), lookAgainContext),
      booty: async (interaction) =>
        answer("/booty", { logError }, async () => {
          const { bootyCalls } = await services;
          await bootyCalls.onCommand(bootyCommandLike(interaction));
        }),
      eventInvitations: (interaction) =>
        handleEventInvitations(eventInvitationsLike(interaction), {
          links: options.links,
          events: options.events,
          logError,
        }),
      eventKinds: (interaction) =>
        handleEventKinds(eventKindsLike(interaction), {
          links: options.links,
          events: options.events,
          officerRoleIds: options.officerRoleIds,
          shield: options.shield,
          now,
          logError,
        }),
      shieldReminders: (interaction) =>
        answer("/shield-reminders", { logError }, async () => (await services).shield.onReminders(shieldRemindersLike(interaction))),
      kvkWeek: (interaction) =>
        answer("/kvk-week", { logError }, async () => (await services).shield.onKvkWeek(kvkWeekLike(interaction))),
      shieldButton: (button) =>
        answer("shield button", { logError }, async () => (await services).shield.onPress(shieldPressLike(button))),
      raidPlan: async (interaction) =>
        answer("/raid-plan", { logError }, async () => {
          const { raidPlanning } = await services;
          await raidPlanning.onCommand(raidPlanLike(interaction));
        }),
      raidPlanAutocomplete: async (interaction) =>
        answer("/raid-plan autocomplete", { logError }, async () => {
          const { raidPlanning } = await services;
          await raidPlanning.onAutocomplete(raidPlanAutocompleteLike(interaction));
        }),
      raidButton: async (button) =>
        answer("raid button", { logError }, async () => {
          const { raidPlanning } = await services;
          await raidPlanning.onConfirm(raidConfirmLike(button));
        }),
      availabilityButton: async (button) =>
        answer("availability button", { logError }, async () => {
          const { availabilityPoll } = await services;
          await availabilityPoll.onButton(availabilityPressLike(button));
        }),
      bootyAlerts: (interaction) =>
        handleBootyAlerts(bootyAlertsLike(interaction), {
          links: options.links,
          bootyAlerts: options.bootyAlerts,
          logError,
        }),
      bootyAlertsAutocomplete: (interaction) =>
        answer("/booty-alerts autocomplete", { logError }, () => handleTimeZoneAutocomplete(interaction)),
      bootyButton: async (button) =>
        answer("booty button", { logError }, async () => {
          const { bootyCalls } = await services;
          await bootyCalls.onButton(bootyButtonLike(button));
        }),
      quota: (interaction) =>
        handleQuota(
          {
            memberRoleIds: () => memberRoleIds(interaction.member),
            reply: (reply) => interaction.reply(reply),
          },
          {
            quotaToday: () => options.gameApi.quotaToday(),
            quotaReserve: options.quotaReserve,
            allowance: options.allowance,
            officerRoleIds: options.officerRoleIds,
            now: () => new Date(),
            logError,
          },
        ),
      usage: (interaction) =>
        handleUsage(usageLike(interaction), {
          allowance: options.allowance,
          officerRoleIds: options.officerRoleIds,
          now,
          logError,
        }),
      help: (interaction) =>
        handleHelp(
          {
            memberRoleIds: () => memberRoleIds(interaction.member),
            reply: (reply) => interaction.reply(reply),
            followUp: (reply) => interaction.followUp(reply),
          },
          { commands, officerRoleIds: options.officerRoleIds, logError },
        ),
      memberJoined: async (member) => (await services).interviews.onMemberJoined(member),
      memberOnline: async (member) => (await services).interviews.onMemberOnline(member),
      memberLeft: async (member) => (await services).interviews.onMemberLeft(member),
      scheduledEventCreated: (scheduledEvent) =>
        answer("the scheduled event created", { logError }, async () =>
          (await services).eventInvitations.onCreated(scheduledEvent),
        ),
      scheduledEventUpdated: (scheduledEvent) =>
        answer("the scheduled event updated", { logError }, async () =>
          (await services).eventInvitations.onUpdated(scheduledEvent),
        ),
      scheduledEventDeleted: (scheduledEvent) =>
        answer("the scheduled event deleted", { logError }, async () => {
          const eventId = eventIdOf(scheduledEvent);
          if (eventId !== undefined) (await services).eventReminders.onDeleted(eventId);
        }),
      interview: async (interaction) => (await services).interviews.onCommand(commandLike(interaction)),
      unlink: async (interaction) => (await services).corrections.unlink(correctionLike(interaction)),
      rank: async (interaction) => (await services).corrections.rank(correctionLike(interaction)),
      link: async (interaction) => (await services).corrections.link(correctionLike(interaction)),
      linkButton: (button) =>
        answer("link button", { logError }, async () => {
          const { corrections } = await services;
          await corrections.linkButton(linkButtonLike(button));
        }),
      interviewButton: async (button) => (await services).interviews.onButton(buttonLike(button)),
      interviewModal: async (modal) => (await services).interviews.onModalSubmit(modalLike(modal)),
      rankButton: (button) =>
        answer("rank button", { logError }, async () => {
          const { rankApprovals } = await services;
          await rankApprovals.onButton(rankButtonLike(button));
        }),
      channels: async (interaction) => (await services).preferenceChoices.showChannels(channelsCommandLike(interaction)),
      preferencesPress: async (press) => (await services).preferenceChoices.press(preferencesPressLike(press)),
      rotation: (interaction) =>
        answer("/rotation", { logError }, async () => routeRotation((await services).cityRotation, interaction)),
      rotationAutocomplete: (interaction) =>
        answer("/rotation autocomplete", { logError }, async () => {
          const typed = interaction.options.getFocused();
          await interaction.respond((await services).cityRotation.allianceChoices(typed));
        }),
      rotationButton: (button) =>
        answer("rotation button", { logError }, async () =>
          (await services).cityRotation.confirm(rotationButtonLike(button)),
        ),
      nap: (interaction) => answer("/nap", { logError }, async () => routeNap(await services, interaction)),
      napButton: (button) =>
        answer("nap button", { logError }, async () => (await services).nap.vote(napButtonLike(button))),
      napMotionButton: (button) =>
        answer("nap motion button", { logError }, async () =>
          (await services).napMotions.vote(napMotionButtonLike(button)),
        ),
      napRulesModal: (modal) =>
        answer("nap rules form", { logError }, async () => (await services).napRules.submit(napRulesModalLike(modal))),
      kingMoveButton: (button) =>
        answer("king move button", { logError }, async () => (await services).kingMoves.apply(kingMoveButtonLike(button))),
    },
    { guildId: options.guildId, logError },
  );
  // The sweeper and the Daily Sync run from the moment the channels are checked (the Daily Sync from the end of the startup
  // apply); both are stopped again on disconnect.
  let stopSweeper: () => void = () => undefined;
  let stopEventReminders: () => void = () => undefined;
  let stopDailySync: () => Promise<void> = () => Promise.resolve();
  // The startup check of the Interviews of the Members online, while it runs: disconnect waits for it before the client
  // (and the database after it) goes.
  let startupInterviews: Promise<void> = Promise.resolve();
  let disconnecting = false;
  try {
    await client.login(token);
    await whenReady(client);
    const guild = await client.guilds.fetch(options.guildId);
    const channelIds = { onboardingChannelId: options.onboardingChannelId, logChannelId: options.logChannelId };
    const problems = await checkChannels(guild, channelIds);
    if (problems.length > 0) {
      throw new Error(
        ["The onboarding or log channel cannot be used:", ...problems.map((problem) => `- ${describeChannelProblem(problem)}`)].join("\n"),
      );
    }
    const [moderatorRoleId, kingRoleId] = options.officerRoleIds;
    const officerRoles = { moderatorRoleId, kingRoleId };
    const channels = createOnboardingChannels(guild, channelIds);
    // /booty: the Game API is asked only through the uncharged lookup, the roles and presences come from the server.
    const bootyCalls = createBootyCalls({
      links: options.links,
      bootyAlerts: options.bootyAlerts,
      game: options.gameApi,
      server: bootyServerOf(guild, channels),
      now,
      logError,
    });
    // One Onboarding Role service and one Doctor Role service, for every path that gives or takes the roles off.
    const onboardingRole = createOnboardingRole({
      members: serverMembersOf(guild),
      links: options.links,
      preferences: options.preferences,
      logError,
      log: (message) => channels.log(message),
      officerRoleIds: options.officerRoleIds,
    });
    const doctorRole = createDoctorRole({
      members: serverMembersOf(guild),
      links: options.links,
      logError,
      log: (message) => channels.log(message),
      officerRoleIds: options.officerRoleIds,
    });
    // A private message to a Member, by Discord DM; Discord refuses it when the Member cannot be messaged.
    const sendPrivateMessage = async (memberId: string, message: BaseMessageOptions): Promise<void> => {
      const user = await client.users.fetch(memberId);
      await user.send(message);
    };
    const preferenceRoles = createPreferenceRoles({
      members: serverMembersOf(guild),
      links: options.links,
      preferences: options.preferences,
      applied: options.applied,
      homeKingdom: options.homeKingdom,
      channels,
      logError,
      // A change of roles is one plain line in the log channel, without mentions; a refused post is logged and the change stands.
      log: (line) => {
        channels.log({ content: line, allowedMentions: { parse: [] } }).catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          logError(`Logging a Preference Roles change failed: ${reason}`);
        });
      },
      officerRoleIds: options.officerRoleIds,
    });
    // The Preferences message's presses and /channels: the same stores, roles and log as the Interview's Preferences.
    const preferenceChoices = createPreferenceChoices({
      roles: preferenceRoles,
      preferences: options.preferences,
      links: options.links,
      rankApprovals: options.links,
      applied: options.applied,
      homeKingdom: options.homeKingdom,
      channels,
      onboardingRole,
      guidesForumId: options.guidesForumId,
      logError,
    });
    const unlink = createUnlink({
      links: options.links,
      applied: options.applied,
      channels,
      members: serverMembersOf(guild),
      onboardingRole,
      doctorRole,
      preferenceRoles,
      bootyAlerts: options.bootyAlerts,
      events: options.events,
      availability: options.availability,
      shield: options.shield,
      now,
      sendPrivateMessage,
      officerRoles,
      logError,
    });
    const nameAndRoles = createNameAndRoles({
      members: serverMembersOf(guild),
      applied: options.applied,
      links: options.links,
      gameApi: options.gameApi,
      unlink,
      preferenceRoles,
      homeKingdom: options.homeKingdom,
      troopBracketLevels: options.troopBracketLevels,
      officerRoleIds: options.officerRoleIds,
      log: (message) => channels.log(message),
      now,
      logError,
    });
    const rankApprovals = createRankApprovals({
      links: options.links,
      preferences: options.preferences,
      channels,
      nameAndRoles,
      onboardingRole,
      officerRoles,
      memberRoleIdsOf: (memberId) =>
        guild.members.fetch(memberId).then(
          (member) => memberRoleIds(member),
          () => [],
        ),
      now,
      logError,
    });
    const isOnServer = (memberId: string): Promise<boolean> =>
      guild.members.fetch(memberId).then(
        () => true,
        () => false,
      );
    const interviews = createInterviews({
      interviews: options.interviews,
      links: options.links,
      channels,
      gameApi: options.gameApi,
      officerRoles,
      rankApprovals,
      nameAndRoles,
      unlink,
      onboardingRole,
      doctorRole,
      preferences: createPreferencesAfterLink({
        preferences: options.preferences,
        channels,
        guidesForumId: options.guidesForumId,
        homeKingdom: options.homeKingdom,
        now,
      }),
      sendPrivateMessage,
      isOnServer,
      homeKingdom: options.homeKingdom,
      now,
      logError,
    });
    const corrections = {
      unlink: (interaction: CorrectionInteraction) =>
        handleUnlink(interaction, { links: options.links, unlink, officerRoles, logError }),
      rank: (interaction: CorrectionInteraction) =>
        handleRank(interaction, {
          links: options.links,
          preferences: options.preferences,
          channels,
          nameAndRoles,
          onboardingRole,
          officerRoles,
          now,
          logError,
        }),
      link: (interaction: LinkInteraction) =>
        handleLink(interaction, {
          links: options.links,
          interviews: options.interviews,
          gameApi: options.gameApi,
          isOnServer,
          officerRoles,
          confirmations: linkConfirmations,
          now,
          logError,
        }),
      linkButton: (button: LinkButtonInteraction) =>
        handleLinkButton(button, {
          links: options.links,
          interviews: options.interviews,
          channels,
          rankApprovals,
          nameAndRoles,
          onboardingRole,
          doctorRole,
          homeKingdom: options.homeKingdom,
          isOnServer,
          sendPrivateMessage,
          confirmations: linkConfirmations,
          now,
          logError,
        }),
    };
    // The /reaper add and remove contexts and the pick context share the channels, so they are built once the checks pass.
    const editorOfMember = (memberId: MemberId) => editorOf({ links: options.links, applied: options.applied }, memberId);
    const reaperWrites = {
      editorOf: editorOfMember,
      homeKingdom: options.homeKingdom,
      napHistory: () => options.nap.history(),
      officerRoleIds: options.officerRoleIds,
      reaper: options.reaper,
      channels,
      logError,
    };
    const pickContext: PickContext = {
      gameApi: options.gameApi,
      pickSessions,
      now,
      logError,
      ...lookupRoles,
      reaper: options.reaper,
      channels,
      editorOf: editorOfMember,
      homeKingdom: options.homeKingdom,
      napHistory: () => options.nap.history(),
      napStatusOf: napStatus,
    };
    // The Event invitations and reminders read the server through one adapter, and log to #neil-log like the rest.
    const eventServer = eventServerOf(guild, { log: (message) => channels.log(message) });
    const eventInvitations = createEventInvitations({
      events: options.events,
      links: options.links,
      server: eventServer,
      officerRoleIds: options.officerRoleIds,
      now,
      logError,
    });
    const eventReminders = createEventReminders({
      events: options.events,
      links: options.links,
      applied: options.applied,
      homeKingdom: options.homeKingdom,
      server: eventServer,
      now,
      logError,
    });
    // The Duel Plan goes to #event-announcements on the same one-minute tick as the Event Reminders.
    const duelPlan = createDuelPlanPoster({
      server: eventServer,
      events: options.events,
      plan: DUEL_PLAN,
      now,
      logError,
    });
    // The Handover Reminders go to #nap-leaders, and the next Holding Alliance to #home-kingdom-announcements, on the same
    // one-minute tick as the Event Reminders.
    const handoverReminders = createHandoverReminders({
      server: eventServer,
      rotation: options.cityRotation,
      handovers: options.handovers,
      mode: options.cityRotationMode,
      now,
      logError,
    });
    // The King Move (ADR 21): after each Handover a card in #neil-log; only an Officer's Apply moves the King role, and
    // the adapter can reach no other role.
    const kingMoves = createKingMoves({
      store: options.kingMoves,
      links: options.links,
      gameApi: options.gameApi,
      server: kingMoveServerOf(
        {
          channels: { fetch: (channelId) => guild.channels.fetch(channelId) },
          addRole: (memberId, roleId) => guild.members.addRole({ user: memberId, role: roleId }),
          removeRole: (memberId, roleId) => guild.members.removeRole({ user: memberId, role: roleId }),
          everyMember: async () =>
            (await everyMemberOf(guild)).map((member) => ({ id: member.id, roleIds: [...member.roles.cache.keys()] })),
          isOnServer,
        },
        { kingRoleId, logChannelId: options.logChannelId, log: (message) => channels.log(message) },
      ),
      homeKingdom: options.homeKingdom,
      officerRoleIds: options.officerRoleIds,
      now,
      logError,
    });
    // The City Rotation: its card in #nap-announcements, its Handover in #nap-leaders, its lines in #neil-log.
    const cityRotationServer = cityRotationServerOf(guild, { log: (message) => channels.log(message) });
    const cityRotation = createCityRotation({
      store: options.cityRotation,
      knownAlliances: options.knownAlliances,
      links: options.links,
      editorOf: editorOfMember,
      gameApi: options.gameApi,
      server: cityRotationServer,
      homeKingdom: options.homeKingdom,
      mode: options.cityRotationMode,
      officerRoleIds: options.officerRoleIds,
      now,
      logError,
      onHandover: (holdingTag) => kingMoves.afterHandover(holdingTag),
    });
    // The NaP register: its join requests and leaves in #nap-leaders, its list and announcements in #nap-announcements,
    // through the City Rotation's server, so the channels are named once; its lines in #neil-log.
    const nap = createNap({
      store: options.nap,
      knownAlliances: options.knownAlliances,
      editorOf: editorOfMember,
      server: cityRotationServer,
      homeKingdom: options.homeKingdom,
      officerRoleIds: options.officerRoleIds,
      now,
      logError,
    });
    // NaP Motions (ADR 25): posted, reminded and closed in #nap-leaders, their decision log in #nap-announcements, through
    // the same server as the NaP register; their lines in #neil-log.
    const napMotions = createNapMotions({
      store: options.napMotions,
      napHistory: () => options.nap.history(),
      links: options.links,
      knownAlliances: options.knownAlliances,
      editorOf: editorOfMember,
      server: cityRotationServer,
      homeKingdom: options.homeKingdom,
      now,
      logError,
    });
    // The NaP Rules (ADR 26): proposed through a NaP Motion, settled on the tick after the NaP Motions', announced in
    // #nap-announcements through the same server; their lines in #neil-log.
    const napRules = createNapRules({
      store: options.napRules,
      motions: napMotions,
      motionOf: (id) => options.napMotions.get(id),
      server: cityRotationServer,
      now,
      logError,
    });
    // The NaP Reports (ADR 28): a private thread under #nap-leaders per report, outcomes decided by NaP Motion and
    // settled on the tick after the NaP Rules', carried out through the NaP register and REAPER, and announced in
    // #nap-announcements through the same server; their lines in #neil-log.
    const napReports = createNapReports({
      store: options.napReports,
      motions: napMotions,
      motionOf: (id) => options.napMotions.get(id),
      napHistory: () => options.nap.history(),
      links: options.links,
      editorOf: editorOfMember,
      homeKingdom: options.homeKingdom,
      server: cityRotationServer,
      expel: (tag, by, motionId) => nap.expel(tag, by, motionId),
      readPlayer: (uid) => options.gameApi.getPlayer(uid, "lookup", "copy"),
      exiles: { reaper: options.reaper, channels, now, logError },
      now,
      logError,
    });
    // The Raid: /raid-plan and its button, and the clock of its notices, on the same one-minute tick after the Duel Plan.
    const raidServer = raidServerOf(guild, { log: (message) => channels.log(message) });
    const raidPlanning = createRaidPlanning({
      raids: options.raids,
      links: options.links,
      server: raidServer,
      settings: options.raidSettings,
      now,
      logError,
    });
    const raidClock: RaidClock = createRaidClock({
      raids: options.raids,
      server: raidServer,
      settings: options.raidSettings,
      now,
      logError,
    });
    // The Availability Poll: its buttons and its clock edit the same cards, after the Raid clock on the one-minute tick.
    const availabilityBoard = createAvailabilityBoard({ availability: options.availability, server: raidServer });
    const availabilityPoll = createAvailabilityPoll({
      availability: options.availability,
      raids: options.raids,
      links: options.links,
      game: options.gameApi,
      server: raidServer,
      settings: options.raidSettings,
      thresholds: options.fighterClassThresholds,
      troopBracketLevels: options.troopBracketLevels,
      now,
      logError,
      board: availabilityBoard,
    });
    const availabilityClock: AvailabilityClock = createAvailabilityClock({
      availability: options.availability,
      raids: options.raids,
      server: raidServer,
      settings: options.raidSettings,
      now,
      logError,
      board: availabilityBoard,
    });
    // Shield Reminders (slice 045): /kvk-week, /shield-reminders and the Shielded button, and the reminders and Shield
    // Lists on the one-minute tick after the Availability clock.
    const shield = createShieldCommands({
      shield: options.shield,
      links: options.links,
      officerRoleIds: options.officerRoleIds,
      now,
      log: (line) => channels.log({ content: line, allowedMentions: { parse: [] } }),
      logError,
    });
    const shieldReminders = createShieldReminders({
      shield: options.shield,
      events: options.events,
      links: options.links,
      server: shieldServerOf(guild, { log: (message) => channels.log(message) }),
      now,
      logError,
    });
    openServices({
      shield,
      cityRotation,
      kingMoves,
      nap,
      napMotions,
      napRules,
      napReports,
      raidPlanning,
      availabilityPoll,
      interviews,
      rankApprovals,
      eventInvitations,
      eventReminders,
      corrections,
      preferenceChoices,
      bootyCalls,
      reaperAdd: (interaction) =>
        handleReaperAdd(reaperAddLike(interaction), {
          ...reaperWrites,
          gameApi: options.gameApi,
          pickSessions,
          now,
        }),
      reaperRemove: (interaction) => handleReaperRemove(reaperAddLike(interaction), reaperWrites),
      pick: (interaction) => handlePick(interaction, pickContext),
    });
    // The startup sweeps of the Onboarding Role, then the Doctor Role, then the Interviews of the Members online, chained so
    // their log lines and role changes do not interleave, and run in the background, so login does not wait for them. The
    // Interview check is skipped once disconnect has begun, and stops before the next Member when it has. The Daily Sync
    // starts once the startup apply has settled, so their Game API lookups do not overlap.
    const startOnlineInterviews = (): Promise<void> =>
      onlineMembersOf(guild, logError, () => disconnecting)
        .then((members) => interviews.onlineAtStartup(members, () => disconnecting))
        .catch((error: unknown) => {
          logError(`Starting the Interviews of the Members online at startup failed: ${String(error)}`);
        });
    void onboardingRole
      .atStartup()
      .catch((error: unknown) => {
        logError(`Bringing the Onboarding Role of the Members up to date at startup failed: ${String(error)}`);
      })
      .then(() => doctorRole.atStartup())
      .catch((error: unknown) => {
        logError(`Bringing the Doctor Role of the Members up to date at startup failed: ${String(error)}`);
      })
      .then(() => {
        if (disconnecting) return;
        startupInterviews = startOnlineInterviews();
        return startupInterviews;
      });
    void nameAndRoles
      .atStartup()
      .catch((error: unknown) => {
        logError(`Giving the Linked Members their name and roles at startup failed: ${String(error)}`);
      })
      .then(() => {
        if (disconnecting) return;
        stopDailySync = startDailySync(
          {
            links: options.links,
            applied: options.applied,
            runs: options.dailySync,
            members: serverMembersOf(guild),
            gameApi: options.gameApi,
            nameAndRoles,
            preferenceRoles,
            unlink,
            share: options.syncShare,
            quotaReserve: options.quotaReserve,
            log: (message) => channels.log(message),
            logError,
            now,
          },
          options.syncHourUtc,
          (run, everyMs) => {
            const timer = setInterval(run, everyMs);
            return () => {
              clearInterval(timer);
            };
          },
        );
      });
    void reportServerPermissions(guild, (message) => channels.log(message), logError);
    const sweeper = createSweeper({
      interviews: options.interviews,
      links: options.links,
      preferences: options.preferences,
      channels,
      onboardingRole,
      timeoutMs: options.interviewTimeoutMs,
      now,
      logError,
      linkChosen: interviews.linkChosen,
    });
    stopSweeper = startSweeper(sweeper, (run, everyMs) => {
      const timer = setInterval(run, everyMs);
      return () => {
        clearInterval(timer);
      };
    });
    // The Events ahead are invited at startup; the reminders, the Duel Plan, the Handover Reminders, then the City Rotation,
    // the NaP Votes, the NaP Motions, the NaP Rules and the Raid clock are ticked once a minute, until disconnect stops them.
    void eventInvitations.onStartup();
    // The pinned City Rotation card is brought up to date once at startup.
    void cityRotation.refreshCard();
    // The pinned NaP list is brought up to date once at startup.
    void nap.refreshList();
    // A tick still running when the next minute comes is skipped, so one slow tick never posts twice.
    let reminderTickRunning = false;
    const reminderTimer = setInterval(() => {
      if (reminderTickRunning) return;
      reminderTickRunning = true;
      void eventReminders
        .tick()
        .then(() => duelPlan.tick())
        .then(() => handoverReminders.tick())
        .then(() => cityRotation.tick())
        .then(() => nap.tick())
        .then(() => napMotions.tick())
        .then(() => napRules.tick())
        .then(() => napReports.tick())
        .then(() => raidClock.tick())
        .then(() => availabilityClock.tick())
        .then(() => shieldReminders.tick())
        .finally(() => {
          reminderTickRunning = false;
        });
    }, REMINDER_TICK_MS);
    stopEventReminders = () => {
      clearInterval(reminderTimer);
    };
  } catch (error) {
    disconnecting = true;
    stopSweeper();
    stopEventReminders();
    await stopDailySync();
    await startupInterviews;
    await client.destroy();
    throw error;
  }
  return {
    disconnect: async () => {
      disconnecting = true;
      stopSweeper();
      stopEventReminders();
      // A run in progress ends before its next request and is awaited, so its record and summary are made before logout.
      await stopDailySync();
      // The Interview check stops before its next Member, and is awaited, so its log line is made before logout.
      await startupInterviews;
      await client.destroy();
    },
  };
}
