/** Discord shows at most 25 choices. */
const MAX_CHOICES = 25;
/** UTC, the default time zone, then every zone Intl lists. Intl does not list UTC among the city zones. */
const TIME_ZONES = ["UTC", ...Intl.supportedValuesOf("timeZone")];
const KNOWN_TIME_ZONES = new Set(TIME_ZONES);
/**
 * The minute after local midnight (0 to 1439) of the instant in the time zone given, or undefined when Intl does not
 * know the zone or the instant. Never throws.
 */
export function localMinuteOf(instant, timeZone) {
    try {
        const parts = new Intl.DateTimeFormat("en-GB", {
            timeZone,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        }).formatToParts(instant);
        const hour = Number(parts.find((part) => part.type === "hour")?.value);
        const minute = Number(parts.find((part) => part.type === "minute")?.value);
        if (!Number.isInteger(hour) || !Number.isInteger(minute))
            return undefined;
        return hour * 60 + minute;
    }
    catch {
        return undefined;
    }
}
/** Recognises a time zone the Member typed: UTC, or an IANA name Intl lists, matched exactly. */
export function parseTimeZone(input) {
    if (!KNOWN_TIME_ZONES.has(input))
        return { ok: false };
    return { ok: true, value: input };
}
/**
 * Answers the autocomplete of the time-zone option with the zones whose names contain the typed part, whatever its case.
 * Nothing typed yet offers the first zones; at most 25 choices are offered, each as its IANA name.
 */
export async function handleTimeZoneAutocomplete(interaction) {
    const query = String(interaction.options.getFocused(true).value).toLowerCase();
    const choices = TIME_ZONES.filter((zone) => zone.toLowerCase().includes(query))
        .slice(0, MAX_CHOICES)
        .map((zone) => ({ name: zone, value: zone }));
    await interaction.respond(choices);
}
//# sourceMappingURL=booty-time.js.map