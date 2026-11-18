import { RAID_START_TIME } from "./city-rotation.js";
import { serverDatePlusDays, serverDayOf, serverTimeInstant } from "./server-time.js";
/**
 * The Raid: Saturday's KvK Raid of the Home Kingdom, and its Battle Plan (slice 034). The War Council drafts, publishes,
 * amends and cancels it; the R5 or an R4 of each Alliance gives its Plan Confirmation. Pure: no Discord, no clock.
 */
/** The Objectives every Battle Plan offers, in this order; they cannot be removed. */
export const FIXED_OBJECTIVES = [
    "Royal City",
    "Cannon Tower North",
    "Cannon Tower East",
    "Cannon Tower South",
    "Cannon Tower West",
    "Enemy sanctuaries",
];
export const MAX_CUSTOM_OBJECTIVES = 6;
export const MAX_NAME_LENGTH = 50;
export const MAX_PHASES = 8;
export const MAX_ASSIGNMENTS = 40;
export const MAX_TASK_LENGTH = 100;
export const MAX_NOTES_LENGTH = 1000;
/** The Confirmation Chases, in hours before the Confirmation Deadline. */
export const CHASE_LEAD_HOURS = [12, 2];
/** The first Raid Reminder, in minutes before the Raid start. */
export const RAID_REMINDER_LEAD_MINUTES = 30;
/** A Raid Reminder more than this late (Neil was off) is recorded, not sent. */
export const RAID_REMINDER_LATE_MINUTES = 10;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const SATURDAY = 6;
const EMPTY_PLAN = { customObjectives: [], phases: [], assignments: [], notes: "" };
/** The start of the Raid on that Saturday: always 12:00 Server Time (14:00 UTC). */
export function raidStartOf(id) {
    return serverTimeInstant(id, RAID_START_TIME.hour * 60 + RAID_START_TIME.minute);
}
/** The current Raid's Saturday and start: from Sunday 00:00 to Saturday 23:59 Server Time, that week's Saturday. */
export function currentRaidOf(now) {
    const day = serverDayOf(now);
    const id = serverDatePlusDays(day.date, SATURDAY - day.weekday);
    return { id, start: raidStartOf(id) };
}
/** A new Raid: a draft with the fixed Objectives only. */
export function newRaid(id, start) {
    return { id, start, state: { kind: "draft" }, plan: EMPTY_PLAN };
}
/** Every Objective of the plan: the fixed ones, then the War Council's own. */
export function objectivesOf(plan) {
    return [...FIXED_OBJECTIVES, ...plan.customObjectives];
}
/** The Alliance tags on the plan: those with at least one Assignment, sorted. */
export function onPlan(raid) {
    return [...new Set(raid.plan.assignments.map((assignment) => assignment.tag))].sort((a, b) => a.localeCompare(b));
}
/** The Plan Deadline: hours before the Raid start. */
export function planDeadlineOf(raid, planHours) {
    return new Date(raid.start.getTime() - planHours * HOUR_MS);
}
/** The Confirmation Deadline: hours before the Raid start. */
export function confirmationDeadlineOf(raid, confirmationHours) {
    return new Date(raid.start.getTime() - confirmationHours * HOUR_MS);
}
function same(a, b) {
    return a.toLowerCase() === b.toLowerCase();
}
function find(names, name) {
    return names.find((candidate) => same(candidate, name.trim()));
}
function nameOf(raw) {
    const name = raw.trim();
    return name.length >= 1 && name.length <= MAX_NAME_LENGTH ? name : undefined;
}
function changed(raid, plan) {
    if (raid.state.kind === "cancelled")
        return { ok: false, refusal: { kind: "cancelled" } };
    return { ok: true, raid: { ...raid, plan } };
}
function refused(refusal) {
    return { ok: false, refusal };
}
export function addObjective(raid, raw) {
    const name = nameOf(raw);
    if (name === undefined)
        return refused({ kind: "invalid-name" });
    const existing = find(objectivesOf(raid.plan), name);
    if (existing !== undefined)
        return refused({ kind: "objective-exists", name: existing });
    if (raid.plan.customObjectives.length >= MAX_CUSTOM_OBJECTIVES)
        return refused({ kind: "too-many-objectives" });
    return changed(raid, { ...raid.plan, customObjectives: [...raid.plan.customObjectives, name] });
}
export function removeObjective(raid, raw) {
    const fixed = find(FIXED_OBJECTIVES, raw);
    if (fixed !== undefined)
        return refused({ kind: "fixed-objective", name: fixed });
    const name = find(raid.plan.customObjectives, raw);
    if (name === undefined)
        return refused({ kind: "unknown-objective", name: raw.trim() });
    const assignments = raid.plan.assignments.filter((assignment) => assignment.objective === name);
    if (assignments.length > 0)
        return refused({ kind: "still-assigned", name, assignments });
    return changed(raid, { ...raid.plan, customObjectives: raid.plan.customObjectives.filter((objective) => objective !== name) });
}
/** HH:MM (24 h) as minutes after midnight; undefined when the text is no such time. */
export function parseClock(raw) {
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw.trim());
    if (match === null)
        return undefined;
    return Number(match[1]) * 60 + Number(match[2]);
}
/** Adds a Phase at a time typed in Server Time on the Raid's Saturday, at or after the Raid start. */
export function addPhase(raid, rawName, rawTime) {
    const name = nameOf(rawName);
    if (name === undefined)
        return refused({ kind: "invalid-name" });
    const minutes = parseClock(rawTime);
    if (minutes === undefined)
        return refused({ kind: "invalid-time" });
    const at = serverTimeInstant(raid.id, minutes);
    if (at.getTime() < raid.start.getTime())
        return refused({ kind: "phase-before-start", start: raid.start });
    const existing = find(raid.plan.phases.map((phase) => phase.name), name);
    if (existing !== undefined)
        return refused({ kind: "phase-exists", name: existing });
    if (raid.plan.phases.length >= MAX_PHASES)
        return refused({ kind: "too-many-phases" });
    const phases = [...raid.plan.phases, { name, at }].sort((a, b) => a.at.getTime() - b.at.getTime());
    return changed(raid, { ...raid.plan, phases });
}
export function removePhase(raid, raw) {
    const name = find(raid.plan.phases.map((phase) => phase.name), raw);
    if (name === undefined)
        return refused({ kind: "unknown-phase", name: raw.trim() });
    const assignments = raid.plan.assignments.filter((assignment) => assignment.phase === name);
    if (assignments.length > 0)
        return refused({ kind: "still-assigned", name, assignments });
    return changed(raid, { ...raid.plan, phases: raid.plan.phases.filter((phase) => phase.name !== name) });
}
/** The Assignment the input names, checked against the plan and the Home Kingdom Alliances (their tags). */
function assignmentOf(raid, input, allianceTags) {
    const tag = find(allianceTags, input.tag.trim().replace(/^\[(.*)\]$/, "$1"));
    if (tag === undefined)
        return { kind: "unknown-alliance", tag: input.tag.trim() };
    const objective = find(objectivesOf(raid.plan), input.objective);
    if (objective === undefined)
        return { kind: "unknown-objective", name: input.objective.trim() };
    let phase;
    if (input.phase !== undefined && input.phase.trim().length > 0) {
        phase = find(raid.plan.phases.map((candidate) => candidate.name), input.phase);
        if (phase === undefined)
            return { kind: "unknown-phase", name: input.phase.trim() };
    }
    const task = input.task?.trim();
    if (task !== undefined && task.length > MAX_TASK_LENGTH)
        return { kind: "task-too-long" };
    return { tag, objective, phase, task: task === undefined || task.length === 0 ? undefined : task };
}
function isAssignment(value) {
    return !("kind" in value);
}
function sameSlot(a, b) {
    return a.tag === b.tag && a.objective === b.objective && a.phase === b.phase;
}
/** Assigns an Alliance to an Objective, for one Phase or the whole Raid; one Assignment per Alliance, Objective and Phase. */
export function assign(raid, input, allianceTags) {
    const assignment = assignmentOf(raid, input, allianceTags);
    if (!isAssignment(assignment))
        return refused(assignment);
    if (raid.plan.assignments.some((existing) => sameSlot(existing, assignment)))
        return refused({ kind: "assignment-exists" });
    if (raid.plan.assignments.length >= MAX_ASSIGNMENTS)
        return refused({ kind: "too-many-assignments" });
    return changed(raid, { ...raid.plan, assignments: [...raid.plan.assignments, assignment] });
}
/** Removes the Assignment of an Alliance to an Objective, for one Phase or the whole Raid. */
export function unassign(raid, input, allianceTags) {
    const assignment = assignmentOf(raid, { ...input, task: undefined }, [
        ...allianceTags,
        ...raid.plan.assignments.map((existing) => existing.tag),
    ]);
    if (!isAssignment(assignment))
        return refused(assignment);
    if (!raid.plan.assignments.some((existing) => sameSlot(existing, assignment)))
        return refused({ kind: "no-such-assignment" });
    return changed(raid, {
        ...raid.plan,
        assignments: raid.plan.assignments.filter((existing) => !sameSlot(existing, assignment)),
    });
}
/** Sets the notes; an empty text clears them. */
export function setNotes(raid, raw) {
    const notes = raw.trim();
    if (notes.length > MAX_NOTES_LENGTH)
        return refused({ kind: "notes-too-long" });
    return changed(raid, { ...raid.plan, notes });
}
/** Publishes the plan, or publishes it again as amended: it needs a Phase, an Assignment and a Raid start still ahead. */
export function publish(raid, now) {
    if (raid.state.kind === "cancelled")
        return refused({ kind: "cancelled" });
    if (raid.plan.phases.length === 0 || raid.plan.assignments.length === 0)
        return refused({ kind: "nothing-to-publish" });
    if (now.getTime() >= raid.start.getTime())
        return refused({ kind: "start-passed" });
    const state = raid.state.kind === "published"
        ? { kind: "published", publishedAt: raid.state.publishedAt, amendedAt: now }
        : { kind: "published", publishedAt: now, amendedAt: undefined };
    return { ok: true, raid: { ...raid, state } };
}
/** Cancels the Raid for good, for that week. */
export function cancel(raid, now) {
    if (raid.state.kind === "cancelled")
        return refused({ kind: "cancelled" });
    const publishedAt = raid.state.kind === "published" ? raid.state.publishedAt : undefined;
    return { ok: true, raid: { ...raid, state: { kind: "cancelled", cancelledAt: now, publishedAt } } };
}
/** The first Plan Confirmation per Alliance wins; the Raid must be published and not cancelled. */
export function confirmPlan(raid, confirmations, confirmation) {
    if (raid.state.kind === "cancelled")
        return { ok: false, refusal: { kind: "cancelled" } };
    if (raid.state.kind === "draft")
        return { ok: false, refusal: { kind: "not-published" } };
    const earlier = confirmations.find((existing) => existing.tag === confirmation.tag);
    if (earlier !== undefined)
        return { ok: false, refusal: { kind: "already-confirmed", confirmation: earlier } };
    return { ok: true };
}
/** The key of a Phase's Raid Reminder: its name and time, so a Phase moved to another time is reminded again. */
function phaseKey(phase) {
    return `reminder:phase:${phase.name.toLowerCase()}@${phase.at.toISOString()}`;
}
/** Every notice of the Raid, in time order. */
export function noticesOf(raid, deadlines) {
    const confirmationDeadline = confirmationDeadlineOf(raid, deadlines.confirmationHours);
    const notices = [
        { kind: "plan-deadline", key: "plan-deadline", at: planDeadlineOf(raid, deadlines.planHours) },
        ...CHASE_LEAD_HOURS.map((hours) => ({
            kind: "chase",
            key: `chase:${hours.toString()}h`,
            at: new Date(confirmationDeadline.getTime() - hours * HOUR_MS),
        })),
        { kind: "confirmation-deadline", key: "confirmation-deadline", at: confirmationDeadline },
        {
            kind: "reminder",
            key: "reminder:start",
            at: new Date(raid.start.getTime() - RAID_REMINDER_LEAD_MINUTES * MINUTE_MS),
            phase: undefined,
        },
        ...raid.plan.phases.map((phase) => ({ kind: "reminder", key: phaseKey(phase), at: phase.at, phase })),
    ];
    return notices.sort((a, b) => a.at.getTime() - b.at.getTime());
}
/**
 * Which notices are due at `now`, given the keys already handled. A cancelled Raid has none. The Plan Deadline mention
 * goes out while the Raid is a draft, before its start. Chases and the Confirmation Deadline only for a published Raid;
 * those due before it was first published are recorded unsent. Missed ones collapse as Event Reminders do: only the latest
 * due one goes out, if its target (the Confirmation Deadline for a chase, the start for the deadline list) hasn't passed.
 * A Raid Reminder goes out for a published Raid when at most 10 minutes late, and is recorded otherwise.
 */
