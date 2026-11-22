import { matchAlliances, normalise } from "../domain/alliance-match.js";
import { parseKingdom } from "../domain/lookup-input.js";
/** Discord shows at most 25 choices. */
const MAX_CHOICES = 25;
/** Discord takes at most 100 characters of a choice's label. */
const MAX_LABEL_LENGTH = 100;
/** The search option takes at most 40 characters; a longer `[TAG]` cannot be its value. */
const MAX_VALUE_LENGTH = 40;
/**
 * Answers the autocomplete of /alliance's search option from the Known Alliances of one Kingdom, without asking the Game
 * API. The Kingdom is the one typed in the kingdom option, else the Home Kingdom; an invalid one falls back to the Home
 * Kingdom. The choice's value is `[TAG]`. Nothing typed yet offers that Kingdom's most recently seen. A failed read
 * answers an empty list and is logged.
 */
export async function handleAllianceAutocomplete(interaction, context) {
    const focused = interaction.options.getFocused(true);
    const choices = suggest(focused, interaction.options.getInteger("kingdom"), context);
    await interaction.respond(choices);
}
/** The choices for what is typed in the Kingdom; an empty list when the Known Alliances cannot be read. */
function suggest(focused, typedKingdom, context) {
    try {
        const now = context.now();
        const kingdom = kingdomOf(typedKingdom, context.homeKingdom);
        const query = String(focused.value);
        const known = context.knownAlliances.all(now, kingdom);
        return alliancesFor(query, known, now)
            .map((alliance) => ({
            name: cutLabel(`[${alliance.tag}] ${alliance.name}`),
            value: `[${alliance.tag}]`,
        }))
            .filter((choice) => choice.value.length <= MAX_VALUE_LENGTH);
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        context.logError(`Suggesting alliances failed: ${reason}`);
        return [];
    }
}
/** The Kingdom typed, when it is a valid one; else the Home Kingdom. */
function kingdomOf(typed, homeKingdom) {
    if (typed === null)
        return homeKingdom;
    const parsed = parseKingdom(typed);
    return parsed.ok ? parsed.value : homeKingdom;
}
/** The matches for what is typed, best first; with nothing typed, the most recently seen Known Alliances. */
function alliancesFor(query, known, now) {
    if (normalise(query) !== "")
        return matchAlliances(query, known, now, MAX_CHOICES);
    return [...known].sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime()).slice(0, MAX_CHOICES);
}
/** The label cut to 100 characters, at a whole code point so no surrogate pair is split. */
function cutLabel(text) {
    let cut = "";
    for (const character of text) {
        if (cut.length + character.length > MAX_LABEL_LENGTH)
            break;
        cut += character;
    }
    return cut;
}
//# sourceMappingURL=alliance-autocomplete.js.map