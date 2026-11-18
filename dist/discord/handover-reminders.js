import { nextHoldingAlliance, nextRoyalCitySiege, sameTag, } from "../domain/city-rotation.js";
import { dueHandoverPosts, HANDOVER_POST_KINDS } from "../domain/handover.js";
import { allianceRoleName } from "../domain/managed-roles.js";
import { handoverReminderText, nextHolderAnnouncement, noLeaderLogLine, } from "./handover-texts.js";
import { textWithMentions } from "./mentions.js";
/** The role of an Alliance's leader. */
const R5_ROLE = "R5";
const CHANNEL_NAMES = {
    "reminder-24h": "#nap-leaders",
    "reminder-1h": "#nap-leaders",
    announcement: "#home-kingdom-announcements",
};
const POST_NAMES = {
    "reminder-24h": "The 24-hour Handover Reminder",
    "reminder-1h": "The 1-hour Handover Reminder",
    announcement: "The next-holder announcement",
};
/**
 * Creates the Handover Reminders. Before each Friday Royal City siege in Rotation mode, a Handover Reminder goes to
 * #nap-leaders 24 hours and 1 hour before, mentioning the R5s of the outgoing Holding Alliance and of the receiving
 * Alliance, and the next-holder announcement goes to #home-kingdom-announcements with the first. Each post is recorded
 * before it is sent, so it goes out at most once per siege; a failed post is logged once and not retried. A post missed
 * while Neil was off goes out late before the siege; a 24-hour reminder overtaken by the 1-hour one is dropped.
 */
export function createHandoverReminders(deps) {
    const { server, handovers } = deps;
    /** The Alliances of the coming Handover; undefined when there is nothing to hand over. */
    function alliancesOfHandover() {
        if (deps.mode !== "rotation")
            return undefined;
        const { order, holding } = deps.rotation.load();
        if (order === undefined || order.length === 0)
            return undefined;
        const outgoing = holding ?? order[0] ?? "";
        const receiving = nextHoldingAlliance({ order, holding: outgoing });
        return sameTag(outgoing, receiving) ? undefined : { outgoing, receiving };
    }
    /** The Members who hold R5 and the Alliance's role. */
    async function leadersOf(tag) {
        const leaders = new Set(await server.holdersOf(R5_ROLE));
        return (await server.holdersOf(allianceRoleName(tag))).filter((memberId) => leaders.has(memberId));
    }
    async function postReminder(kind, alliances, siege) {
        const channelId = server.napLeadersChannelId();
        if (channelId === undefined) {
            deps.logError(`${POST_NAMES[kind]} was not posted: the server has no ${CHANNEL_NAMES[kind]}`);
            return;
        }
        const mentioned = [];
        for (const tag of [alliances.outgoing, alliances.receiving]) {
            const leaders = await leadersOf(tag);
            if (leaders.length === 0)
                await server.log(noLeaderLogLine(kind, tag));
            mentioned.push(...leaders.filter((memberId) => !mentioned.includes(memberId)));
        }
        for (const message of textWithMentions(handoverReminderText(kind, alliances, siege), mentioned)) {
            await server.post(channelId, message);
        }
    }
    async function postAnnouncement(alliances, siege) {
        const channelId = server.kingdomAnnouncementsChannelId();
        if (channelId === undefined) {
            deps.logError(`${POST_NAMES.announcement} was not posted: the server has no ${CHANNEL_NAMES.announcement}`);
            return;
        }
        await server.post(channelId, nextHolderAnnouncement(alliances, siege));
    }
    async function postDue() {
        const alliances = alliancesOfHandover();
        if (alliances === undefined)
            return;
        const now = deps.now();
        const siege = nextRoyalCitySiege(now);
        const sent = new Set(HANDOVER_POST_KINDS.filter((kind) => handovers.handoverPosted(siege, kind)));
        const due = dueHandoverPosts(siege, sent, now);
        for (const kind of due.drop)
            handovers.recordHandoverPosted(siege, kind, now);
        for (const kind of due.post) {
            handovers.recordHandoverPosted(siege, kind, now);
            try {
                if (kind === "announcement")
                    await postAnnouncement(alliances, siege);
                else
                    await postReminder(kind, alliances, siege);
            }
            catch (error) {
                deps.logError(`${POST_NAMES[kind]} failed: ${errorMessage(error)}`);
            }
        }
    }
    return {
        async tick() {
            try {
                await postDue();
            }
            catch (error) {
                deps.logError(`Posting the Handover Reminders failed: ${errorMessage(error)}`);
            }
        },
    };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=handover-reminders.js.map