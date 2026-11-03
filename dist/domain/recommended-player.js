import { parsePlayerName } from "./lookup-input.js";
/** Bracketed parts with their brackets: [...], (...), {...}, <...>, 【...】. */
const BRACKETED_PART_PATTERN = /\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|<[^>]*>|【[^】]*】/gu;
/** Every character that is not a letter, a digit, a space, _, - or . */
const DISALLOWED_CHARACTER_PATTERN = /[^\p{L}\p{N} _.-]/gu;
const RUN_OF_SPACES_PATTERN = / {2,}/g;
/** Spaces and the separators _, - and . at either end. */
const EDGE_SEPARATOR_PATTERN = /^[ _.-]+|[ _.-]+$/g;
/**
 * Turns a Discord display name into the Player Name to look up in the Game API.
 * Returns undefined when nothing usable is left or the result is not a valid Player Name.
 */
export function cleanDisplayName(displayName) {
    const withoutBrackets = displayName.replace(BRACKETED_PART_PATTERN, "");
    const segments = withoutBrackets.split("|");
    const firstSegment = segments[0]?.trim() ?? "";
    const candidate = firstSegment.length > 0 ? firstSegment : (segments[1] ?? "");
    const letters = candidate
        .replace(DISALLOWED_CHARACTER_PATTERN, "")
        .replace(RUN_OF_SPACES_PATTERN, " ")
        .replace(EDGE_SEPARATOR_PATTERN, "");
    const parsed = parsePlayerName(letters);
    return parsed.ok ? parsed.value : undefined;
}
//# sourceMappingURL=recommended-player.js.map