import { escapeMarkdown } from "discord.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { Message } from "./interview-texts.js";
import type { ApplyReport, SkipReason, Skipped } from "./member-roles.js";

const SKIP_REASON_TEXT: Record<SkipReason, string> = {
  "has-permissions": "must lose its permissions or be renamed first",
  owner: "server owner",
  hierarchy: "above Neil's highest role",
  "not-managed": "not a Managed Role",
  "missing-permissions": "missing permissions",
  error: "error",
};

/** The log line of one apply: the nickname, then the roles added, removed and created, then every skipped step. */
export function nameAndRolesLogLine(memberId: MemberId, report: ApplyReport, nickname: string): Message {
  const parts = [nicknamePart(report, nickname)];
  if (report.added.length > 0) parts.push(`added ${namesText(report.added)}`);
  if (report.removed.length > 0) parts.push(`removed ${namesText(report.removed)}`);
  if (report.created.length > 0) parts.push(`created ${namesText(report.created)}`);
  if (report.skipped.length > 0) parts.push(`skipped ${report.skipped.map(skippedText).join(", ")}`);
  return { content: `🏷️ <@${memberId}>: ${parts.join("; ")}.`, allowedMentions: { parse: [] } };
}

/** The log line when the Game API gives no Player for a Member whose Rank Approval was given: nothing is applied. */
export function nameAndRolesNotAppliedLogLine(memberId: MemberId): Message {
  return {
    content: `🏷️ <@${memberId}>: name and roles not changed; the Game API gave no Player.`,
    allowedMentions: { parse: [] },
  };
}

/** The log line when a Rank Approval's apply stops at a Game API quota stop: nothing is applied. */
export function nameAndRolesQuotaLogLine(memberId: MemberId): Message {
  return {
    content: `🏷️ <@${memberId}>: name and roles not changed; the Game API quota stopped the lookup.`,
    allowedMentions: { parse: [] },
  };
}

/** The log line when the startup apply stops at a Game API quota stop: the Linked Members not yet looked up are left. */
export function nameAndRolesLeftLogLine(left: number): Message {
  const noun = left === 1 ? "Linked Member" : "Linked Members";
  return {
    content: `🏷️ Name and roles at startup stopped by the Game API quota: ${left.toString()} ${noun} left for the next start.`,
    allowedMentions: { parse: [] },
  };
}

function nicknamePart(report: ApplyReport, nickname: string): string {
  switch (report.nickname) {
    case "set":
      return `nickname set to ${escapeMarkdown(nickname)}`;
    case "skipped":
      return "nickname not set";
    case "untouched":
      return "nickname unchanged";
  }
}

function skippedText(skip: Skipped): string {
  return `${escapeMarkdown(skip.what)} (${SKIP_REASON_TEXT[skip.reason]})`;
}

/** Role names as the log names them: escaped, so a name with Discord markdown shows as typed. */
function namesText(names: readonly string[]): string {
  return names.map((name) => escapeMarkdown(name)).join(", ");
}
