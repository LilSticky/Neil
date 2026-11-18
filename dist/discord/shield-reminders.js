import { ButtonStyle, ChannelType, ComponentType } from "discord.js";
import { dueReminders } from "../domain/events.js";
import { allianceRoleName } from "../domain/managed-roles.js";
import { shieldDeadlineOf, shieldKindOf, shieldLeadMinutesOf, shieldStandingOf, shieldWeekOf, weekStartOf, } from "../domain/shield.js";
import { textWithMentions } from "./mentions.js";
import { allianceMembersOf, raidServerOf } from "./raid-server.js";
import { shieldButtonId } from "./shield.js";
import { ALLIANCE_CHAT_CHANNEL, ALLIANCE_LEADERS_CHANNEL, packLines, shieldMessages } from "./shield-texts.js";
const KINGDOM = "kingdom";
/**
 * The Shield Reminders (slice 045), on the one-minute tick: in a KvK Week, at each lead time before the Shield Deadline,
 * a reminder in every Alliance's alliance-chat mentioning its Linked Members who have not confirmed and have not switched
 * the reminders off, and a Shield List in its alliance-leaders. Lead times missed collapse into one sent now. Each lead
 * time is recorded before anything is posted, so a failed post is logged once and never sent twice. Confirmations of
 * weeks whose deadline has passed are deleted.
 */
export function createShieldReminders(deps) {
    const { shield, server } = deps;
    // A line that cannot reach #neil-log is only kept in the error log, so the other Alliances still get theirs.
    async function log(line) {
        try {
            await server.log(line);
        }
        catch (error) {
            deps.logError(`Logging a Shield Reminder line failed: ${errorMessage(error)}`);
        }
    }
    async function postTo(tag, channel, what, messages) {
        const channelId = server.allianceChannelId(tag, channel);
        if (channelId === undefined) {
            await log(shieldMessages.log.noChannel(tag, channel, what));
            return;
        }
        try {
            for (const message of messages)
                await server.post(channelId, message);
        }
        catch (error) {
            const line = shieldMessages.log.failed(tag, what, errorMessage(error));
            deps.logError(line);
            await log(line);
        }
    }
    function reminderMessages(week, tag, deadline, mentioned) {
        const [first, ...rest] = textWithMentions(shieldMessages.reminder(tag, deadline), mentioned);
        if (first === undefined)
            return [];
        const button = {
            ...first,
            components: [
                {
                    type: ComponentType.ActionRow,
                    components: [
                        { type: ComponentType.Button, style: ButtonStyle.Success, label: shieldMessages.buttonLabel, custom_id: shieldButtonId(week) },
                    ],
                },
            ],
        };
        return [button, ...rest];
    }
    function listMessages(tag, deadline, standing) {
        return packLines(shieldMessages.list(tag, deadline, standing)).map((content) => ({
            content,
            allowedMentions: { parse: [], users: [] },
        }));
    }
    async function remind(week, deadline, leadMinutes) {
        const members = await server.members();
        const confirmed = shield.confirmed(week);
        const off = shield.remindersOff();
        const tags = server.allianceTags();
        let mentioned = 0;
        for (const tag of tags) {
            const linked = allianceMembersOf(members, tag).filter((memberId) => deps.links.linkFor(memberId) !== undefined);
            const standing = shieldStandingOf(linked, confirmed, off);
            if (standing.toRemind.length > 0) {
                mentioned += standing.toRemind.length;
                await postTo(tag, ALLIANCE_CHAT_CHANNEL, "Shield Reminder", reminderMessages(week, tag, deadline, standing.toRemind));
            }
            await postTo(tag, ALLIANCE_LEADERS_CHANNEL, "Shield List", listMessages(tag, deadline, standing));
        }
        await log(shieldMessages.log.round(week, leadMinutes, mentioned, tags.length));
    }
    async function run() {
        const now = deps.now();
        const deadline = shieldDeadlineOf(now);
        const week = shieldWeekOf(deadline);
        // Once Friday's reset has passed, the Shield Confirmations of that week are no longer needed (ADR 27).
        shield.deleteConfirmationsBefore(week);
        if (shield.markOf(week) === undefined)
            return;
        const leads = shieldLeadMinutesOf(deps.events.listKinds(KINGDOM));
        const sent = shield.sentLeads(week).map((leadMinutes) => ({ target: "start", leadMinutes }));
        const plan = dueReminders(deadline, "scheduled", shieldKindOf(leads), sent, weekStartOf(week), now);
        for (const skipped of plan.record)
            shield.recordSent(week, skipped.leadMinutes);
        for (const due of plan.send) {
            shield.recordSent(week, due.leadMinutes);
            await remind(week, deadline, due.leadMinutes);
        }
    }
    return {
        async tick() {
            try {
                await run();
            }
            catch (error) {
                const line = `The Shield Reminders failed: ${errorMessage(error)}`;
                deps.logError(line);
                await server.log(line).catch(() => undefined);
            }
        },
    };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
/** The Shield Reminders' view of the guild: the Raid's member listing, tags, posts and log, and the Alliance areas' channels. */
export function shieldServerOf(guild, options) {
    const raidServer = raidServerOf(guild, options);
    return {
        members: () => raidServer.members(),
        allianceTags: () => raidServer.allianceTags(),
        allianceChannelId: (tag, name) => [...guild.channels.cache.values()].find((channel) => channel.type === ChannelType.GuildText && channel.name === name && channel.parent?.name === allianceRoleName(tag))?.id,
        post: (channelId, message) => raidServer.post(channelId, message),
        log: (line) => raidServer.log(line),
    };
}
//# sourceMappingURL=shield-reminders.js.map