import { MessageFlags } from "discord.js";
import { sortRoster } from "../domain/alliance-rank.js";
import { mayChangeReaper } from "../domain/exile.js";
import { parseAllianceKey, parseKingdom, parseUid } from "../domain/lookup-input.js";
import { listedPlayerMatches, rankedAllianceMatches, } from "../domain/player.js";
import { alliancePickLabel, lookupMessages, playerPickLabel, renderAllianceCard, renderAllianceComponents, } from "./lookup-cards.js";
import { parseOverviewCustomId, renderOverview } from "./overview-texts.js";
import { allianceCardMessage, allianceFailureMessage, allowedMentions, answer, callerOf, errorText, playerCardMessage, playerFailureText, replyPrivately, showLookup, withCallerUsage, } from "./lookup.js";
import { recordFoundExile } from "./reaper.js";
import { reaperMessages } from "./reaper-texts.js";
import { refusalMessage } from "./usage-texts.js";
import { isOwner, pageOf, parseCustomId, } from "./pick-sessions.js";
const pickMessages = {
    notOwner: "Only the Member who ran this command can use this menu. Run /player or /alliance yourself.",
    expired: "This menu has expired. Run the command again.",
};
/** The entry a select menu value picked, by its index in the list shown; undefined when no entry has that index. */
function pickedAt(entries, value) {
    return value === undefined ? undefined : entries[Number(value)];
}
/** The Kingdom and tag an Alliance match is looked up by; undefined when the Game gave values that are not valid. */
function allianceToLookUp(match) {
    const key = parseAllianceKey(match.tag);
    const kingdom = parseKingdom(match.kingdom);
    return key.ok && kingdom.ok ? { kingdom: kingdom.value, key: key.value } : undefined;
}
/** Privately tells the caller a follow-up; the public card is the only message the others see. */
async function followUpPrivately(interaction, message) {
    await interaction.followUp({ ...message, flags: MessageFlags.Ephemeral, allowedMentions });
}
/** The private menu now says what is shown, without its menu; the Game API is asked after this, so Discord's limit holds. */
async function showPicked(interaction, label) {
    await interaction.update({ content: lookupMessages.showing(label), components: [], allowedMentions });
}
/**
 * Answers a pick from a pick list once the menu says what is shown: a card is posted publicly as a follow-up, the
 * reason privately. A lookup that throws, or a card that cannot be posted, is logged and told as unavailable.
 */
async function answerPick(interaction, context, caller, ask, card, failureMessage) {
    let result;
    try {
        result = await ask();
    }
    catch (error) {
        context.logError(`Looking up the picked match failed: ${errorText(error)}`);
        await followUpPrivately(interaction, withCallerUsage(context, caller, { content: lookupMessages.unavailable }));
        return;
    }
    if (result.kind === "allowance-spent") {
        await followUpPrivately(interaction, {
            content: refusalMessage(result.resetsAt, context.allowance(), context.now()),
        });
        return;
    }
    if (result.kind !== "found") {
        await followUpPrivately(interaction, withCallerUsage(context, caller, failureMessage(result, context.now())));
        return;
    }
    try {
        const message = withCallerUsage(context, caller, card(result.value, result.fetchedAt, context.now()));
        await interaction.followUp({ ...message, allowedMentions });
    }
    catch (error) {
        context.logError(`Showing the picked card failed: ${errorText(error)}`);
        await followUpPrivately(interaction, withCallerUsage(context, caller, { content: lookupMessages.unavailable }));
    }
}
/** The owner picked a Player match: the Player's card is posted publicly, looked up by uid, charged to the picker. */
async function pickPlayerMatch(interaction, match, context) {
    const parsedUid = match === undefined ? undefined : parseUid(match.uid);
    if (match === undefined || parsedUid === undefined || !parsedUid.ok) {
        await replyPrivately(interaction, lookupMessages.unavailable);
        return;
    }
    await showPicked(interaction, playerPickLabel(match));
    const uid = parsedUid.value;
    const caller = callerOf(interaction, context.officerRoleIds);
    await answerPick(interaction, context, caller, () => context.gameApi.chargedTo(caller).getPlayer(uid), playerCardMessage, (failure, now) => ({ content: playerFailureText(failure, uid, now) }));
}
/**
 * The owner picked a Player of the /reaper add pick list: the Player is looked up by uid, stored as an Exile with the
 * reason the list carries, and logged. The answer is private, since REAPER is not a public card.
 */
