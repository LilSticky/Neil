import { randomBytes } from "node:crypto";
const LIFETIME_MS = 15 * 60_000;
const MAX_SESSIONS = 500;
const PAGE_SIZE = 25;
const CUSTOM_ID_PATTERN = /^pick:([^:]+):(?:select(?::(\d+))?|page:(\d+))$/;
/** Memory-only pick lists: a restart ends them, and the oldest is dropped beyond 500. */
export class PickSessions {
    sessions = new Map();
    /** Opens a pick list for the Member and returns its id, short enough for a custom id. */
    open(ownerId, choice, now) {
        const id = randomBytes(8).toString("hex");
        this.sessions.set(id, { id, ownerId, createdAt: now, choice, page: 0 });
        if (this.sessions.size > MAX_SESSIONS) {
            const oldest = this.sessions.keys().next();
            if (!oldest.done)
                this.sessions.delete(oldest.value);
        }
        return id;
    }
    /** The pick list while it is younger than 15 minutes; otherwise "expired", also for an unknown id. */
    get(id, now) {
        const session = this.sessions.get(id);
        if (session === undefined || now.getTime() - session.createdAt.getTime() >= LIFETIME_MS)
            return "expired";
        return session;
    }
    /** Remembers the page a roster menu was turned to, clamped to the roster's pages; an unknown id does nothing. */
    turnPage(id, page) {
        const session = this.sessions.get(id);
        if (session === undefined)
            return;
        this.sessions.set(id, { ...session, page: clampPage(page, entriesOf(session.choice)) });
    }
}
/** Whether the Member is the one who opened the pick list. */
export function isOwner(session, userId) {
    return session.ownerId === userId;
}
/** The entries a pick list offers: a roster's members or the matches of a pick list. */
function entriesOf(choice) {
    return choice.kind === "roster" ? choice.entries : choice.matches;
}
/** A page number kept between the first page and the last page the entries take; an empty list has one page. */
export function clampPage(page, entries) {
    return Math.min(Math.max(page, 0), Math.max(0, pageCount(entries) - 1));
}
/** The entries shown on one page, 25 per page; a page outside the list is clamped to the nearest one. */
export function pageOf(entries, page) {
    const current = clampPage(page, entries);
    return entries.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
}
/** How many pages the entries take, 25 per page. */
export function pageCount(entries) {
    return Math.ceil(entries.length / PAGE_SIZE);
}
/** Reads a pick list's custom id; anything else, including a malformed `pick:` id, gives undefined. */
export function parseCustomId(customId) {
    const match = CUSTOM_ID_PATTERN.exec(customId);
    if (match === null)
        return undefined;
    const [, sessionId, selectPage, page] = match;
    if (sessionId === undefined)
        return undefined;
    if (page !== undefined)
        return { sessionId, action: "page", page: Number(page) };
    if (selectPage === undefined)
        return { sessionId, action: "select" };
    return { sessionId, action: "select", page: Number(selectPage) };
}
//# sourceMappingURL=pick-sessions.js.map