import type { KingdomNumber } from "./lookup-input.js";

/** An Alliance Neil has seen in a Game API answer for the Home Kingdom, as far as matching needs it. */
export interface KnownAlliance {
  readonly kingdom: KingdomNumber;
  readonly tag: string;
  readonly name: string;
  readonly lastSeen: Date;
}

const DAY_MS = 86_400_000;
/** A Known Alliance not seen for this long is left out of matching and forgotten (FR-006). */
const KNOWN_FOR_MS = 30 * DAY_MS;
/** How many matches a query gives at most unless a limit is asked for. */
const DEFAULT_LIMIT = 25;
/** The shortest normalised query that is matched by a part of a text. */
const MIN_LENGTH_FOR_PART = 3;
/** The shortest normalised query that is matched by near spelling. */
const MIN_LENGTH_FOR_NEAR = 4;
/** Up to this length a query allows one wrong letter; from the length after it, two. */
const ONE_EDIT_MAX_LENGTH = 7;

/** How a normalised text matches a normalised query; a lower value ranks higher. */
const Kind = { exact: 0, prefix: 1, part: 2, near: 3 } as const;
type Kind = (typeof Kind)[keyof typeof Kind];

/** Which of an Alliance's texts matched; a tag ranks before a name at the same kind. */
const Field = { tag: 0, name: 1 } as const;
type Field = (typeof Field)[keyof typeof Field];

/** The earliest moment an Alliance last seen at or after which it is still Known, given `now`. */
export function knownSince(now: Date): Date {
  return new Date(now.getTime() - KNOWN_FOR_MS);
}

/** Lower case, accents, spaces, punctuation and symbols removed: what matching compares. */
export function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * The Known Alliances matching a query, best first: exact > prefix > part > near spelling; at the same kind a tag
 * before a name; then the most recently seen. Alliances last seen before `knownSince(now)` are left out.
 */
export function matchAlliances(
  query: string,
  alliances: readonly KnownAlliance[],
  now: Date,
  limit: number = DEFAULT_LIMIT,
): KnownAlliance[] {
  const wanted = normalise(query);
  if (wanted.length === 0) return [];

  const since = knownSince(now).getTime();
  const ranked: { readonly alliance: KnownAlliance; readonly kind: Kind; readonly field: Field }[] = [];
  for (const alliance of alliances) {
    if (alliance.lastSeen.getTime() < since) continue;
    const best = bestMatch(wanted, alliance);
    if (best !== undefined) ranked.push({ alliance, ...best });
  }

  ranked.sort(
    (a, b) =>
      a.kind - b.kind || a.field - b.field || b.alliance.lastSeen.getTime() - a.alliance.lastSeen.getTime(),
  );
  return ranked.slice(0, limit).map((entry) => entry.alliance);
}

/** The better of the tag's and the name's match, the tag first at the same kind; undefined when neither matches. */
function bestMatch(wanted: string, alliance: KnownAlliance): { kind: Kind; field: Field } | undefined {
  const tag = kindOf(wanted, normalise(alliance.tag));
  const name = kindOf(wanted, normalise(alliance.name));
  if (tag !== undefined && (name === undefined || tag <= name)) return { kind: tag, field: Field.tag };
  if (name !== undefined) return { kind: name, field: Field.name };
  return undefined;
}

/** How a normalised text matches a normalised query, or undefined when it does not match at all. */
function kindOf(wanted: string, text: string): Kind | undefined {
  if (text === wanted) return Kind.exact;
  if (text.startsWith(wanted)) return Kind.prefix;
  if (wanted.length >= MIN_LENGTH_FOR_PART && text.includes(wanted)) return Kind.part;
  if (wanted.length >= MIN_LENGTH_FOR_NEAR && editDistance(wanted, text) <= maxEdits(wanted.length)) return Kind.near;
  return undefined;
}

/** One wrong letter for a query of 4 to 7 letters, two from 8 on. */
function maxEdits(length: number): number {
  return length <= ONE_EDIT_MAX_LENGTH ? 1 : 2;
}

/**
 * The Damerau-Levenshtein distance of two strings: insertions, deletions, substitutions and transpositions of two
 * adjacent letters each count once (the optimal string alignment form). Keeps two rows of the table at a time.
 */
function editDistance(a: string, b: string): number {
  let beforePrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      let best = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
        best = Math.min(best, (beforePrevious[j - 2] ?? 0) + 1);
      }
      current.push(best);
    }
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length] ?? 0;
}