async function pickExileMatch(interaction, match, reason, context) {
    const parsedUid = match === undefined ? undefined : parseUid(match.uid);
    const { reaper, channels, editorOf, homeKingdom } = context;
    if (match === undefined ||
        parsedUid === undefined ||
        !parsedUid.ok ||
        reaper === undefined ||
        channels === undefined ||
        editorOf === undefined ||
        homeKingdom === undefined) {
        await replyPrivately(interaction, lookupMessages.unavailable);
        return;
    }
    const editor = editorOf(interaction.user.id);
    if (editor === undefined || !mayChangeReaper(editor, homeKingdom)) {
        await replyPrivately(interaction, reaperMessages.refused);
        return;
    }
    await showPicked(interaction, playerPickLabel(match));
    const uid = parsedUid.value;
    let result;
    try {
        result = await context.gameApi.getPlayer(uid, "lookup");
    }
    catch (error) {
        context.logError(`Looking up the picked Player for REAPER failed: ${errorText(error)}`);
        await followUpPrivately(interaction, { content: lookupMessages.unavailable });
        return;
    }
    if (result.kind !== "found") {
        await followUpPrivately(interaction, { content: playerFailureText(result, uid, context.now()) });
        return;
    }
    const content = await recordFoundExile(result.value, result.fetchedAt, reason, interaction.user.id, {
        reaper,
        channels,
        now: context.now,
        logError: context.logError,
    });
    await followUpPrivately(interaction, { content });
}
/**
 * The owner picked an Alliance match: its card is posted publicly with its roster menu, looked up by tag and Kingdom.
 * An ambiguous answer opens a pick list for the owner, as the command does.
 */
async function pickAllianceMatch(interaction, match, context) {
    const target = match === undefined ? undefined : allianceToLookUp(match);
    if (match === undefined || target === undefined) {
        await replyPrivately(interaction, lookupMessages.unavailable);
        return;
    }
    await showPicked(interaction, alliancePickLabel(match));
    const { kingdom, key } = target;
    const ownerId = interaction.user.id;
    const caller = callerOf(interaction, context.officerRoleIds);
    await answerPick(interaction, context, caller, () => context.gameApi.chargedTo(caller).getAlliance(kingdom, key), (alliance, fetchedAt, now) => allianceCardMessage(alliance, fetchedAt, now, ownerId, context.pickSessions), (failure, now) => allianceFailureMessage(failure, key, lookupMessages.allianceNotFound(key, kingdom), ownerId, context.pickSessions, now));
}
/**
 * The owner picked a member of the roster menu's page: the member's Player card is posted publicly as a reply under
 * the thinking placeholder, and the Alliance card stays as it is. `shownEntries` is the page the menu shows.
 */
async function pickRosterMember(interaction, shownEntries, value, context) {
    const entry = pickedAt(shownEntries, value);
    if (entry === undefined) {
        await replyPrivately(interaction, lookupMessages.unavailable);
        return;
    }
    const caller = callerOf(interaction, context.officerRoleIds);
    await showLookup(interaction, context, caller, () => context.gameApi.chargedTo(caller).getPlayer(entry.uid), playerCardMessage, (failure, now) => ({ content: playerFailureText(failure, entry.uid, now) }));
}
/**
 * Answers a select menu of a pick list: the match or roster member the value names, by the kind of pick list. A roster
 * menu names its page in its custom id; an id without one (sent before pages were named) takes the page last turned to.
 */
async function pickFrom(interaction, session, menuPage, context) {
    const value = interaction.values?.[0];
    const { choice } = session;
    switch (choice.kind) {
        case "players":
            await pickPlayerMatch(interaction, pickedAt(listedPlayerMatches(choice.matches).listed, value), context);
            return;
        case "alliances":
            await pickAllianceMatch(interaction, pickedAt(rankedAllianceMatches(choice.matches), value), context);
            return;
        case "roster":
            await pickRosterMember(interaction, pageOf(choice.entries, menuPage ?? session.page), value, context);
            return;
        case "exile":
            await pickExileMatch(interaction, pickedAt(listedPlayerMatches(choice.matches).listed, value), choice.reason, context);
            return;
    }
}
/** Turns a roster menu to a page: the menu of that page replaces the old one; the Game API is not asked. */
async function turnRosterPage(interaction, session, page, context) {
    const { choice } = session;
    if (choice.kind !== "roster") {
        await replyPrivately(interaction, lookupMessages.unavailable);
        return;
    }
    context.pickSessions.turnPage(session.id, page);
    const caller = callerOf(interaction, context.officerRoleIds);
    await interaction.update(withCallerUsage(context, caller, {
        embeds: [renderAllianceCard(choice.alliance, choice.fetchedAt, context.now(), page)],
        components: renderAllianceComponents(choice.alliance, page, session.id),
    }));
}
/**
 * Opens a pick list for the asker that holds the Alliance, so the page buttons of an Alliance Overview can show it again;
 * the pick list belongs to the asker, not to the owner of the card. Returns its id.
 */
function openOverviewSession(alliance, fetchedAt, askerId, pickSessions, now) {
    return pickSessions.open(askerId, { kind: "roster", entries: sortRoster(alliance.roster), alliance, fetchedAt }, now);
}
/**
 * The Alliance Overview of a card's pick list for the asker: the one the asker already holds under that pick list while
 * it is open; otherwise a new one, which the pick list then remembers for the asker.
 */