export function dueNotices(raid, deadlines, handled, now) {
    if (raid.state.kind === "cancelled")
        return { send: [], record: [] };
    const due = noticesOf(raid, deadlines).filter((notice) => !handled.has(notice.key) && notice.at.getTime() <= now.getTime());
    const send = [];
    const record = [];
    const beforeStart = now.getTime() < raid.start.getTime();
    const state = raid.state;
    for (const notice of due.filter((candidate) => candidate.kind === "plan-deadline")) {
        if (state.kind === "published")
            record.push(notice);
        else if (beforeStart)
            send.push(notice);
        else
            record.push(notice);
    }
    if (state.kind === "published") {
        const confirmationDeadline = confirmationDeadlineOf(raid, deadlines.confirmationHours);
        const calls = due.filter((notice) => notice.kind === "chase" || notice.kind === "confirmation-deadline");
        const skipped = calls.filter((notice) => notice.kind === "chase" && notice.at.getTime() < state.publishedAt.getTime());
        record.push(...skipped);
        const rest = calls.filter((notice) => !skipped.includes(notice));
        const latest = rest.at(-1);
        if (latest !== undefined) {
            const target = latest.kind === "chase" ? confirmationDeadline : raid.start;
            if (now.getTime() < target.getTime())
                send.push(latest);
            else
                record.push(latest);
            record.push(...rest.slice(0, -1));
        }
        for (const notice of due.filter((candidate) => candidate.kind === "reminder")) {
            if (now.getTime() - notice.at.getTime() <= RAID_REMINDER_LATE_MINUTES * MINUTE_MS)
                send.push(notice);
            else
                record.push(notice);
        }
    }
    else {
        // A draft past its Confirmation Deadline will get no chase: those are recorded, so they never go out late.
        record.push(...due.filter((notice) => notice.kind === "chase" || notice.kind === "confirmation-deadline"));
    }
    return { send, record };
}
//# sourceMappingURL=raid.js.map