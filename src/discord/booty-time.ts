import type { ParseResult } from "../domain/lookup-input.js";

/** Discord shows at most 25 choices. */
const MAX_CHOICES = 25;

/** UTC, the default time zone, then every zone Intl lists. Intl does not list UTC among the city zones. */
const TIME_ZONES: readonly string[] = ["UTC", ...Intl.supportedValuesOf("timeZone")];
const KNOWN_TIME_ZONES: ReadonlySet<string> = new Set(TIME_ZONES);

/** One choice the time-zone autocomplete offers: the label Discord shows and the value the command receives. */
export interface TimeZoneChoice {
  readonly name: string;
  readonly value: string;
}

/** The part of a discord.js autocomplete interaction that the time-zone suggestions use. */
export interface TimeZoneAutocompleteInteraction {
  readonly options: { getFocused(getFull: true): { readonly name: string; readonly value: string | number } };
  respond(choices: readonly TimeZoneChoice[]): Promise<void>;
}

/**
 * The minute after local midnight (0 to 1439) of the instant in the time zone given, or undefined when Intl does not
 * know the zone or the instant. Never throws.
 */
export function localMinuteOf(instant: Date, timeZone: string): number | undefined {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return undefined;
    return hour * 60 + minute;
  } catch {
    return undefined;
  }
}

/** Recognises a time zone the Member typed: UTC, or an IANA name Intl lists, matched exactly. */
export function parseTimeZone(input: string): ParseResult<string> {
  if (!KNOWN_TIME_ZONES.has(input)) return { ok: false };
  return { ok: true, value: input };
}

/**
 * Answers the autocomplete of the time-zone option with the zones whose names contain the typed part, whatever its case.
 * Nothing typed yet offers the first zones; at most 25 choices are offered, each as its IANA name.
 */
export async function handleTimeZoneAutocomplete(interaction: TimeZoneAutocompleteInteraction): Promise<void> {
  const query = String(interaction.options.getFocused(true).value).toLowerCase();
  const choices = TIME_ZONES.filter((zone) => zone.toLowerCase().includes(query))
    .slice(0, MAX_CHOICES)
    .map((zone) => ({ name: zone, value: zone }));
  await interaction.respond(choices);
}
