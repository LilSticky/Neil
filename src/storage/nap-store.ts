import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { NapDecision, NapEvent, NapVote } from "../domain/nap.js";
import type { MemberId } from "../domain/rank-approval.js";

/**
 * An open join request: the Alliance, the Linked R5 who asked and when, the message in #nap-leaders once posted, and the
 * end of its NaP Vote once the vote is open.
 */
export interface NapJoinRequest {
  readonly tag: string;
  readonly requestedBy: MemberId;
  readonly requestedAt: Date;
  /** The channel and message of the request in #nap-leaders; undefined until it is posted. */
  readonly channelId: string | undefined;
  readonly messageId: string | undefined;
  /** When the NaP Vote on it ends; undefined until it opens (the NaP had no members when it was made). */
  readonly voteEndsAt: Date | undefined;
}

const snowflake = z.string().regex(/^\d{1,20}$/);
const count = z.number().int().nonnegative();

const decidedRow = z.object({
  kind: z.enum(["joined", "declined"]),
  tag: z.string().min(1),
  at: z.iso.datetime(),
  requested_by: snowflake,
  requested_at: z.iso.datetime(),
});

const historyRow = z.union([
  decidedRow.extend({
    actor_id: snowflake,
    decided_as: z.enum(["council", "officer"]),
    approve_votes: z.null(),
    decline_votes: z.null(),
  }),
  decidedRow.extend({ actor_id: z.null(), decided_as: z.literal("vote"), approve_votes: count, decline_votes: count }),
  z.object({
    kind: z.literal("left"),
    tag: z.string().min(1),
    at: z.iso.datetime(),
    actor_id: snowflake,
    requested_by: z.null(),
    requested_at: z.null(),
    decided_as: z.null(),
    approve_votes: z.null(),
    decline_votes: z.null(),
  }),
]);

const requestRow = z.object({
  tag: z.string().min(1),
  requested_by: snowflake,
  requested_at: z.iso.datetime(),
  channel_id: snowflake.nullable(),
  message_id: snowflake.nullable(),
  vote_ends_at: z.iso.datetime().nullable(),
});

const voteRow = z.object({
  alliance_tag: z.string().min(1),
  voter_id: snowflake,
  vote: z.enum(["approve", "decline"]),
  at: z.iso.datetime(),
});

const CORRUPT = "the NaP register in neil.db is corrupt; fix or remove it by hand";

const HISTORY_COLUMNS = "tag, kind, at, actor_id, requested_by, requested_at, decided_as, approve_votes, decline_votes";
const REQUEST_COLUMNS = "tag, requested_by, requested_at, channel_id, message_id, vote_ends_at";

/**
 * Keeps the NaP register in neil.db: the history of joins, declines and leaves (oldest first), the open join requests
 * and the NaP Council's votes on them. Every method is synchronous, so a check and the write after it run with no await
 * in between.
 */
export class NapStore {
  constructor(private readonly db: DatabaseSync) {}

  /** Every join, decline and leave, oldest first. */
  history(): readonly NapEvent[] {
    return this.db.prepare(`SELECT ${HISTORY_COLUMNS} FROM nap_history ORDER BY id`).all().map(eventOf);
  }

