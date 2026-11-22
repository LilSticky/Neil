import { knownSince, normalise } from "./alliance-match.js";
import { parseAllianceKey } from "./lookup-input.js";
import { pickableAllianceMatch } from "./player.js";
/**
 * Reads what the player typed into the search. A text starting with a bracketed tag searches by that tag, whatever
 * follows it; any other text searches by the text itself, trimmed.
 */
export function parseAllianceSearch(text) {
    const trimmed = text.trim();
    const close = trimmed.indexOf("]");
    if (trimmed.startsWith("[") && close > 0) {
        const tag = parseAllianceKey(trimmed.slice(1, close));
        return tag.ok ? { ok: true, value: { kind: "tag", tag: tag.value } } : { ok: false };
    }
    const key = parseAllianceKey(trimmed);
    return key.ok ? { ok: true, value: { kind: "text", key: key.value } } : { ok: false };
}
/**
 * The Known Alliance of `kingdom` whose tag or name equals `text`, ignoring case, accents, spaces and punctuation. A tag
 * match is preferred over a name match. Alliances not seen since `knownSince(now)` are left out.
 */
export function exactKnownAlliance(text, known, kingdom, now) {
    const wanted = normalise(text);
    if (wanted.length === 0)
        return undefined;
    const since = knownSince(now).getTime();
    const candidates = known.filter((alliance) => alliance.kingdom === kingdom && alliance.lastSeen.getTime() >= since);
    return (candidates.find((alliance) => normalise(alliance.tag) === wanted) ??
        candidates.find((alliance) => normalise(alliance.name) === wanted));
}
/** The matches that can be picked and belong to `kingdom`, in the order given. */
export function matchesIn(matches, kingdom) {
    return matches.filter((match) => pickableAllianceMatch(match) && match.kingdom === kingdom);
}
//# sourceMappingURL=alliance-search.js.map