import { MessageFlags, } from "discord.js";
import { sortRoster } from "../domain/alliance-rank.js";
import { parseAllianceKey, parseKingdom, parsePlayerName, parseUid, } from "../domain/lookup-input.js";
import { listedAllianceMatches, listedPlayerMatches, } from "../domain/player.js";
import { lookupMessages, renderAllianceCard, renderAlliancePickList, renderPlayerCard, renderPlayerPickList, renderRosterComponents, } from "./lookup-cards.js";
/** Lookups never mention anyone, whatever the Game API or the Member typed. */
export const allowedMentions = { parse: [] };
/** The private text for a lookup that the Daily Quota or the Quota Reserve kept from the Game API. */
function quotaFailureText(failure, now) {
    return failure.kind === "quota-spent"
        ? lookupMessages.quotaSpent(failure.resetsAt, now)
        : lookupMessages.reserveKept(failure.resetsAt, now);
}
/** The texts every Player lookup shares: the quota, a busy tracker and a broken lookup. */
function sharedPlayerFailureText(failure, now) {
    switch (failure.kind) {
        case "quota-spent":
        case "reserve-kept":
            return quotaFailureText(failure, now);
        case "try-again":
            return lookupMessages.tryAgain;
        case "unavailable":
        case "ambiguous":
            // A Player lookup never gives "ambiguous" by uid; if it ever did, the honest answer is a broken lookup.
            return lookupMessages.unavailable;
    }
}
/** The private text for a Player looked up by uid that gave no card. */
export function playerFailureText(failure, uid, now) {
    switch (failure.kind) {
        case "not-found":
            return lookupMessages.playerNotFound(uid);
        case "not-prepared":
            // The tracker's answer for an unknown uid, but also for its own trouble (research R11).
            return lookupMessages.playerNotPrepared(uid);
        default:
            return sharedPlayerFailureText(failure, now);
    }
}
/** The private pick list for an ambiguous Player name, opened for the caller; with nothing to pick, a broken lookup. */
function playerPickList(matches, name, ownerId, pickSessions, now) {
    const { listed } = listedPlayerMatches(matches);
    if (listed.length === 0)
        return { content: lookupMessages.unavailable };
    const sessionId = pickSessions.open(ownerId, { kind: "players", matches: listed }, now);
    return renderPlayerPickList(name, matches, sessionId);
}
/** The private answer to a Player name that gave no card; an ambiguous name becomes a pick list. */
function playerNameFailureMessage(failure, name, kingdom, ownerId, pickSessions, now) {
    switch (failure.kind) {
        case "ambiguous":
            return playerPickList(failure.matches, name, ownerId, pickSessions, now);
        case "not-found":
            return { content: lookupMessages.playerNameNotFound(name, kingdom) };
        case "not-prepared":
            return { content: lookupMessages.playerNameNotPrepared(name) };
        default:
            return { content: sharedPlayerFailureText(failure, now) };
    }
}
/** The private pick list for an ambiguous Alliance, opened for the caller; with nothing to pick, a broken lookup. */
function alliancePickList(key, matches, ownerId, pickSessions, now) {
    const { listed } = listedAllianceMatches(matches);
    if (listed.length === 0)
        return { content: lookupMessages.unavailable };
    const sessionId = pickSessions.open(ownerId, { kind: "alliances", matches: listed }, now);
    return renderAlliancePickList(key, matches, sessionId);
}
/**
 * The private answer to an Alliance lookup that gave no card. `notFound` is the text for a missing Alliance, which
 * depends on how the Member asked; an ambiguous answer becomes a pick list.
 */
