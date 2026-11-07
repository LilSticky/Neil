import { ApplicationCommandOptionType, ApplicationCommandType, } from "discord.js";
/** Neil's commands are slash commands; a context menu command has no options to show. */
function isSlashCommand(command) {
    return command.type === undefined || command.type === ApplicationCommandType.ChatInput;
}
/** The options as usage: a required one as <name>, an optional one as [name], in the order of the options. */
function optionsSyntax(options) {
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
function linesOf(command) {
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
function formatLine(line) {
    return `\`${line.usage}\` — ${line.description}`;
}
/** The /help answer: the Member commands, and for an Officer a section after them with the Officer commands. */
export function helpReply(commands, { officer }) {
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
//# sourceMappingURL=help-texts.js.map