import { Events, GatewayIntentBits, IntentsBitField, MessageFlags, Partials } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import { createClient, memberRoleIds } from "./client.js";

function chatInput(commandName: string) {
  return { isChatInputCommand: () => true, isAutocomplete: () => false, commandName };
}

/** An autocomplete request for a command, on one of its options. */
function autocomplete(commandName: string) {
  return {
    isChatInputCommand: () => false,
    isAutocomplete: () => true,
    isStringSelectMenu: () => false,
    isButton: () => false,
    isModalSubmit: () => false,
    commandName,
  };
}

/** A chat-input command of /reaper, run with the given subcommand. */
function reaperCommand(subcommand: string) {
  return { ...chatInput("reaper"), options: { getSubcommand: () => subcommand } };
}

/** A select menu or button interaction; the custom id decides where it goes. */
function component(kind: "select" | "button", customId: string) {
  return {
    isChatInputCommand: () => false,
    isAutocomplete: () => false,
    isStringSelectMenu: () => kind === "select",
    isButton: () => kind === "button",
    isModalSubmit: () => false,
    customId,
  };
}

/** A modal submit; the custom id decides where it goes. */
function modal(customId: string) {
  return {
    isChatInputCommand: () => false,
    isAutocomplete: () => false,
    isStringSelectMenu: () => false,
    isButton: () => false,
    isModalSubmit: () => true,
    customId,
  };
}

const GUILD_ID = "123456789012345678";
const OTHER_GUILD_ID = "223456789012345678";

/** A guild member as discord.js emits it on guildMemberAdd: the id on the member, the guild and the rest on its user. */
function guildMember(id: string, username: string, bot: boolean, guildId: string = GUILD_ID) {
  return { id, guild: { id: guildId }, user: { id, username, bot } };
}

/** One handler per slash command, pick list interaction, Interview entry point and Rank Approval button. */
function handlers() {
  return {
    ping: vi.fn(() => Promise.resolve()),
    player: vi.fn(() => Promise.resolve()),
    alliance: vi.fn(() => Promise.resolve()),
    allianceAutocomplete: vi.fn(() => Promise.resolve()),
    quota: vi.fn(() => Promise.resolve()),
    usage: vi.fn(() => Promise.resolve()),
    help: vi.fn(() => Promise.resolve()),
    channels: vi.fn(() => Promise.resolve()),
    unlink: vi.fn(() => Promise.resolve()),
    rank: vi.fn(() => Promise.resolve()),
    link: vi.fn(() => Promise.resolve()),
    linkButton: vi.fn(() => Promise.resolve()),
    reaperAdd: vi.fn(() => Promise.resolve()),
    reaperClosest: vi.fn(() => Promise.resolve()),
    reaperList: vi.fn(() => Promise.resolve()),
    reaperRemove: vi.fn(() => Promise.resolve()),
    reaperAutocomplete: vi.fn(() => Promise.resolve()),
    reaperPage: vi.fn(() => Promise.resolve()),
    booty: vi.fn(() => Promise.resolve()),
    bootyAlerts: vi.fn(() => Promise.resolve()),
    bootyAlertsAutocomplete: vi.fn(() => Promise.resolve()),
    bootyButton: vi.fn(() => Promise.resolve()),
    pick: vi.fn(() => Promise.resolve()),
    overview: vi.fn(() => Promise.resolve()),
    memberJoined: vi.fn(() => Promise.resolve()),
    memberLeft: vi.fn(() => Promise.resolve()),
    memberOnline: vi.fn(() => Promise.resolve()),
    interview: vi.fn(() => Promise.resolve()),
    interviewButton: vi.fn(() => Promise.resolve()),
    interviewModal: vi.fn(() => Promise.resolve()),
    rankButton: vi.fn(() => Promise.resolve()),
    preferencesPress: vi.fn(() => Promise.resolve()),
  };
}