export function allianceFailureMessage(failure, key, notFound, ownerId, pickSessions, now) {
    switch (failure.kind) {
        case "not-found":
            return { content: notFound };
        case "ambiguous":
            return alliancePickList(key, failure.matches, ownerId, pickSessions, now);
        case "quota-spent":
        case "reserve-kept":
            return { content: quotaFailureText(failure, now) };
        case "not-prepared":
        case "try-again":
            return { content: lookupMessages.tryAgain };
        case "unavailable":
            return { content: lookupMessages.unavailable };
    }
}
/** The public reply that shows a Player: the Player card. */
export function playerCardMessage(player, fetchedAt, now) {
    return { embeds: [renderPlayerCard(player, fetchedAt, now)] };
}
/**
 * The public reply that shows an Alliance: its card and, when the roster has members, the roster menu under it. The
 * menu's pick list is opened for the caller, with the roster in the order the card lists it.
 */
export function allianceCardMessage(alliance, fetchedAt, now, ownerId, pickSessions) {
    const embeds = [renderAllianceCard(alliance, fetchedAt, now)];
    if (alliance.roster.length === 0)
        return { embeds };
    const entries = sortRoster(alliance.roster);
    const sessionId = pickSessions.open(ownerId, { kind: "roster", entries }, now);
    return { embeds, components: renderRosterComponents(entries, 0, sessionId) };
}
/** The text of a thrown value, for a log line. */
export function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}
/** Keeps a failed Discord call from escaping the handler; the failure is logged instead. */
export async function answer(command, context, respond) {
    try {
        await respond();
    }
    catch (error) {
        context.logError(`Answering ${command} failed: ${errorText(error)}`);
    }
}
/** Invalid input is answered privately at once, before any Game API call. */
export async function replyPrivately(interaction, content) {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions });
}
/** Removes the thinking placeholder and tells the caller the message privately. */
async function removePlaceholderAndTell(interaction, message) {
    await interaction.deleteReply();
    await interaction.followUp({ ...message, flags: MessageFlags.Ephemeral, allowedMentions });
}
/**
 * The shared lookup flow: a public thinking placeholder, then the card. When the lookup gives no card, or the card
 * cannot be sent, the placeholder is removed and the reason is told privately; a failed send is logged, and a lookup
 * that throws is logged and told as unavailable.
 */
export async function showLookup(interaction, context, ask, card, failureMessage) {
    await interaction.deferReply();
    let result;
    try {
        result = await ask();
    }
    catch (error) {
        context.logError(`Looking up failed: ${errorText(error)}`);
        await removePlaceholderAndTell(interaction, { content: lookupMessages.unavailable });
        return;
    }
    if (result.kind !== "found") {
        await removePlaceholderAndTell(interaction, failureMessage(result, context.now()));
        return;
    }
    try {
        const message = card(result.value, result.fetchedAt, context.now());
        await interaction.editReply({ ...message, allowedMentions });
    }
    catch (error) {
        context.logError(`Showing the card failed: ${errorText(error)}`);
        await removePlaceholderAndTell(interaction, { content: lookupMessages.unavailable });
    }
}
/** A Kingdom option that may be left out: none is valid, an invalid one is not. */
function parseOptionalKingdom(value) {
    if (value === null)
        return { ok: true, value: undefined };
    const parsed = parseKingdom(value);
    return parsed.ok ? parsed : { ok: false };
}
async function lookUpPlayerByUid(interaction, context, text) {
    const parsed = parseUid(text);
    if (!parsed.ok) {
        await replyPrivately(interaction, lookupMessages.invalidUid);
        return;
    }
    const uid = parsed.value;
    await showLookup(interaction, context, () => context.gameApi.getPlayer(uid, "lookup"), playerCardMessage, (failure, now) => ({ content: playerFailureText(failure, uid, now) }));
}
async function lookUpPlayerByName(interaction, context, text) {
    const name = parsePlayerName(text);
    if (!name.ok) {
        await replyPrivately(interaction, lookupMessages.invalidPlayerName);
        return;
    }
    const kingdom = parseOptionalKingdom(interaction.options.getInteger("kingdom"));
    if (!kingdom.ok) {
        await replyPrivately(interaction, lookupMessages.invalidKingdom);
        return;
    }
    const playerName = name.value;
    const playerKingdom = kingdom.value;
    await showLookup(interaction, context, () => context.gameApi.findPlayer(playerName, playerKingdom, "lookup"), playerCardMessage, (failure, now) => playerNameFailureMessage(failure, playerName, playerKingdom, interaction.user.id, context.pickSessions, now));
}
/**
 * Answers /player: a uid or a name (with an optional Kingdom), never both. Invalid input is answered privately at
 * once; otherwise a public card, a private pick list for an ambiguous name, or the reason in private.
 */
