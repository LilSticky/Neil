import { confirmationDeadlineOf, currentRaidOf, dueNotices, newRaid, onPlan, planDeadlineOf, } from "../domain/raid.js";
import { textWithMentions } from "./mentions.js";
import { LEADERS_CHANNEL } from "./raid-plan.js";
import { allianceMembersOf, holdersOfRole, leadersOf } from "./raid-server.js";
import { raidMessages, reminderLines } from "./raid-texts.js";
/**
 * The Raid clock, on the one-minute tick: the Plan Deadline mention, the Confirmation Chases, the Confirmation Deadline
 * list and the Raid Reminders of the current Raid. Each notice is recorded before it is posted, so a failed post is
 * logged once and never sent twice, also across restarts. Off while the War Council role is unset.
 */
export function createRaidClock(deps) {
    const { raids, server, settings } = deps;
    async function post(channelName, text, mentioned) {
        const channelId = server.channelIdNamed(channelName);
        if (channelId === undefined) {
            await server.log(`A Raid notice was not posted: the server has no #${channelName}.`);
            return;
        }
        for (const message of textWithMentions(text, mentioned))
            await server.post(channelId, message);
    }
    function unconfirmed(raid) {
        const confirmed = new Set(raids.confirmations(raid.id).map((confirmation) => confirmation.tag));
        return onPlan(raid).filter((tag) => !confirmed.has(tag));
    }
    async function send(raid, notice, members, warCouncil) {
        switch (notice.kind) {
            case "plan-deadline": {
                const deadline = planDeadlineOf(raid, settings.planHours);
                await post(LEADERS_CHANNEL, raidMessages.planDeadline(deadline, raid.start), holdersOfRole(await members(), warCouncil));
                await server.log(`Plan Deadline: no Battle Plan was published for the Raid of ${raid.id}; the War Council was told.`);
                return;
            }
            case "chase": {
                const missing = unconfirmed(raid);
                if (missing.length === 0) {
                    await server.log(`Confirmation Chase (${notice.key}) for the Raid of ${raid.id}: every Alliance on the plan has confirmed.`);
                    return;
                }
                const deadline = confirmationDeadlineOf(raid, settings.confirmationHours);
                await post(LEADERS_CHANNEL, raidMessages.chase(missing, deadline), leadersOf(await members(), missing));
                await server.log(`Confirmation Chase (${notice.key}) for the Raid of ${raid.id}: ${missing.map((tag) => `[${tag}]`).join(", ")}.`);
                return;
            }
            case "confirmation-deadline": {
                const missing = unconfirmed(raid);
                const text = missing.length === 0 ? raidMessages.deadlineAllConfirmed : raidMessages.deadlineMissing(missing);
                await post(LEADERS_CHANNEL, text, holdersOfRole(await members(), warCouncil));
                await server.log(`Confirmation Deadline for the Raid of ${raid.id}: ${missing.length.toString()} Alliances missing.`);
                return;
            }
            case "reminder":
                await remind(raid, notice, members);
                return;
        }
    }
    async function remind(raid, notice, members) {
        const phase = notice.phase;
        const assignments = raid.plan.assignments.filter((assignment) => phase === undefined || assignment.phase === phase.name);
        const tags = [...new Set(assignments.map((assignment) => assignment.tag))].sort((a, b) => a.localeCompare(b));
        if (tags.length === 0) {
            await server.log(`Phase ${phase?.name ?? "start"} of the Raid of ${raid.id} has no Assignments; no Raid Reminder was posted.`);
            return;
        }
        for (const tag of tags) {
            const channelId = server.allianceChatId(tag);
            if (channelId === undefined) {
                await server.log(`The Raid Reminder for [${tag}] was not posted: its area has no alliance-chat.`);
                continue;
            }
            const lines = reminderLines(raid, assignments.filter((assignment) => assignment.tag === tag));
            const text = raidMessages.reminder(tag, lines, phase?.name);
            for (const message of textWithMentions(text, allianceMembersOf(await members(), tag)))
                await server.post(channelId, message);
        }
        await server.log(`Raid Reminder (${phase === undefined ? "before the start" : `Phase ${phase.name}`}) for ${tags.map((tag) => `[${tag}]`).join(", ")}.`);
    }
    async function run() {
        const { warCouncilRoleId, startMinutes } = settings;
        if (warCouncilRoleId === undefined || startMinutes === undefined)
            return;
        const now = deps.now();
        const { id, start } = currentRaidOf(now, startMinutes);
        const raid = raids.find(id)?.raid ?? newRaid(id, start);
        const plan = dueNotices(raid, { planHours: settings.planHours, confirmationHours: settings.confirmationHours }, raids.noticesHandled(id), now);
        for (const notice of plan.record)
            raids.recordNotice(raid, notice.key, now);
        let listed;
        const members = () => (listed ??= server.members());
        for (const notice of plan.send) {
            raids.recordNotice(raid, notice.key, now);
            try {
                await send(raid, notice, members, warCouncilRoleId);
            }
            catch (error) {
                const line = `Sending the Raid notice ${notice.key} failed: ${errorMessage(error)}`;
                deps.logError(line);
                await server.log(line).catch(() => undefined);
            }
        }
    }
    return {
        async tick() {
            try {
                await run();
            }
            catch (error) {
                deps.logError(`The Raid clock failed: ${errorMessage(error)}`);
            }
        },
    };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=raid-clock.js.map