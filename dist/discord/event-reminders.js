import { dueReminders, eventOwnerOf, kindForEventName, } from "../domain/events.js";
import { allianceRoleName } from "../domain/managed-roles.js";
import { isKnownGuest } from "../domain/preferences.js";
import { eventChannelId, eventOf, guildIdOf } from "./events.js";
import { eventReminderMessages } from "./event-texts.js";
const MINUTE_MS = 60_000;
/** How often the reminders are ticked: once a minute, as the Event Reminders are due to the minute. */
export const REMINDER_TICK_MS = MINUTE_MS;
/** The key of an owner's Event Kinds: "kingdom" for the Home Kingdom, or the Alliance's tag. */
function kindOwnerOf(owner) {
    return owner.kind === "kingdom" ? "kingdom" : owner.tag;
}
/** The reminder a sent reminder stands for: the start, or the Sign-up Deadline of the kind that has one. */
function reminderOf(event, sent, kind) {
    if (sent.target === "start" || kind?.signupOffsetMinutes === undefined)
        return { event, target: "start" };
    const signUpDeadline = new Date(event.start.getTime() - kind.signupOffsetMinutes * MINUTE_MS);
    return { event, target: "signup", signUpDeadline };
}
/**
 * Creates the Event reminders. A Kind's lead times, or the default 30 minutes before the start, each post once to the
 * Event's channel and mention the Interested Members who may take part: Linked, on the server, and for a Kingdom Event
 * not a Guest, for an Alliance Event holding the Alliance's role. Nobody to mention posts nothing.
 */
export function createEventReminders(deps) {
    const { events, server } = deps;
    /** The Interested Members who may take part in the Event of this owner. */
    async function mentionedOf(owner, eventId) {
        const holders = owner.kind === "alliance" ? await server.holdersOf(allianceRoleName(owner.tag)) : [];
        const linked = (await server.interestedIn(eventId)).filter((memberId) => deps.links.linkFor(memberId) !== undefined);
        const onServer = await server.membersOnServer(linked);
        return linked.filter((memberId) => {
            if (!onServer.has(memberId))
                return false;
            return owner.kind === "alliance"
                ? holders.includes(memberId)
                : !isKnownGuest(deps.applied.get(memberId)?.roles, deps.homeKingdom);
        });
    }
    async function remind(scheduledEvent) {
        const read = eventOf(scheduledEvent);
        const guildId = guildIdOf(scheduledEvent);
        if (!read.ok || guildId === undefined)
            return;
        const event = read.value;
        const stored = events.findEvent(event.id);
        if (stored === undefined || stored.invitedAt === undefined)
            return;
        const owner = eventOwnerOf(event.name);
        const kind = kindForEventName(events.listKinds(kindOwnerOf(owner)), event.name);
        const plan = dueReminders(event.start, event.status, kind, events.remindersSent(event.id), new Date(stored.firstSeenAt), deps.now());
        for (const reminder of plan.record)
            events.recordReminderSent(event.id, reminder);
        for (const sent of plan.send) {
            const mentioned = await mentionedOf(owner, event.id);
            if (mentioned.length === 0) {
                events.recordReminderSent(event.id, sent);
                continue;
            }
            const channelId = eventChannelId(server, owner);
            if (channelId === undefined) {
                deps.logError(`The reminder of the Event ${event.name} was not posted: its Alliance has no alliance-chat`);
                continue;
            }
            for (const message of eventReminderMessages(guildId, reminderOf(event, sent, kind), mentioned)) {
                await server.post(channelId, message);
            }
            events.recordReminderSent(event.id, sent);
            await server.log(`The reminder of the Event "${event.name}" was posted, mentioning ${mentioned.length.toString()} Members.`);
        }
    }
    return {
        async tick() {
            let scheduled;
            try {
                scheduled = await server.scheduledEvents();
            }
            catch (error) {
                deps.logError(`Reading the scheduled events failed: ${errorMessage(error)}`);
                return;
            }
            for (const scheduledEvent of scheduled) {
                try {
                    await remind(scheduledEvent);
                }
                catch (error) {
                    deps.logError(`Reminding about an Event failed: ${errorMessage(error)}`);
                }
            }
        },
        onDeleted(eventId) {
            events.deleteEvent(eventId);
        },
    };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=event-reminders.js.map