export async function handlePlayer(interaction, context) {
    await answer("/player", context, async () => {
        const uidText = interaction.options.getString("uid");
        const nameText = interaction.options.getString("name");
        if (uidText !== null && nameText === null) {
            await lookUpPlayerByUid(interaction, context, uidText);
            return;
        }
        if (uidText === null && nameText !== null) {
            await lookUpPlayerByName(interaction, context, nameText);
            return;
        }
        await replyPrivately(interaction, lookupMessages.giveUidOrName);
    });
}
/**
 * The shared Alliance flow for both ways of asking: the card with its roster menu, or the reason in private, and a
 * pick list for an ambiguous answer.
 */
async function showAlliance(interaction, context, key, ask, notFound) {
    const ownerId = interaction.user.id;
    await showLookup(interaction, context, ask, (alliance, fetchedAt, now) => allianceCardMessage(alliance, fetchedAt, now, ownerId, context.pickSessions), (failure, now) => allianceFailureMessage(failure, key, notFound, ownerId, context.pickSessions, now));
}
/** /alliance with a Kingdom and a tag: the Alliance of that Kingdom with that tag. */
async function lookUpAllianceByTag(interaction, context, kingdomValue, tagText) {
    const kingdom = parseKingdom(kingdomValue);
    if (!kingdom.ok) {
        await replyPrivately(interaction, lookupMessages.invalidKingdom);
        return;
    }
    const parsedTag = parseAllianceKey(tagText);
    if (!parsedTag.ok) {
        await replyPrivately(interaction, lookupMessages.invalidAlliance);
        return;
    }
    const allianceKingdom = kingdom.value;
    const tag = parsedTag.value;
    await showAlliance(interaction, context, tag, () => context.gameApi.getAlliance(allianceKingdom, tag, "lookup"), lookupMessages.allianceNotFound(tag, allianceKingdom));
}
/** /alliance with a full name alone: every Alliance with exactly that name, from any Kingdom. */
async function lookUpAllianceByName(interaction, context, nameText) {
    const parsedName = parseAllianceKey(nameText);
    if (!parsedName.ok) {
        await replyPrivately(interaction, lookupMessages.giveKingdomAndTagOrName);
        return;
    }
    const name = parsedName.value;
    await showAlliance(interaction, context, name, () => context.gameApi.findAlliance(name, "lookup"), lookupMessages.allianceNameNotFound(name));
}
/**
 * Answers /alliance: a Kingdom with a tag, or a full name alone, never a mix. Invalid input is answered privately at
 * once; otherwise a public card, a private pick list for an ambiguous answer, or the reason in private.
 */
export async function handleAlliance(interaction, context) {
    await answer("/alliance", context, async () => {
        const kingdomValue = interaction.options.getInteger("kingdom");
        const tagText = interaction.options.getString("alliance");
        const nameText = interaction.options.getString("name");
        if (kingdomValue !== null && tagText !== null && nameText === null) {
            await lookUpAllianceByTag(interaction, context, kingdomValue, tagText);
            return;
        }
        if (kingdomValue === null && tagText === null && nameText !== null) {
            await lookUpAllianceByName(interaction, context, nameText);
            return;
        }
        await replyPrivately(interaction, lookupMessages.giveKingdomAndTagOrName);
    });
}
//# sourceMappingURL=lookup.js.map