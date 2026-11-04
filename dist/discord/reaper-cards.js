import { ButtonStyle, ComponentType, } from "discord.js";
import { utcDayOf } from "../domain/daily-quota.js";
import { allowedMentions, sharedPlayerFailureText } from "./lookup.js";
import { CARD_COLOR, escapeText, fitTitle, kingdomAuthor, renderPlayerCard } from "./lookup-cards.js";
import { clampReaperPage, reaperPageCount, reaperPageOf, reaperPageCustomId } from "./reaper-pages.js";
import { reaperMessages } from "./reaper-texts.js";
/** How many of the closest Exiles one page of /reaper closest shows. */
export const CLOSEST_PAGE_SIZE = 3;
/** How many Exiles one page of /reaper list shows. */
export const LIST_PAGE_SIZE = 8;
/** The page buttons under a paged answer: Previous, the page and Next. None when there is one page or no session. */
export function pageButtonsOf(sessionId, page, pageCount) {
    if (sessionId === undefined || pageCount <= 1)
        return [];
    return [
        {
            type: ComponentType.ActionRow,
            components: [
                {
                    type: ComponentType.Button,
                    style: ButtonStyle.Secondary,
                    label: reaperMessages.previous,
                    custom_id: reaperPageCustomId(sessionId, Math.max(0, page - 1)),
                    disabled: page === 0,
                },
                {
                    type: ComponentType.Button,
                    style: ButtonStyle.Secondary,
                    label: reaperMessages.pageLabel(page + 1, pageCount),
                    custom_id: `reaper:${sessionId}:info`,
                    disabled: true,
                },
                {
                    type: ComponentType.Button,
                    style: ButtonStyle.Secondary,
                    label: reaperMessages.next,
                    custom_id: reaperPageCustomId(sessionId, Math.min(pageCount - 1, page + 1)),
                    disabled: page === pageCount - 1,
                },
            ],
        },
    ];
}
/** How many Exiles were left out, shielded or unreadable. */
function leftOutTotal(leftOut) {
    return leftOut.shielded + leftOut.unreadable;
}
/** The header of /reaper closest: the origin, that shields cannot be seen, and the Exiles left out when there are any. */
function closestHeader(ranking) {
    const lines = [reaperMessages.closestOrigin(ranking.origin)];
    if (leftOutTotal(ranking.leftOut) > 0)
        lines.push(reaperMessages.leftOut(ranking.leftOut));
    return {
        title: reaperMessages.closestTitle(ranking.kingdom),
        description: lines.join("\n"),
        color: CARD_COLOR,
    };
}
/**
 * One Exile of the answer: the player card as /player shows it when the Game read the Player this time, else the name and
 * Kingdom alone; then coordinates (marked with the stored time when not read now), distance, reason and the day exiled.
 */
function closestCard(entry, reads, now) {
    const { exile } = entry;
    const reaperFields = [
        {
            name: reaperMessages.fields.coordinates,
            value: reaperMessages.coordinates(entry.position, entry.stale ? exile.lastPosition?.at : undefined),
            inline: true,
        },
        { name: reaperMessages.fields.distance, value: reaperMessages.distance(entry.distance), inline: true },
        { name: reaperMessages.fields.reason, value: escapeText(exile.reason), inline: false },
        { name: reaperMessages.fields.exiledOn, value: utcDayOf(exile.addedAt), inline: true },
    ];
    const read = reads.get(exile.uid);
    if (read === undefined) {
        return {
            title: fitTitle(escapeText(exile.name)),
            color: CARD_COLOR,
            author: kingdomAuthor(exile.kingdom, undefined),
            fields: reaperFields,
        };
    }
    const card = renderPlayerCard(read.player, read.fetchedAt, now);
    return { ...card, fields: [...(card.fields ?? []), ...reaperFields] };
}
/** The text that replaces the cards when no Exile can be shown: the refusal, else why every Exile was left out, else none. */
function noCardsText(ranking, now) {
    if (ranking.refusal !== undefined)
        return sharedPlayerFailureText(ranking.refusal, now);
    if (leftOutTotal(ranking.leftOut) > 0)
        return reaperMessages.allLeftOut(ranking.leftOut);
    return reaperMessages.noExilesInKingdom(ranking.kingdom);
}
/**
 * The answer to /reaper closest on one page: the header and up to 3 Exile cards with the page buttons; or the text when
 * none can be shown.
 */
export function closestAnswer(ranking, now, page, sessionId) {
    if (ranking.ranking.length === 0)
        return { content: noCardsText(ranking, now), allowedMentions };
    const pageCount = reaperPageCount(ranking.ranking.length, CLOSEST_PAGE_SIZE);
    const current = clampReaperPage(page, pageCount);
    const cards = reaperPageOf(ranking.ranking, current, CLOSEST_PAGE_SIZE).map((entry) => closestCard(entry, ranking.reads, now));
    return {
        embeds: [closestHeader(ranking), ...cards],
        components: pageButtonsOf(sessionId, current, pageCount),
        allowedMentions,
    };
}
/** The answer to /reaper list on one page: one line per Exile, newest first, with the page buttons. */
export function listAnswer(exiles, page, sessionId) {
    const pageCount = reaperPageCount(exiles.length, LIST_PAGE_SIZE);
    const current = clampReaperPage(page, pageCount);
    const lines = reaperPageOf(exiles, current, LIST_PAGE_SIZE).map(reaperMessages.listLine);
    return {
        embeds: [{ title: reaperMessages.listTitle, description: lines.join("\n"), color: CARD_COLOR }],
        components: pageButtonsOf(sessionId, current, pageCount),
        allowedMentions,
    };
}
//# sourceMappingURL=reaper-cards.js.map