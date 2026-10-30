/** A Player's id from the game: 1–20 digits. Only parseUid makes one. */
export type Uid = string & { readonly __brand: "Uid" };

/** A Kingdom number: an integer 1–9999. Only parseKingdom makes one. */
export type KingdomNumber = number & { readonly __brand: "KingdomNumber" };

/** A Player Name as typed: trimmed, 1–32 characters, not only dots. Only parsePlayerName makes one. */
export type PlayerName = string & { readonly __brand: "PlayerName" };

/** An Alliance's tag or name as typed: trimmed, 1–40 characters, not only dots. Only parseAllianceKey makes one. */
export type AllianceKey = string & { readonly __brand: "AllianceKey" };

export type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

const UID_PATTERN = /^\d{1,20}$/;
const ALLIANCE_KEY_MAX_LENGTH = 40;
const PLAYER_NAME_MAX_LENGTH = 32;
/** Keys made only of dots are path segments ("." and ".."), which the Game API URL would resolve away. */
const DOTS_ONLY_PATTERN = /^\.+$/;

export function parseUid(input: string): ParseResult<Uid> {
  const trimmed = input.trim();
  if (!UID_PATTERN.test(trimmed)) return { ok: false };
  return { ok: true, value: trimmed as Uid };
}

export function parseKingdom(input: number): ParseResult<KingdomNumber> {
  if (!Number.isInteger(input) || input < 1 || input > 9999) return { ok: false };
  return { ok: true, value: input as KingdomNumber };
}

export function parseAllianceKey(input: string): ParseResult<AllianceKey> {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > ALLIANCE_KEY_MAX_LENGTH) return { ok: false };
  if (DOTS_ONLY_PATTERN.test(trimmed)) return { ok: false };
  return { ok: true, value: trimmed as AllianceKey };
}

export function parsePlayerName(input: string): ParseResult<PlayerName> {
  const trimmed = input.trim();
  const length = Array.from(trimmed).length;
  if (length === 0 || length > PLAYER_NAME_MAX_LENGTH) return { ok: false };
  if (DOTS_ONLY_PATTERN.test(trimmed)) return { ok: false };
  return { ok: true, value: trimmed as PlayerName };
}
