import { MessageFlags } from "discord.js";
import { allianceRoleName, tagOfAllianceRole } from "../domain/managed-roles.js";
import { isOfficer } from "../domain/officer.js";
import { deadlineOfWeek, isShieldWeek, shieldDeadlineOf, shieldWeekOf } from "../domain/shield.js";
import { ALLIANCE_CHAT_CHANNEL, SHIELD_PREFIX, shieldMessages } from "./shield-texts.js";
const WEEK_ID = new RegExp(`^${SHIELD_PREFIX}(.+)$`);
/** The custom id of the Shielded button of a week. */
export function shieldButtonId(week) {
    return `${SHIELD_PREFIX}${week}`;
}
/**
 * The Shielded button, /shield-reminders and /kvk-week (slice 045). Every answer is private. A failed read or write is
 * logged and answered as unavailable; a failed reply is logged, never thrown.
 */
export function createShieldCommands(deps) {
    async function reply(interaction, what, content) {
        try {
            await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
        }
        catch (error) {
            deps.logError(`Replying to ${what} failed: ${errorMessage(error)}`);
        }
    }
    function pressAnswer(press) {
        const week = WEEK_ID.exec(press.customId)?.[1];
        if (week === undefined || !isShieldWeek(week))
            return shieldMessages.press.invalid;
        const channel = press.channel;
        const tag = channel?.categoryName === undefined ? undefined : tagOfAllianceRole(channel.categoryName);
        if (channel?.name !== ALLIANCE_CHAT_CHANNEL || tag === undefined)
            return shieldMessages.press.notAllowed;
        const memberId = press.user.id;
        if (deps.links.linkFor(memberId) === undefined)
            return shieldMessages.press.notAllowed;
        if (!press.memberRoleNames().includes(allianceRoleName(tag)))
            return shieldMessages.press.notAllowed;
        const deadline = deadlineOfWeek(week);
        const now = deps.now();
        if (now.getTime() >= deadline.getTime())
            return shieldMessages.press.passed;
        if (deps.shield.markOf(week) === undefined)
            return shieldMessages.press.notKvkWeek;
        return deps.shield.confirm(week, memberId, now) ? shieldMessages.press.recorded(deadline) : shieldMessages.press.already;
    }
    function remindersAnswer(interaction) {
        const memberId = interaction.user.id;
        if (deps.links.linkFor(memberId) === undefined)
            return shieldMessages.reminders.notLinked;
        const choice = interaction.options.getString("reminders");
        if (choice === null)
            return shieldMessages.reminders.shown(deps.shield.isOff(memberId));
        if (choice !== "on" && choice !== "off")
            return shieldMessages.reminders.invalid;
        const off = choice === "off";
        deps.shield.setOff(memberId, off);
        return shieldMessages.reminders.recorded(off);
    }
    async function kvkWeekAnswer(interaction) {
        if (!isOfficer(interaction.memberRoleIds(), deps.officerRoleIds))
            return shieldMessages.kvkWeek.notAllowed;
        const now = deps.now();
        const deadline = shieldDeadlineOf(now);
        const week = shieldWeekOf(deadline);
        const officerId = interaction.user.id;
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "show")
            return shieldMessages.kvkWeek.shown(deadline, deps.shield.markOf(week) !== undefined);
        if (subcommand === "mark") {
            if (!deps.shield.mark(week, now, officerId))
                return shieldMessages.kvkWeek.alreadyMarked(deadline);
            await logLine(shieldMessages.kvkWeek.logMarked(officerId, week));
            return shieldMessages.kvkWeek.marked(deadline);
        }
        if (subcommand === "unmark") {
            if (!deps.shield.unmark(week))
                return shieldMessages.kvkWeek.notMarked(deadline);
            await logLine(shieldMessages.kvkWeek.logUnmarked(officerId, week));
            return shieldMessages.kvkWeek.unmarked(deadline);
        }
        throw new Error(`unknown /kvk-week subcommand ${subcommand}`);
    }
    async function logLine(line) {
        try {
            await deps.log(line);
        }
        catch (error) {
            deps.logError(`Logging a KvK Week failed: ${errorMessage(error)}`);
        }
    }
    return {
        async onPress(press) {
            let content;
            try {
                content = pressAnswer(press);
            }
            catch (error) {
                deps.logError(`Recording a Shield Confirmation failed: ${errorMessage(error)}`);
                content = shieldMessages.reminders.unavailable;
            }
            await reply(press, "the Shielded button", content);
        },
        async onReminders(interaction) {
            let content;
            try {
                content = remindersAnswer(interaction);
            }
            catch (error) {
                deps.logError(`Shield Reminders failed: ${errorMessage(error)}`);
                content = shieldMessages.reminders.unavailable;
            }
            await reply(interaction, "/shield-reminders", content);
        },
        async onKvkWeek(interaction) {
            let content;
            try {
                content = await kvkWeekAnswer(interaction);
            }
            catch (error) {
                deps.logError(`/kvk-week failed: ${errorMessage(error)}`);
                content = shieldMessages.kvkWeek.unavailable;
            }
            await reply(interaction, "/kvk-week", content);
        },
    };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=shield.js.map