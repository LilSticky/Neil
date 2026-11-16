import { availabilityTotals, countsOf } from "../domain/availability.js";
import { pollCard, pollRows, summaryCard } from "./availability-texts.js";
/**
 * The poll cards and the Availability Summary as Neil keeps them: edited after every answer and at the close. A card
 * that is gone is logged once and not posted again; a failed edit is logged and the next card is still edited.
 */
export function createAvailabilityBoard(deps) {
    const { server } = deps;
    const goneLogged = new Set();
    function totals(poll) {
        return availabilityTotals(deps.availability.answers(poll.raidId), [...poll.cards.keys()]);
    }
    async function edit(card, change, what) {
        try {
            if (await server.edit(card, change))
                return;
            if (goneLogged.has(card.messageId))
                return;
            goneLogged.add(card.messageId);
            await server.log(`The ${what} is gone; Neil does not post it again.`);
        }
        catch (error) {
            await server.log(`The ${what} could not be edited: ${errorMessage(error)}`).catch(() => undefined);
        }
    }
    async function show(raid, poll, tags, state) {
        const current = totals(poll);
        for (const tag of tags) {
            const card = poll.cards.get(tag);
            if (card === undefined)
                continue;
            await edit(card, { embeds: [pollCard(raid, tag, countsOf(current, tag), state)], components: pollRows(raid.id, tag, state) }, `Availability Poll card of [${tag}] for the Raid of ${raid.id}`);
        }
        if (poll.summaryCard !== undefined) {
            await edit(poll.summaryCard, { embeds: [summaryCard(raid, current, state)], components: [] }, `Availability Summary for the Raid of ${raid.id}`);
        }
    }
    return {
        totals,
        refresh: (raid, poll, tags) => show(raid, poll, tags, "open"),
        showAll: (raid, poll, state) => show(raid, poll, [...poll.cards.keys()], state),
    };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=availability-board.js.map