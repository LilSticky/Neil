import {
  Client,
  Events,
  GatewayIntentBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
  type ModalSubmitInteraction,
} from "discord.js";
import { z } from "zod";
import type { BuildInfo } from "../build-info.js";
import type { GameApiClient } from "../game-api/client.js";
import type { StartRecord } from "../domain/start-record.js";
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
  /** A button whose custom id starts with `interview:`. */
  readonly interviewButton: (button: ButtonInteraction) => Promise<void>;
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

/** A discord.js client with the Guilds and GuildMembers intents that routes each event to its handler. */
export function createClient(
  handlers: CommandHandlers,
  logError: (message: string) => void = console.error,
): Client {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  // Without a listener, an emitted error would crash the process; discord.js reconnects by itself.
  client.on(Events.Error, (error) => {
    logError(`Discord client error: ${error.message}`);
  });
  client.on(Events.GuildMemberAdd, (member) => {
    void handlers.memberJoined({ id: member.id, username: member.user.username, bot: member.user.bot });
  });
  // The member may be partial when they left; their user is still there.
  client.on(Events.GuildMemberRemove, (member) => {
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
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith(PICK_PREFIX)) {
      void handlers.pick(interaction);
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
}

/**
 * The discord.js button press as the Interview reads it. discord.js types reply with overloads that the Interview's
 * narrower signatures do not match, so each method is passed on with the one shape Neil uses.
 */
function buttonLike(button: ButtonInteraction): ButtonInteractionLike {
  return {
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
  };
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

/** The discord.js chat-input command as the Interview reads it; see buttonLike for why reply is passed on. */
function commandLike(command: ChatInputCommandInteraction): CommandLike {
  return {
    user: command.user,
    reply: async (message) => {
      await command.reply(message);
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
    logError,
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
    const rankApprovals = createRankApprovals({
      links: options.links,
      channels,
      officerRoles,
      memberRoleIdsOf: (memberId) =>
        guild.members.fetch(memberId).then(
          (member) => memberRoleIds(member),
          () => [],
        ),
      now,
      logError,
    });
    openServices({
      interviews: createInterviews({
        interviews: options.interviews,
        links: options.links,
        channels,
        gameApi: options.gameApi,
        officerRoles,
        rankApprovals,
        isOnServer: (memberId) => guild.members.fetch(memberId).then(
          () => true,
          () => false,
        ),
        now,
        logError,
      }),
      rankApprovals,
    });
    const sweeper = createSweeper({
      interviews: options.interviews,
      links: options.links,
      channels,
      timeoutMs: options.interviewTimeoutMs,
      now,
      logError,
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