  /** Adds one join, decline or leave at the end of the history. */
  append(event: NapEvent): void {
    const insert = this.db.prepare(`INSERT INTO nap_history (${HISTORY_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    if (event.kind === "left") {
      insert.run(event.tag, "left", event.at.toISOString(), event.leftBy, null, null, null, null, null);
      return;
    }
    const { decision } = event;
    insert.run(
      event.tag,
      event.kind,
      event.at.toISOString(),
      decision.as === "vote" ? null : decision.by,
      event.requestedBy,
      event.requestedAt.toISOString(),
      decision.as,
      decision.as === "vote" ? decision.approve : null,
      decision.as === "vote" ? decision.decline : null,
    );
  }

  /** The open join requests, oldest first. */
  openRequests(): readonly NapJoinRequest[] {
    return this.db
      .prepare(`SELECT ${REQUEST_COLUMNS} FROM nap_join_requests ORDER BY requested_at, tag`)
      .all()
      .map(requestOf);
  }

  /** The open join request for the Alliance with this tag (ignoring letter case); undefined when none is open. */
  request(tag: string): NapJoinRequest | undefined {
    const raw = this.db.prepare(`SELECT ${REQUEST_COLUMNS} FROM nap_join_requests WHERE tag = ?`).get(tag);
    return raw === undefined ? undefined : requestOf(raw);
  }

  /**
   * Stores a new join request, not posted yet, with the end of its NaP Vote when the vote opens at once; throws when one
   * for the same Alliance is open.
   */
  addRequest(request: {
    readonly tag: string;
    readonly requestedBy: MemberId;
    readonly requestedAt: Date;
    readonly voteEndsAt?: Date | undefined;
  }): void {
    this.db
      .prepare("INSERT INTO nap_join_requests (tag, requested_by, requested_at, vote_ends_at) VALUES (?, ?, ?, ?)")
      .run(request.tag, request.requestedBy, request.requestedAt.toISOString(), request.voteEndsAt?.toISOString() ?? null);
  }

  /** Records where the request of `tag` made at `requestedAt` was posted; nothing when that request is no longer open. */
  setRequestMessage(tag: string, requestedAt: Date, channelId: string, messageId: string): void {
    this.db
      .prepare("UPDATE nap_join_requests SET channel_id = ?, message_id = ? WHERE tag = ? AND requested_at = ?")
      .run(channelId, messageId, tag, requestedAt.toISOString());
  }

  /** Opens the NaP Vote on the request of `tag` made at `requestedAt`, ending at `endsAt`; nothing when it is not open. */
  setVoteEnd(tag: string, requestedAt: Date, endsAt: Date): void {
    this.db
      .prepare("UPDATE nap_join_requests SET vote_ends_at = ? WHERE tag = ? AND requested_at = ?")
      .run(endsAt.toISOString(), tag, requestedAt.toISOString());
  }

  /** Records one Alliance's vote on the request of `tag` made at `requestedAt`, replacing its earlier vote. */
  castVote(tag: string, requestedAt: Date, vote: NapVote): void {
    this.db
      .prepare(
        `INSERT INTO nap_votes (tag, requested_at, alliance_tag, voter_id, vote, at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (tag, requested_at, alliance_tag)
         DO UPDATE SET voter_id = excluded.voter_id, vote = excluded.vote, at = excluded.at`,
      )
      .run(tag, requestedAt.toISOString(), vote.allianceTag, vote.voterId, vote.vote, vote.at.toISOString());
  }

  /** The votes on the request of `tag` made at `requestedAt`, one per Alliance, also after it was decided. */
  votes(tag: string, requestedAt: Date): readonly NapVote[] {
    return this.db
      .prepare(
        "SELECT alliance_tag, voter_id, vote, at FROM nap_votes WHERE tag = ? AND requested_at = ? ORDER BY at, alliance_tag",
      )
      .all(tag, requestedAt.toISOString())
      .map(voteOf);
  }

  /** Removes the open join request for the Alliance with this tag, if any. Its votes are kept as the record. */
  removeRequest(tag: string): void {
    this.db.prepare("DELETE FROM nap_join_requests WHERE tag = ?").run(tag);
  }
}

function eventOf(raw: Record<string, unknown>): NapEvent {
  const parsed = historyRow.safeParse(raw);
  if (!parsed.success) throw new Error(CORRUPT);
  const row = parsed.data;
  if (row.kind === "left") return { kind: "left", tag: row.tag, leftBy: row.actor_id, at: new Date(row.at) };
  const decision: NapDecision =
    row.decided_as === "vote"
      ? { as: "vote", approve: row.approve_votes, decline: row.decline_votes }
      : { as: row.decided_as, by: row.actor_id };
  if (row.kind === "declined" && decision.as === "council") throw new Error(CORRUPT);
  return {
    kind: row.kind,
    tag: row.tag,
    requestedBy: row.requested_by,
    requestedAt: new Date(row.requested_at),
    decision,
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
    voteEndsAt: row.vote_ends_at === null ? undefined : new Date(row.vote_ends_at),
  };
}

function voteOf(raw: Record<string, unknown>): NapVote {
  const parsed = voteRow.safeParse(raw);
  if (!parsed.success) throw new Error(CORRUPT);
  const row = parsed.data;
  return { allianceTag: row.alliance_tag, voterId: row.voter_id, vote: row.vote, at: new Date(row.at) };
}
