const UID_PATTERN = /^\d{1,20}$/;
const ALLIANCE_KEY_MAX_LENGTH = 40;
const PLAYER_NAME_MAX_LENGTH = 32;
/** Keys made only of dots are path segments ("." and ".."), which the Game API URL would resolve away. */
const DOTS_ONLY_PATTERN = /^\.+$/;
export function parseUid(input) {
    const trimmed = input.trim();
    if (!UID_PATTERN.test(trimmed))
        return { ok: false };
    return { ok: true, value: trimmed };
}
export function parseKingdom(input) {
    if (!Number.isInteger(input) || input < 1 || input > 9999)
        return { ok: false };
    return { ok: true, value: input };
}
export function parseAllianceKey(input) {
    const trimmed = input.trim();
    if (trimmed.length === 0 || trimmed.length > ALLIANCE_KEY_MAX_LENGTH)
        return { ok: false };
    if (DOTS_ONLY_PATTERN.test(trimmed))
        return { ok: false };
    return { ok: true, value: trimmed };
}
export function parsePlayerName(input) {
    const trimmed = input.trim();
    const length = Array.from(trimmed).length;
    if (length === 0 || length > PLAYER_NAME_MAX_LENGTH)
        return { ok: false };
    if (DOTS_ONLY_PATTERN.test(trimmed))
        return { ok: false };
    return { ok: true, value: trimmed };
}
//# sourceMappingURL=lookup-input.js.map