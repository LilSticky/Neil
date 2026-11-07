import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  type APIApplicationCommandOption,
  type APIEmbed,
  type RESTPostAPIApplicationCommandsJSONBody,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";

/** One line of the /help answer: the usage of a command or subcommand, and its purpose. */
interface HelpLine {
  readonly usage: string;
  readonly description: string;
}

/** Neil's commands are slash commands; a context menu command has no options to show. */
function isSlashCommand(
  command: RESTPostAPIApplicationCommandsJSONBody,
): command is RESTPostAPIChatInputApplicationCommandsJSONBody {
  return command.type === undefined || command.type === ApplicationCommandType.ChatInput;
}

/** The options as usage: a required one as <name>, an optional one as [name], in the order of the options. */
function optionsSyntax(options: readonly APIApplicationCommandOption[]): string {
  return options
    .map((option) => {
      if (option.type === ApplicationCommandOptionType.Subcommand) {
        return "";
      }
      return option.required === true ? ` <${option.name}>` : ` [${option.name}]`;
    })
    .join("");
}

/** The lines of a command: one per subcommand when it has subcommands, otherwise one for the command itself. */
function linesOf(command: RESTPostAPIChatInputApplicationCommandsJSONBody): HelpLine[] {
  const options = command.options ?? [];
  const subcommands = options.filter((option) => option.type === ApplicationCommandOptionType.Subcommand);
  if (subcommands.length === 0) {
    return [{ usage: `/${command.name}${optionsSyntax(options)}`, description: command.description }];
  }
  return subcommands.map((subcommand) => ({
    usage: `/${command.name} ${subcommand.name}${optionsSyntax(subcommand.options ?? [])}`,
    description: subcommand.description,
  }));
}

function formatLine(line: HelpLine): string {
  return `\`${line.usage}\` — ${line.description}`;
}

/** The /help answer: the Member commands, and for an Officer a section after them with the Officer commands. */
export function helpReply(
  commands: readonly RESTPostAPIApplicationCommandsJSONBody[],
  { officer }: { readonly officer: boolean },
): APIEmbed {
  const slashCommands = commands.filter(isSlashCommand);
  const memberLines = slashCommands
    .filter((command) => command.default_member_permissions !== "0")
    .flatMap(linesOf)
    .map(formatLine);
  const officerLines = slashCommands
    .filter((command) => command.default_member_permissions === "0")
    .flatMap(linesOf)
    .map(formatLine);
  const officerSection = officer && officerLines.length > 0 ? ["", "**Officer commands**", ...officerLines] : [];
  return { description: [...memberLines, ...officerSection].join("\n") };
}
