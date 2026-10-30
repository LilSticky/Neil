import { MessageFlags, } from "discord.js";
import { parseAllianceKey, parseKingdom, parseUid, } from "../domain/lookup-input.js";
import { lookupMessages, renderAllianceCard, renderPlayerCard } from "./lookup-cards.js";
/** Lookups never mention anyone, whatever the Game API or the Member typed. */
const allowedMentions = { parse: [] };
function playerFailureText(failure, uid, now) {
    switch (failure.kind) {
        case "not-found":
            return lookupMessages.playerNotFound(uid);
        case "not-prepared":
            // The tracker's answer for an unknown uid, but also for its own trouble (research R11).
            return lookupMessages.playerNotPrepared(uid);
        case "quota-spent":
            return lookupMessages.quotaSpent(failure.resetsAt, now);
        case "try-again":
            return lookupMessages.tryAgain;
        case "unavailable":
        case "ambiguous":
            // A Player lookup never gives "ambiguous"; if it ever did, the honest answer is the same as a broken lookup.
            return lookupMessages.unavailable;
    }
}
function allianceFailureText(failure, kingdom, key, now) {
    switch (failure.kind) {
        case "not-found":
            return lookupMessages.allianceNotFound(key, kingdom);
        case "ambiguous":
            return lookupMessages.ambiguous(key, failure.matches);
        case "quota-spent":
            return lookupMessages.quotaSpent(failure.resetsAt, now);
        case "not-prepared":
        case "try-again":
            return lookupMessages.tryAgain;
        case "unavailable":
            return lookupMessages.unavailable;
    }
}
/** The text of a thrown value, for a log line. */
function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}
/** Keeps a failed Discord call from escaping the handler; the failure is logged instead. */
async function answer(command, context, respond) {
    try {
        await respond();
    }
    catch (error) {
        context.logError(`Answering ${command} failed: ${errorText(error)}`);
    }
}
/** Invalid input is answered privately at once, before any Game API call. */
async function replyPrivately(interaction, content) {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions });
}
/** Removes the thinking placeholder and tells the caller the text privately. */
async function removePlaceholderAndTell(interaction, content) {
    await interaction.deleteReply();
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral, allowedMentions });
}
/**
 * The shared lookup flow: a public thinking placeholder, then the card. When the lookup gives no card, or the card
 * cannot be sent, the placeholder is removed and the reason is told privately; a failed send is logged, and a lookup
 * that throws is logged and told as unavailable.
 */
async function showLookup(interaction, context, ask, render, failureText) {
    await interaction.deferReply();
    let result;
    try {
        result = await ask();
    }
    catch (error) {
        context.logError(`Looking up failed: ${errorText(error)}`);
        await removePlaceholderAndTell(interaction, lookupMessages.unavailable);
        return;
    }
    if (result.kind !== "found") {
        await removePlaceholderAndTell(interaction, failureText(result, context.now()));
        return;
    }
    try {
        const embed = render(result.value, result.fetchedAt, context.now());
        await interaction.editReply({ embeds: [embed], allowedMentions });
    }
    catch (error) {
        context.logError(`Showing the card failed: ${errorText(error)}`);
        await removePlaceholderAndTell(interaction, lookupMessages.unavailable);
    }
}
/** Answers /player: invalid input privately at once, otherwise a public card or the reason in private. */
export async function handlePlayer(interaction, context) {
    await answer("/player", context, async () => {
        const parsed = parseUid(interaction.options.getString("uid", true));
        if (!parsed.ok) {
            await replyPrivately(interaction, lookupMessages.invalidUid);
            return;
        }
        const uid = parsed.value;
        await showLookup(interaction, context, () => context.gameApi.getPlayer(uid), renderPlayerCard, (failure, now) => playerFailureText(failure, uid, now));
    });
}
/** Answers /alliance: invalid input privately at once, otherwise a public card or the reason in private. */
export async function handleAlliance(interaction, context) {
    await answer("/alliance", context, async () => {
        const kingdom = parseKingdom(interaction.options.getInteger("kingdom", true));
        if (!kingdom.ok) {
            await replyPrivately(interaction, lookupMessages.invalidKingdom);
            return;
        }
        const key = parseAllianceKey(interaction.options.getString("alliance", true));
        if (!key.ok) {
            await replyPrivately(interaction, lookupMessages.invalidAlliance);
            return;
        }
        const kingdomNumber = kingdom.value;
        const allianceKey = key.value;
        await showLookup(interaction, context, () => context.gameApi.getAlliance(kingdomNumber, allianceKey), renderAllianceCard, (failure, now) => allianceFailureText(failure, kingdomNumber, allianceKey, now));
    });
}
//# sourceMappingURL=lookup.js.map