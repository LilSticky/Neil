import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { NapEvent } from "../domain/nap.js";
import type { MemberId } from "../domain/rank-approval.js";

/** An open join request: the Alliance, the Linked R5 who asked and when, and the message in #nap-leaders once posted. */
export interface NapJoinRequest {
  readonly tag: string;
  readonly requestedBy: MemberId;
  readonly requestedAt: Date;
  /** The channel and message of the request in #nap-leaders; undefined until it is posted. */
  readonly channelId: string | undefined;
  readonly messageId: string | undefined;
}

const snowflake = z.string().regex(/^\d{1,20}$/);

const historyRow = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("joined"),
    tag: z.string().min(1),
    at: z.iso.datetime(),
    actor_id: snowflake,
    requested_by: snowflake,
    requested_at: z.iso.datetime(),
    approved_as: z.enum(["council", "officer"]),
  }),
  z.object({
    kind: z.literal("left"),
    tag: z.string().min(1),
    at: z.iso.datetime(),
    actor_id: snowflake,
    requested_by: z.null(),
    requested_at: z.null(),
    approved_as: z.null(),
  }),
]);

const requestRow = z.object({
  tag: z.string().min(1),
  requested_by: snowflake,
  requested_at: z.iso.datetime(),
  channel_id: snowflake.nullable(),
  message_id: snowflake.nullable(),
});

const CORRUPT = "the NaP register in neil.db is corrupt; fix or remove it by hand";

/**
 * Keeps the NaP register in neil.db: the history of joins and leaves (oldest first) and the open join requests. Every
 * method is synchronous, so a check and the write after it run with no await in between.
 */
export class NapStore {
  constructor(private readonly db: DatabaseSync) {}

  /** Every join and leave, oldest first. */
  history(): readonly NapEvent[] {
    return this.db
      .prepare("SELECT tag, kind, at, actor_id, requested_by, requested_at, approved_as FROM nap_history ORDER BY id")
      .all()
      .map(eventOf);
  }

  /** Adds one join or leave at the end of the history. */
  append(event: NapEvent): void {
    const insert = this.db.prepare(
      `INSERT INTO nap_history (tag, kind, at, actor_id, requested_by, requested_at, approved_as)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    if (event.kind === "joined") {
      insert.run(
        event.tag,
        "joined",
        event.at.toISOString(),
        event.approvedBy,
        event.requestedBy,
        event.requestedAt.toISOString(),
        event.approvedAs,
      );
    } else {
      insert.run(event.tag, "left", event.at.toISOString(), event.leftBy, null, null, null);
    }
  }

  /** The open join requests, oldest first. */
  openRequests(): readonly NapJoinRequest[] {
    return this.db
      .prepare("SELECT tag, requested_by, requested_at, channel_id, message_id FROM nap_join_requests ORDER BY requested_at, tag")
      .all()
      .map(requestOf);
  }

  /** The open join request for the Alliance with this tag (ignoring letter case); undefined when none is open. */
  request(tag: string): NapJoinRequest | undefined {
    const raw = this.db
      .prepare("SELECT tag, requested_by, requested_at, channel_id, message_id FROM nap_join_requests WHERE tag = ?")
      .get(tag);
    return raw === undefined ? undefined : requestOf(raw);
  }

  /** Stores a new join request, not posted yet; throws when one for the same Alliance is open. */
  addRequest(request: { readonly tag: string; readonly requestedBy: MemberId; readonly requestedAt: Date }): void {
    this.db
      .prepare("INSERT INTO nap_join_requests (tag, requested_by, requested_at) VALUES (?, ?, ?)")
      .run(request.tag, request.requestedBy, request.requestedAt.toISOString());
  }

  /** Records where the request of `tag` made at `requestedAt` was posted; nothing when that request is no longer open. */
  setRequestMessage(tag: string, requestedAt: Date, channelId: string, messageId: string): void {
    this.db
      .prepare("UPDATE nap_join_requests SET channel_id = ?, message_id = ? WHERE tag = ? AND requested_at = ?")
      .run(channelId, messageId, tag, requestedAt.toISOString());
  }

  /** Removes the open join request for the Alliance with this tag, if any. */
  removeRequest(tag: string): void {
    this.db.prepare("DELETE FROM nap_join_requests WHERE tag = ?").run(tag);
  }
}

function eventOf(raw: Record<string, unknown>): NapEvent {
  const parsed = historyRow.safeParse(raw);
  if (!parsed.success) throw new Error(CORRUPT);
  const row = parsed.data;
  if (row.kind === "left") return { kind: "left", tag: row.tag, leftBy: row.actor_id, at: new Date(row.at) };
  return {
    kind: "joined",
    tag: row.tag,
    requestedBy: row.requested_by,
    requestedAt: new Date(row.requested_at),
    approvedBy: row.actor_id,
    approvedAs: row.approved_as,
    at: new Date(row.at),
  };
}

function requestOf(raw: Record<string, unknown>): NapJoinRequest {
  const parsed = requestRow.safeParse(raw);
  if (!parsed.success) throw new Error(CORRUPT);
  const row = parsed.data;
  return {
    tag: row.tag,
    requestedBy: row.requested_by,
    requestedAt: new Date(row.requested_at),
    channelId: row.channel_id ?? undefined,
    messageId: row.message_id ?? undefined,
  };
}
