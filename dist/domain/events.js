import { parseAllianceKey } from "./lookup-input.js";
/** An Event's Alliance tag is the text in brackets at the very start of its name, e.g. "[NML] Hive move". */
const LEADING_TAG_PATTERN = /^\[([^\]]*)\]/;
/** Who owns an Event, read from its Discord event's name. A bracketed tag that is not at the start does not count. */
export function eventOwnerOf(name) {
    const match = LEADING_TAG_PATTERN.exec(name);
    if (match === null)
        return { kind: "kingdom" };
    const tag = parseAllianceKey(match[1] ?? "");
    return tag.ok ? { kind: "alliance", tag: tag.value } : { kind: "kingdom" };
}
/** At most this many lead times in one Event Kind. */
const MAX_LEAD_TIMES = 3;
/** The shortest lead time, in minutes: one minute. */
const MIN_LEAD_MINUTES = 1;
/** The longest lead time, in minutes: seven days. */
const MAX_LEAD_MINUTES = 7 * 24 * 60;
const MINUTES_PER_UNIT = { m: 1, h: 60, d: 24 * 60 };
const LEAD_TIME_PATTERN = /^(\d+)([mhd])$/;
/** Reads a comma-separated list of lead times such as "24h, 1h, 10m" or "2d" as minutes, in the order written. */
export function parseLeadTimes(text) {
    const items = text.split(",").map((item) => item.trim());
    const minutes = [];
    for (const item of items) {
        const match = LEAD_TIME_PATTERN.exec(item);
        if (match === null)
            return { ok: false, reason: "unreadable" };
        const unit = match[2];
        minutes.push(Number(match[1]) * MINUTES_PER_UNIT[unit]);
    }
    if (minutes.length > MAX_LEAD_TIMES)
        return { ok: false, reason: "too-many" };
    if (minutes.some((value) => value < MIN_LEAD_MINUTES || value > MAX_LEAD_MINUTES)) {
        return { ok: false, reason: "out-of-range" };
    }
    return { ok: true, value: minutes };
}
/** Officers may act on any Event. An Alliance Event also allows that Alliance's R4 and R5; a Kingdom Event does not. */
export function mayActOnEvent(owner, creator) {
    if (creator === undefined)
        return false;
    if (creator.officer)
        return true;
    if (owner.kind === "kingdom" || creator.alliance === undefined)
        return false;
    return creator.alliance.tag === owner.tag && (creator.alliance.rank === "R4" || creator.alliance.rank === "R5");
}
/** The Event Kind whose name appears in the Event's name, ignoring case; the longest name wins. */
export function kindForEventName(kinds, eventName) {
    const lowerName = eventName.toLowerCase();
    let best;
    for (const kind of kinds) {
        if (!lowerName.includes(kind.name.toLowerCase()))
            continue;
        if (best === undefined || kind.name.length > best.name.length)
            best = kind;
    }
    return best;
}
/** A reminder with no Event Kind: one reminder 30 minutes before the start. */
const DEFAULT_START_LEAD_MINUTES = 30;
const MINUTE_MS = 60_000;
function minutesBefore(at, minutes) {
    return new Date(at.getTime() - minutes * MINUTE_MS);
}
function offersFor(start, kind) {
    if (kind === undefined) {
        return [{ target: "start", targetAt: start, leads: [DEFAULT_START_LEAD_MINUTES] }];
    }
    const offers = [{ target: "start", targetAt: start, leads: kind.beforeStart }];
    if (kind.signupOffsetMinutes !== undefined) {
        offers.push({
            target: "signup",
            targetAt: minutesBefore(start, kind.signupOffsetMinutes),
            leads: kind.beforeSignup,
        });
    }
    return offers;
}
/**
 * Which reminders of an Event are due at `now`. A reminder is due once `now` has passed its target minus its lead time,
 * and it is skipped when that moment is before `firstSeenAt`, when its target has passed, or when the Event is
 * cancelled, completed or deleted. Several due reminders for one target collapse into the shortest lead time.
 */
export function dueReminders(start, status, kind, sent, firstSeenAt, now) {
    if (status === "cancelled" || status === "completed" || status === "deleted") {
        return { send: [], record: [] };
    }
    const send = [];
    const record = [];
    for (const offer of offersFor(start, kind)) {
        if (now.getTime() >= offer.targetAt.getTime())
            continue;
        const due = offer.leads
            .filter((leadMinutes) => !sent.some((done) => done.target === offer.target && done.leadMinutes === leadMinutes))
            .filter((leadMinutes) => {
            const dueAt = minutesBefore(offer.targetAt, leadMinutes);
            return dueAt.getTime() <= now.getTime() && dueAt.getTime() >= firstSeenAt.getTime();
        })
            .sort((a, b) => a - b)
            .map((leadMinutes) => ({ target: offer.target, leadMinutes }));
        const [shortest, ...others] = due;
        if (shortest !== undefined)
            send.push(shortest);
        record.push(...others);
    }
    return { send, record };
}
//# sourceMappingURL=events.js.map