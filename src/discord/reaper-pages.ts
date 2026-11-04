import { randomBytes } from "node:crypto";
import type { Exile } from "../domain/exile.js";
import type { ClosestRanking } from "./reaper.js";

/** What a paged /reaper answer shows: the closest ranking as it was answered, or the REAPER list. */
export type ReaperPageContent =
  | { readonly kind: "closest"; readonly ranking: ClosestRanking }
  | { readonly kind: "list"; readonly exiles: readonly Exile[] };

/** A paged /reaper answer as the bot remembers it: who ran it, what it shows and when it was opened. */
export interface ReaperPage<T> {
  readonly id: string;
  readonly ownerId: string;
  readonly createdAt: Date;
  readonly content: T;
}

/** What a page button asks for, read back from `reaper:{sessionId}:page:{n}`. */
export interface ParsedReaperCustomId {
  readonly sessionId: string;
  readonly page: number;
}

const LIFETIME_MS = 15 * 60_000;
const MAX_SESSIONS = 500;
const CUSTOM_ID_PATTERN = /^reaper:([^:]+):page:(\d+)$/;

/** Memory-only paged answers of /reaper: a restart ends them, and the oldest is dropped beyond 500. */
export class ReaperPages<T> {
  private readonly sessions = new Map<string, ReaperPage<T>>();

  /** Keeps the answer for the Member and returns its id, short enough for a custom id. */
  open(ownerId: string, content: T, now: Date): string {
    const id = randomBytes(8).toString("hex");
    this.sessions.set(id, { id, ownerId, createdAt: now, content });
    if (this.sessions.size > MAX_SESSIONS) {
      const oldest = this.sessions.keys().next();
      if (!oldest.done) this.sessions.delete(oldest.value);
    }
    return id;
  }

  /** The answer while it is younger than 15 minutes; otherwise "expired", also for an unknown id. */
  get(id: string, now: Date): ReaperPage<T> | "expired" {
    const session = this.sessions.get(id);
    if (session === undefined || now.getTime() - session.createdAt.getTime() >= LIFETIME_MS) return "expired";
    return session;
  }
}

/** Whether the Member is the one who ran the /reaper answer. */
export function isOwner(session: { readonly ownerId: string }, userId: string): boolean {
  return session.ownerId === userId;
}

/** The custom id of the page button that shows a page of a paged answer. */
export function reaperPageCustomId(sessionId: string, page: number): string {
  return `reaper:${sessionId}:page:${page.toString()}`;
}

/** Reads a page button's custom id; anything else, including a malformed `reaper:` id, gives undefined. */
export function parseReaperCustomId(customId: string): ParsedReaperCustomId | undefined {
  const match = CUSTOM_ID_PATTERN.exec(customId);
  if (match === null) return undefined;
  const [, sessionId, page] = match;
  if (sessionId === undefined || page === undefined) return undefined;
  return { sessionId, page: Number(page) };
}

/** How many pages the entries take, the given number per page; an empty list has no pages. */
export function reaperPageCount(entryCount: number, pageSize: number): number {
  return Math.ceil(entryCount / pageSize);
}

/** A page number kept between the first page and the last of the pages there are; a page count of 0 gives page 0. */
export function clampReaperPage(page: number, pageCount: number): number {
  return Math.min(Math.max(page, 0), Math.max(0, pageCount - 1));
}

/** The entries of one page, the given number per page; a page outside the list is clamped to the nearest one. */
export function reaperPageOf<T>(entries: readonly T[], page: number, pageSize: number): readonly T[] {
  const current = clampReaperPage(page, reaperPageCount(entries.length, pageSize));
  return entries.slice(current * pageSize, (current + 1) * pageSize);
}
