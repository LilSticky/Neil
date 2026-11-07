import { InteractionContextType, SlashCommandBuilder, type SlashCommandStringOption } from "discord.js";

/**
 * Officer commands are hidden from Members: only Administrators see them until the server allows the Moderator and
 * King roles (and the moderator channel) under Server Settings → Integrations → Neil. Neil still checks the role.
 */
const HIDDEN_FROM_MEMBERS = 0n;

/** Temporary; removed in a later slice. */
export const ping = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Check that Neil is online")
  .setContexts(InteractionContextType.Guild);

export const player = new SlashCommandBuilder()
  .setName("player")
  .setDescription("Look up a player by name or uid")
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("The player's complete in-game name")
      .setRequired(false)
      .setMaxLength(32),
  )
  .addStringOption((option) =>
    option
      .setName("uid")
      .setDescription("The player's uid (the number under the profile picture)")
      .setRequired(false)
      .setMaxLength(32),
  )
  .addIntegerOption((option) =>
    option
      .setName("kingdom")
      .setDescription("The player's kingdom number, with a name")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(9999),
  );

export const alliance = new SlashCommandBuilder()
  .setName("alliance")
  .setDescription("Look up an alliance in a kingdom")
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("The alliance's exact full name, alone")
      .setRequired(false)
      .setMaxLength(40)
      .setAutocomplete(true),
  )
  .addStringOption((option) =>
    option
      .setName("tag")
      .setDescription("The alliance tag, e.g. NML")
      .setRequired(false)
      .setMaxLength(40)
      .setAutocomplete(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("kingdom")
      .setDescription("The kingdom number, with a tag")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(9999),
  );

export const quota = new SlashCommandBuilder()
  .setName("quota")
  .setDescription("Show today's Daily Quota of Game API requests (Officers)")
  .setDefaultMemberPermissions(HIDDEN_FROM_MEMBERS)
  .setContexts(InteractionContextType.Guild);

export const usage = new SlashCommandBuilder()
  .setName("usage")
  .setDescription("Show your Game API requests today and your Daily Allowance")
  .setContexts(InteractionContextType.Guild);

export const booty = new SlashCommandBuilder()
  .setName("booty")
  .setDescription("Call a Booty for your Alliance: a card alerts the Members whose Booty Alerts match")
  .setContexts(InteractionContextType.Guild);

export const bootyAlerts = new SlashCommandBuilder()
  .setName("booty-alerts")
  .setDescription("Choose when a Booty Call alerts you: the mode, a daily window and your time zone")
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName("mode")
      .setDescription("Off, Always, Only when online or Only when offline")
      .setRequired(false)
      .addChoices(
        { name: "Off", value: "off" },
        { name: "Always", value: "always" },
        { name: "Only when online", value: "online" },
        { name: "Only when offline", value: "offline" },
      ),
  )
  .addStringOption((option) =>
    option
      .setName("from")
      .setDescription("Start of your daily window, HH:MM on the 24-hour clock, e.g. 08:00")
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("to")
      .setDescription("End of your daily window, HH:MM on the 24-hour clock, e.g. 23:00")
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("time-zone")
      .setDescription("Your time zone, e.g. Europe/Lisbon")
      .setRequired(false)
      .setAutocomplete(true),
  );

/** The list an /event-kinds option picks: the kingdom's, or the Alliance's. */
const listChoice = (option: SlashCommandStringOption): SlashCommandStringOption =>
  option
    .setName("list")
    .setDescription("Kingdom for the Home Kingdom's list (Officers), Alliance for your Alliance's (R4 and R5)")
    .setRequired(false)
    .addChoices({ name: "Kingdom", value: "kingdom" }, { name: "Alliance", value: "alliance" });

export const eventKinds = new SlashCommandBuilder()
  .setName("event-kinds")
  .setDescription("Choose the Event Kinds that remind Members of Events (R4, R5 or Officers)")
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add an Event Kind, or replace the one of the same name")
      .addStringOption((option) =>
        option.setName("name").setDescription("The name matched in an Event's name, e.g. Hive move").setRequired(true).setMaxLength(40),
      )
      .addStringOption((option) =>
        option.setName("before-start").setDescription("Reminders before the start, up to 3, e.g. 24h, 1h, 10m").setRequired(true),
      )
      .addStringOption((option) =>
        option.setName("signup-deadline").setDescription("The Sign-up Deadline, one time before the start, e.g. 2h").setRequired(false),
      )
      .addStringOption((option) =>
        option.setName("before-signup").setDescription("Reminders before the Sign-up Deadline, up to 3, e.g. 1h").setRequired(false),
      )
      .addStringOption(listChoice),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove an Event Kind by its name")
      .addStringOption((option) =>
        option.setName("name").setDescription("The name of the Event Kind").setRequired(true).setMaxLength(40),
      )
      .addStringOption(listChoice),
  )
  .addSubcommand((sub) => sub.setName("list").setDescription("Show the Event Kinds, with their lead times").addStringOption(listChoice));

