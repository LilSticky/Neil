import { randomBytes } from "node:crypto";
import type { Match, RosterEntry } from "../domain/player.js";

/** What a pick list lets its owner choose from. */
export type PickChoice =
  | { readonly kind: "players"; readonly matches: readonly Match[] }
  | { readonly kind: "alliances"; readonly matches: readonly Match[] }
  | { readonly kind: "roster"; readonly entries: readonly RosterEntry[] };

/** A pick list as the bot remembers it: who opened it, what it offers, the page shown and when. */
export interface PickSession {
  readonly id: string;
  readonly ownerId: string;
  readonly createdAt: Date;
  readonly choice: PickChoice;
  /** The page of a roster menu on screen; 0 for a pick list of matches, which has one page. */
  readonly page: number;
}

const LIFETIME_MS = 15 * 60_000;
const MAX_SESSIONS = 500;
const PAGE_SIZE = 25;

const CUSTOM_ID_PATTERN = /^pick:([^:]+):(?:(select)|page:(\d+))$/;

/** Memory-only pick lists: a restart ends them, and the oldest is dropped beyond 500. */
export class PickSessions {
  private readonly sessions = new Map<string, PickSession>();

  /** Opens a pick list for the Member and returns its id, short enough for a custom id. */
  open(ownerId: string, choice: PickChoice, now: Date): string {
    const id = randomBytes(8).toString("hex");
    this.sessions.set(id, { id, ownerId, createdAt: now, choice, page: 0 });
    if (this.sessions.size > MAX_SESSIONS) {
      const oldest = this.sessions.keys().next();
      if (!oldest.done) this.sessions.delete(oldest.value);
    }
    return id;
  }

  /** The pick list while it is younger than 15 minutes; otherwise "expired", also for an unknown id. */
  get(id: string, now: Date): PickSession | "expired" {
    const session = this.sessions.get(id);
    if (session === undefined || now.getTime() - session.createdAt.getTime() >= LIFETIME_MS) return "expired";
    return session;
  }

  /** Remembers the page a roster menu was turned to, clamped to the roster's pages; an unknown id does nothing. */
  turnPage(id: string, page: number): void {
    const session = this.sessions.get(id);
    if (session === undefined) return;
    this.sessions.set(id, { ...session, page: clampPage(page, entriesOf(session.choice)) });
  }
}

/** Whether the Member is the one who opened the pick list. */
export function isOwner(session: PickSession, userId: string): boolean {
  return session.ownerId === userId;
}

/** The entries a pick list offers: a roster's members or the matches of a pick list. */
function entriesOf(choice: PickChoice): readonly unknown[] {
  return choice.kind === "roster" ? choice.entries : choice.matches;
}

/** A page number kept between the first page and the last page the entries take; an empty list has one page. */
export function clampPage(page: number, entries: readonly unknown[]): number {
  return Math.min(Math.max(page, 0), Math.max(0, pageCount(entries) - 1));
}

/** The entries shown on one page, 25 per page; a page outside the list is clamped to the nearest one. */
export function pageOf<T>(entries: readonly T[], page: number): readonly T[] {
  const current = clampPage(page, entries);
  return entries.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
}

/** How many pages the entries take, 25 per page. */
export function pageCount(entries: readonly unknown[]): number {
  return Math.ceil(entries.length / PAGE_SIZE);
}

/** What a component interaction asks for, read back from `pick:{sessionId}:select` or `pick:{sessionId}:page:{n}`. */
export type ParsedCustomId =
  | { readonly sessionId: string; readonly action: "select" }
  | { readonly sessionId: string; readonly action: "page"; readonly page: number };

/** Reads a pick list's custom id; anything else, including a malformed `pick:` id, gives undefined. */
export function parseCustomId(customId: string): ParsedCustomId | undefined {
  const match = CUSTOM_ID_PATTERN.exec(customId);
  if (match === null) return undefined;
  const [, sessionId, select, page] = match;
  if (sessionId === undefined) return undefined;
  if (select !== undefined) return { sessionId, action: "select" };
  if (page === undefined) return undefined;
  return { sessionId, action: "page", page: Number(page) };
}
