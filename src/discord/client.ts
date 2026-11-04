import {
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
} from "discord.js";
import { z } from "zod";
import type { BuildInfo } from "../build-info.js";
import type { GameApiClient } from "../game-api/client.js";
import type { KingdomNumber } from "../domain/lookup-input.js";
import type { StartRecord } from "../domain/start-record.js";
import type { AppliedStore } from "../storage/applied-store.js";
import type { DailySyncStore } from "../storage/daily-sync-store.js";
import type { InterviewStore } from "../storage/interview-store.js";
import type { KnownAllianceStore } from "../storage/known-alliance-store.js";
import type { LinkStore } from "../storage/link-store.js";
import type { PreferenceStore } from "../storage/preference-store.js";
import { handleAllianceAutocomplete } from "./alliance-autocomplete.js";
import {
  createInterviews,
  type ButtonInteractionLike,
  type CommandLike,
  type Interviews,
  type JoinedMember,
  type LeftMember,
  type ModalInteractionLike,
} from "./interview.js";
import { startDailySync } from "./daily-sync.js";
import { createSweeper, startSweeper } from "./interview-sweeper.js";
import { checkChannels, createOnboardingChannels, type ChannelProblem } from "./onboarding-channels.js";
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
  type AllianceLookupContext,
  type LookupApi,
  type LookupInteraction,
} from "./lookup.js";
import { handleOverview, handlePick, type PickInteraction } from "./pick.js";
import { PickSessions } from "./pick-sessions.js";
import { handleQuota } from "./quota.js";

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
  readonly player: (interaction: LookupInteraction) => Promise<void>;
  readonly alliance: (interaction: LookupInteraction) => Promise<void>;
  /** An autocomplete request of /alliance, for its name or tag option. */
  readonly allianceAutocomplete: (interaction: AutocompleteInteraction) => Promise<void>;
  readonly quota: (interaction: QuotaCommandInteraction) => Promise<void>;
  /** The /channels command: a Linked Member sees their Preferences message, privately, and changes nothing. */
  readonly channels: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** A button or string select menu of a pick list, whose custom id starts with `pick:`. */
  readonly pick: (interaction: PickInteraction) => Promise<void>;
  /** A button whose custom id starts with `overview:`, the page buttons of an Alliance Overview. */
  readonly overview: (interaction: PickInteraction) => Promise<void>;
  /** A guild member joined the server; the Interview may start for them. */
  readonly memberJoined: (member: JoinedMember) => Promise<void>;
  /** A guild member left the server; their open Interview and pending Rank Approval end. */
  readonly memberLeft: (member: LeftMember) => Promise<void>;
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
}

/** The services that exist once the client is ready and the channels are checked. */
interface Services {
  readonly interviews: Interviews;
  readonly rankApprovals: RankApprovals;
  /** /unlink, /rank and /link, and the Officer Link buttons, as the Discord client routes them. */
  readonly corrections: {
    readonly unlink: (interaction: CorrectionInteraction) => Promise<void>;
    readonly rank: (interaction: CorrectionInteraction) => Promise<void>;
    readonly link: (interaction: LinkInteraction) => Promise<void>;
    readonly linkButton: (button: LinkButtonInteraction) => Promise<void>;
  };
  /** The Preferences message's presses and /channels. */
  readonly preferenceChoices: PreferenceChoices;
}

/** The custom id prefix of every pick list component; other component custom ids are not Neil's. */
const PICK_PREFIX = "pick:";
/** The custom id prefix of every Alliance Overview page button. */
const OVERVIEW_PREFIX = "overview:";
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