function overviewUnderCard(card, alliance, fetchedAt, askerId, pickSessions, now) {
    const heldId = card.overviews.get(askerId);
    if (heldId !== undefined && pickSessions.get(heldId, now) !== "expired") {
        return renderOverview(alliance, fetchedAt, now, heldId, 0);
    }
    const sessionId = openOverviewSession(alliance, fetchedAt, askerId, pickSessions, now);
    pickSessions.linkOverview(card.id, askerId, sessionId);
    return renderOverview(alliance, fetchedAt, now, sessionId, 0);
}
/**
 * Sends an Alliance Overview privately. A refused Discord call is logged, and the press is answered as unavailable so it
 * is never left unacknowledged.
 */
async function sendOverview(interaction, context, send) {
    try {
        await send();
    }
    catch (error) {
        context.logError(`Showing the Alliance Overview failed: ${errorText(error)}`);
        await replyPrivately(interaction, lookupMessages.unavailable);
    }
}
/**
 * The Overview button of an Alliance card. While the card's pick list holds the Alliance, the overview is shown from it,
 * with no Game API call; once that pick list is gone, the Alliance is looked up again, for the lookup. The overview is
 * private to the Member who pressed.
 */
async function pressOverview(interaction, press, context) {
    const kingdom = parseKingdom(Number(press.kingdom));
    const key = parseAllianceKey(press.tag);
    if (!kingdom.ok || !key.ok) {
        await replyPrivately(interaction, lookupMessages.unavailable);
        return;
    }
    const askerId = interaction.user.id;
    const caller = callerOf(interaction, context.officerRoleIds);
    const session = context.pickSessions.get(press.sessionId, context.now());
    if (session !== "expired" && session.choice.kind === "roster") {
        const { alliance, fetchedAt } = session.choice;
        const overview = overviewUnderCard(session, alliance, fetchedAt, askerId, context.pickSessions, context.now());
        await sendOverview(interaction, context, () => interaction.reply({ ...withCallerUsage(context, caller, overview), flags: MessageFlags.Ephemeral, allowedMentions }));
        return;
    }
    const kingdomNumber = kingdom.value;
    const tag = key.value;
    await showLookup(interaction, context, caller, () => context.gameApi.chargedTo(caller).getAlliance(kingdomNumber, tag), (alliance, fetchedAt, now) => renderOverview(alliance, fetchedAt, now, openOverviewSession(alliance, fetchedAt, askerId, context.pickSessions, now), 0), (failure, now) => failure.kind === "ambiguous"
        ? { content: lookupMessages.tryAgain }
        : allianceFailureMessage(failure, tag, lookupMessages.allianceNotFound(tag, kingdomNumber), askerId, context.pickSessions, now), { flags: MessageFlags.Ephemeral });
}
/** Answers a button or select menu of a pick list: only its owner, only while it is open, the rest privately. */
export async function handlePick(interaction, context) {
    await answer("a pick list", context, async () => {
        const parsed = parseCustomId(interaction.customId);
        if (parsed !== undefined && parsed.action === "overview") {
            await pressOverview(interaction, parsed, context);
            return;
        }
        const session = parsed === undefined ? "expired" : context.pickSessions.get(parsed.sessionId, context.now());
        if (parsed === undefined || session === "expired") {
            await replyPrivately(interaction, pickMessages.expired);
            return;
        }
        if (!isOwner(session, interaction.user.id)) {
            await replyPrivately(interaction, pickMessages.notOwner);
            return;
        }
        if (parsed.action === "page") {
            await turnRosterPage(interaction, session, parsed.page, context);
            return;
        }
        await pickFrom(interaction, session, parsed.page, context);
    });
}
/**
 * Turns an Alliance Overview to the page pressed. Only the Member who pressed Overview may turn it, while its pick list
 * is open; the page is redrawn in place, with no Game API call.
 */
export async function handleOverview(interaction, context) {
    await answer("an Alliance Overview", context, async () => {
        const parsed = parseOverviewCustomId(interaction.customId);
        const session = parsed === undefined ? "expired" : context.pickSessions.get(parsed.sessionId, context.now());
        if (parsed === undefined || session === "expired") {
            await replyPrivately(interaction, pickMessages.expired);
            return;
        }
        if (!isOwner(session, interaction.user.id)) {
            await replyPrivately(interaction, pickMessages.notOwner);
            return;
        }
        if (session.choice.kind !== "roster") {
            await replyPrivately(interaction, lookupMessages.unavailable);
            return;
        }
        const { alliance, fetchedAt } = session.choice;
        const caller = callerOf(interaction, context.officerRoleIds);
        await sendOverview(interaction, context, () => interaction.update(withCallerUsage(context, caller, renderOverview(alliance, fetchedAt, context.now(), session.id, parsed.page, parsed.sort))));
    });
}
//# sourceMappingURL=pick.js.map