describe("createClient", () => {
  test("requests the Guilds, GuildMembers, GuildPresences and GuildScheduledEvents intents only", () => {
    const client = createClient(handlers(), { guildId: GUILD_ID });

    expect(new IntentsBitField(client.options.intents).toArray()).toEqual([
      "Guilds",
      "GuildMembers",
      "GuildPresences",
      "GuildScheduledEvents",
    ]);
    expect(client.options.intents.bitfield).toBe(
      GatewayIntentBits.Guilds |
        GatewayIntentBits.GuildMembers |
        GatewayIntentBits.GuildPresences |
        GatewayIntentBits.GuildScheduledEvents,
    );
  });

  test("enables the GuildMember and User partials, so a member who left uncached is still announced", () => {
    const client = createClient(handlers(), { guildId: GUILD_ID });

    expect(client.options.partials).toEqual(expect.arrayContaining([Partials.GuildMember, Partials.User]));
  });

  test("logs client errors instead of crashing", () => {
    const logged: string[] = [];
    const client = createClient(handlers(), {
      guildId: GUILD_ID,
      logError: (message: string) => {
        logged.push(message);
      },
    });

    client.emit(Events.Error, new Error("socket hang up"));

    expect(logged).toEqual(["Discord client error: socket hang up"]);
  });

  test("hands /ping to the ping handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = chatInput("ping");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.ping).toHaveBeenCalledWith(interaction);
    expect(routed.player).not.toHaveBeenCalled();
  });

  test("hands /help to the help handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = chatInput("help");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.help).toHaveBeenCalledWith(interaction);
    expect(routed.ping).not.toHaveBeenCalled();
  });

  test("hands /player to the player handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = chatInput("player");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.player).toHaveBeenCalledWith(interaction);
    expect(routed.ping).not.toHaveBeenCalled();
  });

  test("hands /alliance to the alliance handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = chatInput("alliance");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.alliance).toHaveBeenCalledWith(interaction);
    expect(routed.ping).not.toHaveBeenCalled();
    expect(routed.player).not.toHaveBeenCalled();
  });

  test("hands an autocomplete request of /alliance to the alliance autocomplete handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = autocomplete("alliance");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.allianceAutocomplete).toHaveBeenCalledWith(interaction);
    expect(routed.alliance).not.toHaveBeenCalled();
    expect(routed.player).not.toHaveBeenCalled();
  });

  test.each([
    ["closest", "reaperClosest"],
    ["list", "reaperList"],
    ["add", "reaperAdd"],
    ["remove", "reaperRemove"],
  ] as const)("hands /reaper %s to the %s handler and nothing else", (subcommand, handler) => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = reaperCommand(subcommand);

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed[handler]).toHaveBeenCalledWith(interaction);
    for (const other of ["reaperClosest", "reaperList", "reaperAdd", "reaperRemove"] as const) {
      if (other !== handler) expect(routed[other]).not.toHaveBeenCalled();
    }
    expect(routed.alliance).not.toHaveBeenCalled();
    expect(routed.player).not.toHaveBeenCalled();
  });

  test("answers a /reaper subcommand it does not know privately, and hands it to no handler", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const reply = vi.fn(() => Promise.resolve());
    const interaction = { ...reaperCommand("unknown"), reply };

    client.emit(Events.InteractionCreate, interaction as never);

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral }));
    for (const handler of ["reaperClosest", "reaperList", "reaperAdd", "reaperRemove"] as const) {
      expect(routed[handler]).not.toHaveBeenCalled();
    }
  });

  test("hands an autocomplete request of /reaper to the reaper autocomplete handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = autocomplete("reaper");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.reaperAutocomplete).toHaveBeenCalledWith(interaction);
    expect(routed.allianceAutocomplete).not.toHaveBeenCalled();
    expect(routed.alliance).not.toHaveBeenCalled();
  });

  test("hands an autocomplete request of /alliance to the alliance autocomplete handler, not the reaper one", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });

    client.emit(Events.InteractionCreate, autocomplete("alliance") as never);

    expect(routed.allianceAutocomplete).toHaveBeenCalledTimes(1);
    expect(routed.reaperAutocomplete).not.toHaveBeenCalled();
  });

  test("hands a button whose custom id starts with reaper: to the reaper page handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = component("button", "reaper:9f8e7d6c5b4a3210:page:2");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.reaperPage).toHaveBeenCalledWith(interaction);
    expect(routed.pick).not.toHaveBeenCalled();
    expect(routed.overview).not.toHaveBeenCalled();
    expect(routed.interviewButton).not.toHaveBeenCalled();
  });

  test("hands /booty to the booty handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = chatInput("booty");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.booty).toHaveBeenCalledWith(interaction);
    expect(routed.bootyAlerts).not.toHaveBeenCalled();
    expect(routed.quota).not.toHaveBeenCalled();
    expect(routed.player).not.toHaveBeenCalled();
  });

  test("hands /booty-alerts to the booty alerts handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = chatInput("booty-alerts");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.bootyAlerts).toHaveBeenCalledWith(interaction);
    expect(routed.booty).not.toHaveBeenCalled();
    expect(routed.quota).not.toHaveBeenCalled();
    expect(routed.player).not.toHaveBeenCalled();
  });

  test("hands an autocomplete request of /booty-alerts to the booty alerts autocomplete handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = autocomplete("booty-alerts");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.bootyAlertsAutocomplete).toHaveBeenCalledWith(interaction);
    expect(routed.allianceAutocomplete).not.toHaveBeenCalled();
    expect(routed.reaperAutocomplete).not.toHaveBeenCalled();
    expect(routed.bootyAlerts).not.toHaveBeenCalled();
  });

  test("hands a button whose custom id starts with booty: to the booty button handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = component("button", "booty:7:1783425600000");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.bootyButton).toHaveBeenCalledWith(interaction);
    expect(routed.reaperPage).not.toHaveBeenCalled();
    expect(routed.overview).not.toHaveBeenCalled();
    expect(routed.pick).not.toHaveBeenCalled();
    expect(routed.rankButton).not.toHaveBeenCalled();
  });

  test("hands /quota to the quota handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = chatInput("quota");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.quota).toHaveBeenCalledWith(interaction);
    expect(routed.ping).not.toHaveBeenCalled();
    expect(routed.player).not.toHaveBeenCalled();
    expect(routed.alliance).not.toHaveBeenCalled();
  });

  test("hands /unlink to the unlink handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = chatInput("unlink");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.unlink).toHaveBeenCalledWith(interaction);
    expect(routed.rank).not.toHaveBeenCalled();
    expect(routed.quota).not.toHaveBeenCalled();
    expect(routed.player).not.toHaveBeenCalled();
  });

  test("hands /rank to the rank handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = chatInput("rank");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.rank).toHaveBeenCalledWith(interaction);
    expect(routed.unlink).not.toHaveBeenCalled();
    expect(routed.quota).not.toHaveBeenCalled();
    expect(routed.player).not.toHaveBeenCalled();
  });

  test("hands /link to the link handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = chatInput("link");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.link).toHaveBeenCalledWith(interaction);
    expect(routed.unlink).not.toHaveBeenCalled();
    expect(routed.rank).not.toHaveBeenCalled();
    expect(routed.quota).not.toHaveBeenCalled();
    expect(routed.player).not.toHaveBeenCalled();
  });

  test("hands /channels to the channels handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = chatInput("channels");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.channels).toHaveBeenCalledWith(interaction);
    expect(routed.quota).not.toHaveBeenCalled();
    expect(routed.unlink).not.toHaveBeenCalled();
    expect(routed.player).not.toHaveBeenCalled();
    expect(routed.preferencesPress).not.toHaveBeenCalled();
  });

  test("ignores other commands and other interaction kinds", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });

    client.emit(Events.InteractionCreate, chatInput("other") as never);
    client.emit(
      Events.InteractionCreate,
      { isChatInputCommand: () => false, isAutocomplete: () => false, isStringSelectMenu: () => false, isButton: () => false, isModalSubmit: () => false } as never,
    );

    expect(routed.ping).not.toHaveBeenCalled();
    expect(routed.player).not.toHaveBeenCalled();
    expect(routed.quota).not.toHaveBeenCalled();
    expect(routed.pick).not.toHaveBeenCalled();
  });

  test("hands a string select menu whose custom id starts with pick: to the pick handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = component("select", "pick:a1b2c3d4:select");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.pick).toHaveBeenCalledWith(interaction);
    expect(routed.player).not.toHaveBeenCalled();
    expect(routed.alliance).not.toHaveBeenCalled();
    expect(routed.quota).not.toHaveBeenCalled();
  });

  test("hands a button whose custom id starts with pick: to the pick handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = component("button", "pick:a1b2c3d4:page:2");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.pick).toHaveBeenCalledWith(interaction);
    expect(routed.player).not.toHaveBeenCalled();
    expect(routed.alliance).not.toHaveBeenCalled();
  });

  test("hands a button whose custom id starts with overview: to the overview handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = component("button", "overview:a1b2c3d4e5f60718:1");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.overview).toHaveBeenCalledWith(interaction);
    expect(routed.pick).not.toHaveBeenCalled();
    expect(routed.player).not.toHaveBeenCalled();
  });

  test("ignores a component whose custom id is not a pick list's", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });

    client.emit(Events.InteractionCreate, component("button", "roster:a1b2c3d4") as never);
    client.emit(Events.InteractionCreate, component("select", "picks:a1b2c3d4:select") as never);

    expect(routed.pick).not.toHaveBeenCalled();
  });

  test("hands a guild member joining to the memberJoined handler with its id, username and bot flag, and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });

    client.emit(Events.GuildMemberAdd, guildMember("111", "alice", false) as never);

    expect(routed.memberJoined).toHaveBeenCalledWith({ id: "111", username: "alice", bot: false });
    expect(routed.interview).not.toHaveBeenCalled();
    expect(routed.pick).not.toHaveBeenCalled();
  });

  test("hands a guild member leaving to the memberLeft handler with its id and username, and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });

    client.emit(Events.GuildMemberRemove, guildMember("111", "alice", false) as never);

    expect(routed.memberLeft).toHaveBeenCalledWith({ id: "111", username: "alice" });
    expect(routed.memberJoined).not.toHaveBeenCalled();
    expect(routed.interview).not.toHaveBeenCalled();
  });

  test("does not hand a guild member joining another guild to the memberJoined handler", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });

    client.emit(Events.GuildMemberAdd, guildMember("111", "alice", false, OTHER_GUILD_ID) as never);

    expect(routed.memberJoined).not.toHaveBeenCalled();
  });

  test("does not hand a guild member leaving another guild to the memberLeft handler", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });

    client.emit(Events.GuildMemberRemove, guildMember("111", "alice", false, OTHER_GUILD_ID) as never);

    expect(routed.memberLeft).not.toHaveBeenCalled();
  });

  test("hands /interview to the interview handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = chatInput("interview");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.interview).toHaveBeenCalledWith(interaction);
    expect(routed.ping).not.toHaveBeenCalled();
    expect(routed.quota).not.toHaveBeenCalled();
    expect(routed.memberJoined).not.toHaveBeenCalled();
  });

  test("hands a button whose custom id starts with interview: to the interview button handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = component("button", "interview:uid:42");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.interviewButton).toHaveBeenCalledWith(interaction);
    expect(routed.interviewModal).not.toHaveBeenCalled();
    expect(routed.rankButton).not.toHaveBeenCalled();
    expect(routed.pick).not.toHaveBeenCalled();
  });

  test("hands a modal submit whose custom id starts with interview: to the interview modal handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = modal("interview:modal:42");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.interviewModal).toHaveBeenCalledWith(interaction);
    expect(routed.interviewButton).not.toHaveBeenCalled();
    expect(routed.pick).not.toHaveBeenCalled();
  });

  test("hands a button whose custom id starts with link: to the link button handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = component("button", "link:7:confirm");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.linkButton).toHaveBeenCalledWith(interaction);
    expect(routed.rankButton).not.toHaveBeenCalled();
    expect(routed.interviewButton).not.toHaveBeenCalled();
    expect(routed.pick).not.toHaveBeenCalled();
  });

  test("hands a button whose custom id starts with rank: to the rank button handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = component("button", "rank:7:R3");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.rankButton).toHaveBeenCalledWith(interaction);
    expect(routed.interviewButton).not.toHaveBeenCalled();
    expect(routed.pick).not.toHaveBeenCalled();
  });
  test("hands a button whose custom id starts with pref: to the preferences press handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = component("button", "pref:done:111111111111111111");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.preferencesPress).toHaveBeenCalledWith(interaction);
    expect(routed.pick).not.toHaveBeenCalled();
    expect(routed.overview).not.toHaveBeenCalled();
    expect(routed.interviewButton).not.toHaveBeenCalled();
    expect(routed.rankButton).not.toHaveBeenCalled();
    expect(routed.linkButton).not.toHaveBeenCalled();
  });

  test("hands a string select menu whose custom id starts with pref: to the preferences press handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const interaction = component("select", "pref:languages:111111111111111111");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.preferencesPress).toHaveBeenCalledWith(interaction);
    expect(routed.pick).not.toHaveBeenCalled();
    expect(routed.interviewButton).not.toHaveBeenCalled();
    expect(routed.rankButton).not.toHaveBeenCalled();
    expect(routed.linkButton).not.toHaveBeenCalled();
  });
});

