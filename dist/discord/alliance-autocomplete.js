import { matchAlliances, normalise } from "../domain/alliance-match.js";
/** Discord shows at most 25 choices. */
const MAX_CHOICES = 25;
/** Discord takes at most 100 characters of a choice's label. */
const MAX_LABEL_LENGTH = 100;
/** The name option takes at most 40 characters; a longer full name cannot be its value. */
const MAX_NAME_LENGTH = 40;
/**
 * Answers the autocomplete of /alliance from the Known Alliances, without asking the Game API. The name option offers
 * the full name as value; the tag option offers the tag. Nothing typed yet offers the most recently seen. A failed read
 * answers an empty list and is logged.
 */
export async function handleAllianceAutocomplete(interaction, context) {
    const focused = interaction.options.getFocused(true);
    const choices = suggest(focused, context);
    await interaction.respond(choices);
}
/** The choices for the focused option; an empty list when the Known Alliances cannot be read. */
function suggest(focused, context) {
    try {
        const now = context.now();
        const query = String(focused.value);
        const alliances = alliancesFor(query, context.knownAlliances.all(now), now);
        return alliances
            .filter((alliance) => focused.name !== "name" || alliance.name.length <= MAX_NAME_LENGTH)
            .map((alliance) => ({
            name: cutLabel(`[${alliance.tag}] ${alliance.name}`),
            value: focused.name === "tag" ? alliance.tag : alliance.name,
        }));
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        context.logError(`Suggesting alliances failed: ${reason}`);
        return [];
    }
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