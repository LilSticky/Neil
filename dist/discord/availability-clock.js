import { pollStep } from "../domain/availability.js";
import { currentRaidOf, newRaid, raidStartOf } from "../domain/raid.js";
import { createAvailabilityBoard } from "./availability-board.js";
import { pollCard, pollRows, summaryCard } from "./availability-texts.js";
import { LEADERS_CHANNEL } from "./raid-plan.js";
const NO_MENTIONS = { parse: [] };
/**
 * The Availability clock, on the one-minute tick after the Raid clock. 72 hours before the Raid start it posts one poll
 * card in every Home Kingdom Alliance's alliance-chat and the Availability Summary in #kvk-leaders, once per Raid, also
 * across restarts (the poll is recorded before anything is posted). At the start, or when the War Council cancels the
 * Raid, it edits the cards to the final numbers without buttons, then deletes the answers. Nothing mentions anybody. Off
 * while the War Council role or the Raid start is unset.
 */
export function createAvailabilityClock(deps) {
    const { availability, server } = deps;
    const board = deps.board ?? createAvailabilityBoard({ availability, server });
    function stateOf(poll) {
        return poll?.state ?? { kind: "not-opened" };
    }
    async function open(raid, now) {
        if (!availability.open(raid.id, now))
            return;
        const tags = server.allianceTags();
        const zero = { whale: 0, dolphin: 0, seal: 0, strategy: 0, smallFry: 0, notAvailable: 0 };
        let posted = 0;
        for (const tag of tags) {
            const channelId = server.allianceChatId(tag);
            if (channelId === undefined) {
                await server.log(`The Availability Poll card of [${tag}] was not posted: its area has no alliance-chat.`);
                continue;
            }
            try {
                const card = await server.post(channelId, {
                    embeds: [pollCard(raid, tag, zero, "open")],
                    components: pollRows(raid.id, tag, "open"),
                    allowedMentions: NO_MENTIONS,
                });
                availability.saveCard(raid.id, tag, card);
                posted += 1;
            }
            catch (error) {
                await logFailure(`The Availability Poll card of [${tag}] could not be posted: ${errorMessage(error)}`);
            }
        }
        const leadersChannel = server.channelIdNamed(LEADERS_CHANNEL);
        if (leadersChannel === undefined) {
            await server.log(`The Availability Summary was not posted: the server has no #${LEADERS_CHANNEL}.`);
        }
        else {
            try {
                const summary = summaryCard(raid, { alliances: tags.map((tag) => ({ tag, counts: zero })), kingdom: zero }, "open");
                availability.saveSummaryCard(raid.id, await server.post(leadersChannel, { embeds: [summary], allowedMentions: NO_MENTIONS }));
            }
            catch (error) {
                await logFailure(`The Availability Summary could not be posted: ${errorMessage(error)}`);
            }
        }
        await server.log(`Availability Poll opened for the Raid of ${raid.id}: ${posted.toString()} of ${tags.length.toString()} Alliances got a poll card.`);
    }
    async function close(raid, poll, reason, now) {
        const kingdom = board.totals(poll).kingdom;
        await board.showAll(raid, poll, reason);
        availability.close(raid.id, now, reason);
        const how = reason === "cancelled" ? "closed, the Raid was cancelled" : "closed at the Raid start";
        await server.log(`Availability Poll for the Raid of ${raid.id} ${how}. Kingdom: Whales ${kingdom.whale.toString()}, Dolphins ${kingdom.dolphin.toString()}, Seals ${kingdom.seal.toString()}, Fighters ${kingdom.strategy.toString()}; Small Fry ${kingdom.smallFry.toString()}; Not available ${kingdom.notAvailable.toString()}.`);
    }
    async function step(raid, now) {
        const poll = availability.poll(raid.id);
        const next = pollStep(raid, stateOf(poll), now);
        if (next.kind === "open")
            await open(raid, now);
        if (next.kind === "close" && poll !== undefined)
            await close(raid, poll, next.reason, now);
    }
    async function logFailure(line) {
        deps.logError(line);
        await server.log(line).catch(() => undefined);
    }
    async function run() {
        const { warCouncilRoleId } = deps.settings;
        if (warCouncilRoleId === undefined)
            return;
        const now = deps.now();
        const raidOf = (id, start) => deps.raids.find(id)?.raid ?? newRaid(id, start);
        const current = currentRaidOf(now);
        // A poll left open from an earlier week (Neil was off at its start) closes too, so its answers do not stay.
        const ids = [...new Set([...availability.openPolls(), current.id])];
        for (const id of ids) {
            try {
                await step(raidOf(id, id === current.id ? current.start : raidStartOf(id)), now);
            }
            catch (error) {
                await logFailure(`The Availability Poll of the Raid of ${id} failed: ${errorMessage(error)}`);
            }
        }
    }
    return {
        async tick() {
            try {
                await run();
            }
            catch (error) {
                deps.logError(`The Availability clock failed: ${errorMessage(error)}`);
            }
        },
    };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=availability-clock.js.map