/** A discord.js client with the Guilds and GuildMembers intents that routes each event to its handler. */
export function createClient(handlers: CommandHandlers, options: ClientOptions): Client {
  const logError = options.logError ?? console.error;
  // Partials let a Member who left uncached still be announced: GuildMemberRemove is emitted for them, with their user.
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
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
      }
      return;
    }
    if (interaction.isAutocomplete()) {
      if (interaction.commandName === "alliance") void handlers.allianceAutocomplete(interaction);
      return;
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith(INTERVIEW_PREFIX)) void handlers.interviewModal(interaction);
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
      } else if (interaction.customId.startsWith(PREFERENCES_PREFIX)) {
        void handlers.preferencesPress(interaction);
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
  /** The Preferences and the open Preferences messages, in neil.db. */
  readonly preferences: PreferenceStore;
  /** The guides forum channel from DISCORD_GUIDES_FORUM_ID, named in the guides line; undefined when not set. */
  readonly guidesForumId: string | undefined;
  /** The hour (UTC) the Daily Sync runs at, from SYNC_HOUR_UTC. */
  readonly syncHourUtc: number;
  /** The most Game API requests one Daily Sync run may send, from SYNC_SHARE. */
  readonly syncShare: number;
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
      const members = await guild.members.fetch();
      const me = guild.members.me ?? (await guild.members.fetchMe());
      const botTopRolePosition = me.roles.highest.position;
      return [...members.values()].map((member) => ({
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
  const allianceContext: AllianceLookupContext = {
    gameApi: options.gameApi,
    pickSessions,
    now,
    logError,
    homeKingdom: options.homeKingdom,
    knownAlliances: options.knownAlliances,
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
        handlePlayer(interaction, { gameApi: options.gameApi, pickSessions, now, logError }),
      alliance: (interaction) => handleAlliance(interaction, allianceContext),
      allianceAutocomplete: (interaction) =>
        answer("/alliance autocomplete", { logError }, () =>
          handleAllianceAutocomplete(interaction, { knownAlliances: options.knownAlliances, now, logError }),
        ),
      pick: (interaction) => handlePick(interaction, { gameApi: options.gameApi, pickSessions, now, logError }),
      overview: (interaction) => handleOverview(interaction, { gameApi: options.gameApi, pickSessions, now, logError }),
      quota: (interaction) =>
        handleQuota(
          {
            memberRoleIds: () => memberRoleIds(interaction.member),
            reply: (reply) => interaction.reply(reply),
          },
          {
            quotaToday: () => options.gameApi.quotaToday(),
            quotaReserve: options.quotaReserve,
            officerRoleIds: options.officerRoleIds,
            now: () => new Date(),
            logError,
          },
        ),
      memberJoined: async (member) => (await services).interviews.onMemberJoined(member),
      memberLeft: async (member) => (await services).interviews.onMemberLeft(member),
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
    },
    { guildId: options.guildId, logError },
  );
  // The sweeper and the Daily Sync run from the moment the channels are checked (the Daily Sync from the end of the startup
  // apply); both are stopped again on disconnect.
  let stopSweeper: () => void = () => undefined;
  let stopDailySync: () => Promise<void> = () => Promise.resolve();
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
    // One Onboarding Role service for every path that gives or takes the role off.
    const onboardingRole = createOnboardingRole({
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
      channels,
      guidesForumId: options.guidesForumId,
      logError,
    });
    const unlink = createUnlink({
      links: options.links,
      applied: options.applied,
      channels,
      members: serverMembersOf(guild),
      onboardingRole,
      preferenceRoles,
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
      preferences: createPreferencesAfterLink({
        preferences: options.preferences,
        channels,
        guidesForumId: options.guidesForumId,
        now,
      }),
      isOnServer,
      now,
      logError,
    });
    const corrections = {
      unlink: (interaction: CorrectionInteraction) =>
        handleUnlink(interaction, { links: options.links, unlink, officerRoles, logError }),
      rank: (interaction: CorrectionInteraction) =>
        handleRank(interaction, { links: options.links, channels, nameAndRoles, officerRoles, now, logError }),
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
          isOnServer,
          sendPrivateMessage,
          confirmations: linkConfirmations,
          now,
          logError,
        }),
    };
    openServices({ interviews, rankApprovals, corrections, preferenceChoices });
    // The startup sweep of the Onboarding Role and the startup apply run in the background, so login does not wait for
    // them. The Daily Sync starts once the startup apply has settled, so their Game API lookups do not overlap.
    void onboardingRole.atStartup().catch((error: unknown) => {
      logError(`Bringing the Onboarding Role of the Members up to date at startup failed: ${String(error)}`);
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
  } catch (error) {
    disconnecting = true;
    stopSweeper();
    await stopDailySync();
    await client.destroy();
    throw error;
  }
  return {
    disconnect: async () => {
      disconnecting = true;
      stopSweeper();
      // A run in progress ends before its next request and is awaited, so its record and summary are made before logout.
      await stopDailySync();
      await client.destroy();
    },
  };
}