/** A guild member as discord.js gives it on a presence update: its id, display name, and user. */
function presenceMember(id: string, username: string, displayName: string, bot: boolean) {
  return { id, displayName, guild: { id: GUILD_ID }, user: { id, username, bot } };
}

type PresenceMember = ReturnType<typeof presenceMember>;

/** A partial Member a presence can carry, with neither username nor bot flag: Discord's stub, which is not to be trusted. */
interface PartialPresenceMember {
  readonly id: string;
  readonly displayName: string;
  readonly guild: { readonly id: string };
  readonly user: { readonly id: string; readonly username: null; readonly bot: null };
}

/**
 * A presence as discord.js emits it: the Member's user id, the status, the Member when Discord sent it (else null), and the
 * guild, whose members fetch answers with `fetched` when the event carries no Member.
 */
function presenceOf(
  status: string,
  options: { readonly member: PresenceMember | PartialPresenceMember | null; readonly fetched?: PresenceMember; readonly guildId?: string },
) {
  const fetched = options.fetched;
  return {
    userId: ALICE_ID,
    status,
    member: options.member,
    guild: {
      id: options.guildId ?? GUILD_ID,
      members: { fetch: vi.fn(() => Promise.resolve(fetched)) },
    },
  };
}

const ALICE_ID = "111111111111111111";
const ALICE_MEMBER = presenceMember(ALICE_ID, "alice", "Alice Game", false);

