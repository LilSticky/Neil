import type { APIAllowedMentions } from "discord.js";
import type { ApprovableRank, MemberId } from "../domain/rank-approval.js";
import type { Message } from "./interview-texts.js";

const NO_MENTIONS: APIAllowedMentions = { parse: [] };

/** The text of a reply; the command defers it privately, so only the Member who ran it sees it. */
function replyText(content: string): Message {
  return { content, allowedMentions: NO_MENTIONS };
}

/** The private reply to a command that only an Officer may run. */
export function notOfficerReply(): Message {
  return replyText("Only an Officer can do that.");
}

/** The private reply when the Member has no Link to end or to give a rank to. */
export function notLinkedReply(memberId: MemberId): Message {
  return replyText(`<@${memberId}> is not Linked, so there is no Link to change.`);
}

/** The private reply after the caller's own Link has ended. */
export function unlinkedSelfReply(): Message {
  return replyText("Your Link has ended. To be linked again, run /interview.");
}

/** The private reply to an Officer after they Unlinked a Member. */
export function unlinkedByOfficerReply(memberId: MemberId): Message {
  return replyText(`The Link of <@${memberId}> has ended.`);
}

/** The private reply to /rank when the Officer names their own Linked Member. */
export function ownLinkReply(): Message {
  return replyText("You can't give your own rank: another Officer must.");
}

/** The private reply to /rank for a Linked Member who is in no Alliance. */
export function noAllianceReply(memberId: MemberId): Message {
  return replyText(`<@${memberId}> is in no Alliance, so no rank can be given.`);
}

/** The private reply to /rank when the member or the rank is missing or not R1 to R5. */
export function rankInputReply(): Message {
  return replyText("Name a Member and a rank from R1 to R5.");
}

/**
 * The private reply once an Officer gave a rank. When the Game API lists another rank for the Member, the reply says the
 * next Daily Sync uses that rank instead.
 */
export function rankSetReply(memberId: MemberId, rank: ApprovableRank, gameRank: ApprovableRank | undefined): Message {
  const gameNote =
    gameRank === undefined
      ? ""
      : ` The game lists ${gameRank} for them, so the next Daily Sync uses ${gameRank} instead.`;
  return replyText(`The rank of <@${memberId}> is now ${rank}.${gameNote}`);
}

/** The message in a Rank Approval's thread when an Officer set the rank before the Members of it did. */
export function rankSetInThreadMessage(officerId: MemberId, memberId: MemberId, rank: ApprovableRank): Message {
  return {
    content: `<@${officerId}> set <@${memberId}>'s rank to ${rank}.`,
    allowedMentions: NO_MENTIONS,
  };
}
