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
        return [
            {
                usage: `/${command.name}${optionsSyntax(options)}`,
                description: command.description,
            },
        ];
    }
    return subcommands.map((subcommand) => ({
        usage: `/${command.name} ${subcommand.name}${optionsSyntax(subcommand.options ?? [])}`,
        description: subcommand.description,
    }));
}
function formatLine(line) {
    return `\`${line.usage}\` — ${line.description}`;
}
/** Discord's limit for the description of one embed. */
export const EMBED_DESCRIPTION_LIMIT = 4096;
/** Discord's limit for the embeds of one message. */
export const MESSAGE_EMBED_LIMIT = 10;
/** Discord's limit for the characters across all embeds of one message. */
export const MESSAGE_CHARACTER_LIMIT = 6000;
/** The title of every embed that holds Officer commands. */
const OFFICER_TITLE = "Officer commands";
/** The formatted lines of each command, one group per top-level command, in the order of the definitions. */
function groupsOf(commands) {
    return commands.map((command) => linesOf(command).map(formatLine));
}
/** The length of lines joined by "\n". */
function joinedLength(lines) {
    return lines.reduce((sum, line) => sum + line.length, 0) + Math.max(lines.length - 1, 0);
}
/**
 * The lines of the groups, packed into embed descriptions of at most EMBED_DESCRIPTION_LIMIT characters. A group stays
 * in one embed; it is split by lines only when it does not fit into an empty embed on its own.
 */
function packGroups(groups) {
    const embeds = [];
    let current = [];
    const fits = (lines) => joinedLength(lines) <= EMBED_DESCRIPTION_LIMIT;
    for (const group of groups) {
        if (fits([...current, ...group])) {
            current.push(...group);
            continue;
        }
        if (fits(group)) {
            embeds.push(current);
            current = [...group];
            continue;
        }
        for (const line of group) {
            if (current.length > 0 && !fits([...current, line])) {
                embeds.push(current);
                current = [];
            }
            current.push(line);
        }
    }
    if (current.length > 0 || embeds.length === 0) {
        embeds.push(current);
    }
    return embeds;
}
/** The characters an embed counts toward MESSAGE_CHARACTER_LIMIT. */
function embedLength(embed) {
    return (embed.title?.length ?? 0) + (embed.description?.length ?? 0);
}
/**
 * The /help answer as pages, one inner array of embeds per message: the Member commands, and for an Officer embeds
 * titled "Officer commands" after them. Each page holds at most MESSAGE_EMBED_LIMIT embeds and MESSAGE_CHARACTER_LIMIT
 * characters.
 */
export function helpPages(commands, { officer }) {
    const slashCommands = commands.filter(isSlashCommand);
    const memberGroups = groupsOf(slashCommands.filter((command) => command.default_member_permissions !== "0"));
    const officerGroups = groupsOf(slashCommands.filter((command) => command.default_member_permissions === "0")).filter((group) => group.length > 0);
    const memberEmbeds = packGroups(memberGroups).map((lines) => ({
        description: lines.join("\n"),
    }));
    const showOfficer = officer && officerGroups.length > 0;
    const hasMemberLines = memberGroups.some((group) => group.length > 0);
    const embeds = showOfficer && !hasMemberLines ? [] : memberEmbeds;
    if (showOfficer) {
        embeds.push(...packGroups(officerGroups).map((lines) => ({
            title: OFFICER_TITLE,
            description: lines.join("\n"),
        })));
    }
    const pages = [];
    let page = [];
    let characters = 0;
    for (const embed of embeds) {
        const length = embedLength(embed);
        if (page.length > 0 && (page.length >= MESSAGE_EMBED_LIMIT || characters + length > MESSAGE_CHARACTER_LIMIT)) {
            pages.push(page);
            page = [];
            characters = 0;
        }
        page.push(embed);
        characters += length;
    }
    pages.push(page);
    return pages;
}
//# sourceMappingURL=help-texts.js.map