describe("a Member's presence update", () => {
  test("a Member who comes online is handed to memberOnline with the id, username, display name and bot flag, and nothing else", async () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });

    client.emit(Events.PresenceUpdate, presenceOf("offline", { member: ALICE_MEMBER }) as never, presenceOf("online", { member: ALICE_MEMBER, fetched: ALICE_MEMBER }) as never);

    await vi.waitFor(() => {
      expect(routed.memberOnline).toHaveBeenCalledWith({ id: ALICE_ID, username: "alice", displayName: "Alice Game", bot: false });
    });
    expect(routed.memberJoined).not.toHaveBeenCalled();
    expect(routed.memberLeft).not.toHaveBeenCalled();
  });

  test("a Member with no earlier presence who is online is handed to memberOnline", async () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });

    client.emit(Events.PresenceUpdate, null as never, presenceOf("idle", { member: ALICE_MEMBER, fetched: ALICE_MEMBER }) as never);

    await vi.waitFor(() => {
      expect(routed.memberOnline).toHaveBeenCalledWith({ id: ALICE_ID, username: "alice", displayName: "Alice Game", bot: false });
    });
  });

  test("a presence update of another guild does nothing", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });

    client.emit(
      Events.PresenceUpdate,
      presenceOf("offline", { member: ALICE_MEMBER, guildId: OTHER_GUILD_ID }) as never,
      presenceOf("online", { member: ALICE_MEMBER, guildId: OTHER_GUILD_ID }) as never,
    );

    expect(routed.memberOnline).not.toHaveBeenCalled();
  });

  test("a Member going from online to idle does nothing", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });

    client.emit(Events.PresenceUpdate, presenceOf("online", { member: ALICE_MEMBER }) as never, presenceOf("idle", { member: ALICE_MEMBER, fetched: ALICE_MEMBER }) as never);

    expect(routed.memberOnline).not.toHaveBeenCalled();
  });

  test("reads the Member with a single-Member fetch when the event carries none", async () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const after = presenceOf("online", { member: null, fetched: ALICE_MEMBER });

    client.emit(Events.PresenceUpdate, presenceOf("offline", { member: null }) as never, after as never);

    await vi.waitFor(() => {
      expect(routed.memberOnline).toHaveBeenCalledWith({ id: ALICE_ID, username: "alice", displayName: "Alice Game", bot: false });
    });
    expect(after.guild.members.fetch).toHaveBeenCalledTimes(1);
    expect(after.guild.members.fetch).toHaveBeenCalledWith(ALICE_ID);
  });

  test("a partial Member in the presence, with no username or bot flag, is not trusted: the Member is read with fetchMember", async () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });
    const partialStub = { id: ALICE_ID, displayName: "Alice Game", guild: { id: GUILD_ID }, user: { id: ALICE_ID, username: null, bot: null } };
    const after = presenceOf("online", { member: partialStub, fetched: ALICE_MEMBER });

    client.emit(Events.PresenceUpdate, presenceOf("offline", { member: null }) as never, after as never);

    await vi.waitFor(() => {
      expect(routed.memberOnline).toHaveBeenCalledWith({ id: ALICE_ID, username: "alice", displayName: "Alice Game", bot: false });
    });
    expect(after.guild.members.fetch).toHaveBeenCalledWith(ALICE_ID);
  });

  test("a Member who is invisible is offline to Neil: going from invisible to online is coming online", async () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });

    client.emit(Events.PresenceUpdate, presenceOf("invisible", { member: ALICE_MEMBER }) as never, presenceOf("online", { member: ALICE_MEMBER, fetched: ALICE_MEMBER }) as never);

    await vi.waitFor(() => {
      expect(routed.memberOnline).toHaveBeenCalledWith({ id: ALICE_ID, username: "alice", displayName: "Alice Game", bot: false });
    });
  });

  test("a Member who is invisible is offline to Neil: going from online to invisible starts nothing", () => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });

    client.emit(Events.PresenceUpdate, presenceOf("online", { member: ALICE_MEMBER }) as never, presenceOf("invisible", { member: ALICE_MEMBER }) as never);

    expect(routed.memberOnline).not.toHaveBeenCalled();
  });

  test.each(["online", "idle"] as const)("a Member going from %s to do not disturb does nothing", (before) => {
    const routed = handlers();
    const client = createClient(routed, { guildId: GUILD_ID });

    client.emit(Events.PresenceUpdate, presenceOf(before, { member: ALICE_MEMBER }) as never, presenceOf("dnd", { member: ALICE_MEMBER }) as never);

    expect(routed.memberOnline).not.toHaveBeenCalled();
  });
});

describe("memberRoleIds", () => {
  test("gives the role IDs in the cache of a guild member", () => {
    const member = {
      roles: {
        cache: new Map<string, unknown>([
          ["111", {}],
          ["222", {}],
        ]),
      },
    };

    expect(memberRoleIds(member)).toEqual(["111", "222"]);
  });

  test("gives the role IDs of an API member", () => {
    expect(memberRoleIds({ roles: ["333"] })).toEqual(["333"]);
  });

  test("gives no role IDs for anything else", () => {
    expect(memberRoleIds(null)).toEqual([]);
    expect(memberRoleIds(undefined)).toEqual([]);
    expect(memberRoleIds(42)).toEqual([]);
    expect(memberRoleIds({})).toEqual([]);
  });
});