export const help = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show the commands you can use and what they are for")
  .setContexts(InteractionContextType.Guild);

export const interview = new SlashCommandBuilder()
  .setName("interview")
  .setDescription("Start your Onboarding Interview")
  .setContexts(InteractionContextType.Guild);

export const channels = new SlashCommandBuilder()
  .setName("channels")
  .setDescription("Choose which channels you see")
  .setContexts(InteractionContextType.Guild);

export const unlink = new SlashCommandBuilder()
  .setName("unlink")
  .setDescription("End a Link: your own, or another Member's (Officers)")
  .setContexts(InteractionContextType.Guild)
  .addUserOption((option) =>
    option.setName("member").setDescription("The Member to Unlink; Officers only. Leave out for yourself").setRequired(false),
  );

export const rank = new SlashCommandBuilder()
  .setName("rank")
  .setDescription("Give a Linked Member their Alliance Rank (Officers)")
  .setDefaultMemberPermissions(HIDDEN_FROM_MEMBERS)
  .setContexts(InteractionContextType.Guild)
  .addUserOption((option) => option.setName("member").setDescription("The Linked Member").setRequired(true))
  .addStringOption((option) =>
    option
      .setName("rank")
      .setDescription("The Alliance Rank, R1 to R5")
      .setRequired(true)
      .addChoices(
        { name: "R1", value: "R1" },
        { name: "R2", value: "R2" },
        { name: "R3", value: "R3" },
        { name: "R4", value: "R4" },
        { name: "R5", value: "R5" },
      ),
  );

export const link = new SlashCommandBuilder()
  .setName("link")
  .setDescription("Link a Member to a uid, for a Member an Interview handed off (Officers)")
  .setDefaultMemberPermissions(HIDDEN_FROM_MEMBERS)
  .setContexts(InteractionContextType.Guild)
  .addUserOption((option) => option.setName("member").setDescription("The handed-off Member").setRequired(true))
  .addStringOption((option) =>
    option
      .setName("uid")
      .setDescription("The Member's uid (the number under the profile picture)")
      .setRequired(true)
      .setMaxLength(32),
  );

/** REAPER: any Member finds and lists Exiles; Neil lets only Home Kingdom R5s add and remove them. */
export const reaper = new SlashCommandBuilder()
  .setName("reaper")
  .setDescription("REAPER: find the closest Exiles, or keep the list (Home Kingdom R5s)")
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName("closest")
      .setDescription("The 3 closest Exiles to your Linked Player, or to x and y")
      .addIntegerOption((option) =>
        option.setName("x").setDescription("Measure from this x instead (with y)").setRequired(false).setMinValue(0),
      )
      .addIntegerOption((option) =>
        option.setName("y").setDescription("Measure from this y instead (with x)").setRequired(false).setMinValue(0),
      )
      .addBooleanOption((option) =>
        option.setName("all").setDescription("Every Exile in the Kingdom by distance, paged").setRequired(false),
      ),
  )
  .addSubcommand((sub) => sub.setName("list").setDescription("Every Exile on REAPER, newest first"))
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a Player to REAPER (Home Kingdom R5s)")
      .addStringOption((option) =>
        option.setName("name").setDescription("The player's complete in-game name").setRequired(true).setMaxLength(32),
      )
      .addStringOption((option) =>
        option.setName("reason").setDescription("Why they are exiled").setRequired(true).setMaxLength(200),
      )
      .addIntegerOption((option) =>
        option
          .setName("kingdom")
          .setDescription("The player's kingdom number")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(9999),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove an Exile from REAPER (Home Kingdom R5s)")
      .addStringOption((option) =>
        option.setName("exile").setDescription("The Exile to remove").setRequired(true).setAutocomplete(true),
      ),
  );

/** Everything registered for the configured server, as REST payloads. */
export const commands = [
  ping.toJSON(),
  player.toJSON(),
  alliance.toJSON(),
  quota.toJSON(),
  channels.toJSON(),
  interview.toJSON(),
  unlink.toJSON(),
  rank.toJSON(),
  link.toJSON(),
  reaper.toJSON(),
  usage.toJSON(),
  help.toJSON(),
  booty.toJSON(),
  bootyAlerts.toJSON(),
  eventKinds.toJSON(),
];
