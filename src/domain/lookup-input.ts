/** A Player's id from the game: 1–20 digits. Only parseUid makes one. */
export type Uid = string & { readonly __brand: "Uid" };

/** A Kingdom number: an integer 1–9999. Only parseKingdom makes one. */
export type KingdomNumber = number & { readonly __brand: "KingdomNumber" };

/** An Alliance's tag or name as typed: trimmed, 1–40 characters. Only parseAllianceKey makes one. */
export type AllianceKey = string & { readonly __brand: "AllianceKey" };

export type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

const UID_PATTERN = /^\d{1,20}$/;
const ALLIANCE_KEY_MAX_LENGTH = 40;

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
  return { ok: true, value: trimmed as AllianceKey };
}
