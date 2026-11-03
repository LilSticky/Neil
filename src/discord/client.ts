import {
  Client,
  Events,
  type BaseMessageOptions,
  GatewayIntentBits,
  GuildMember,
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
import type { InterviewStore } from "../storage/interview-store.js";
import type { LinkStore } from "../storage/link-store.js";
import {
  createInterviews,
  type ButtonInteractionLike,
  type CommandLike,
  type Interviews,
  type JoinedMember,
  type LeftMember,
  type ModalInteractionLike,
} from "./interview.js";
import { createSweeper, startSweeper } from "./interview-sweeper.js";
import { checkChannels, createOnboardingChannels, type ChannelProblem } from "./onboarding-channels.js";
import { createNameAndRoles, type ServerMembers } from "./name-and-roles.js";
import { reportRolePermissions } from "./role-permissions.js";
import type { RoleLike, RolesGuild, RolesMember } from "./member-roles.js";
import { createRankApprovals, type RankApprovals, type RankButtonLike } from "./rank-approval.js";
import { handlePing, type PingInteraction } from "./ping.js";
import { answer, handleAlliance, handlePlayer, type LookupApi, type LookupInteraction } from "./lookup.js";
import { handlePick, type PickInteraction } from "./pick.js";
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
  readonly quota: (interaction: QuotaCommandInteraction) => Promise<void>;
  /** A button or string select menu of a pick list, whose custom id starts with `pick:`. */
  readonly pick: (interaction: PickInteraction) => Promise<void>;
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
}

/** The services that exist once the client is ready and the channels are checked. */
interface Services {
  readonly interviews: Interviews;
  readonly rankApprovals: RankApprovals;
}

/** The custom id prefix of every pick list component; other component custom ids are not Neil's. */
const PICK_PREFIX = "pick:";
/** The custom id prefix of every Onboarding Interview button and modal. */
const INTERVIEW_PREFIX = "interview:";
/** The custom id prefix of every Rank Approval button. */
const RANK_PREFIX = "rank:";

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
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
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
  // The member may be partial when they left; their user is still there.
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
        case "interview":
          void handlers.interview(interaction);
          break;
      }
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
      } else if (interaction.customId.startsWith(PICK_PREFIX)) {
        void handlers.pick(interaction);
      }
      return;
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith(INTERVIEW_PREFIX)) {
        void handlers.interviewButton(interaction);
      } else if (interaction.customId.startsWith(PICK_PREFIX)) {
        void handlers.pick(interaction);
      }
    }
  });
  return client;
}

export interface ConnectOptions {
  readonly buildInfo: BuildInfo;
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
  /** The Home Kingdom from config: members of it are Home Kingdom Players. */
  readonly homeKingdom: KingdomNumber;
  /** The first level of each Troop Bracket from config, T1 first. */
  readonly troopBracketLevels: readonly number[];
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
  const now = (): Date => new Date();
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
      alliance: (interaction) =>
        handleAlliance(interaction, { gameApi: options.gameApi, pickSessions, now, logError }),
      pick: (interaction) => handlePick(interaction, { gameApi: options.gameApi, pickSessions, now, logError }),
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
      interviewButton: async (button) => (await services).interviews.onButton(buttonLike(button)),
      interviewModal: async (modal) => (await services).interviews.onModalSubmit(modalLike(modal)),
      rankButton: (button) =>
        answer("rank button", { logError }, async () => {
          const { rankApprovals } = await services;
          await rankApprovals.onButton(rankButtonLike(button));
        }),
    },
    { guildId: options.guildId, logError },
  );
  // The sweeper runs from the moment the channels are checked; stopped again on disconnect.
  let stopSweeper: () => void = () => undefined;
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
    const nameAndRoles = createNameAndRoles({
      members: serverMembersOf(guild),
      applied: options.applied,
      links: options.links,
      gameApi: options.gameApi,
      homeKingdom: options.homeKingdom,
      troopBracketLevels: options.troopBracketLevels,
      officerRoleIds: options.officerRoleIds,
      log: (message) => channels.log(message),
      now,
      logError,
    });
    const rankApprovals = createRankApprovals({
      links: options.links,
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
    const interviews = createInterviews({
      interviews: options.interviews,
      links: options.links,
      channels,
      gameApi: options.gameApi,
      officerRoles,
      rankApprovals,
      nameAndRoles,
      isOnServer: (memberId) => guild.members.fetch(memberId).then(
        () => true,
        () => false,
      ),
      now,
      logError,
    });
    openServices({ interviews, rankApprovals });
    // The startup apply and the permission report run in the background, so login does not wait for them.
    void nameAndRoles.atStartup().catch((error: unknown) => {
      logError(`Giving the Linked Members their name and roles at startup failed: ${String(error)}`);
    });
    void reportServerPermissions(guild, (message) => channels.log(message), logError);
    const sweeper = createSweeper({
      interviews: options.interviews,
      links: options.links,
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
    stopSweeper();
    await client.destroy();
    throw error;
  }
  return {
    disconnect: async () => {
      stopSweeper();
      await client.destroy();
    },
  };
}
