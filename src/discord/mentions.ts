import type { APIEmbed, BaseMessageOptions } from "discord.js";
import type { MemberId } from "../domain/rank-approval.js";

/** Discord's limit on a message's content, in characters. */
const CONTENT_LIMIT = 2000;

/** The Discord limit on mentioned users per message is 100; 80 keeps each message under that and under 2,000 characters. */
export const MENTIONS_PER_MESSAGE = 80;

/** The mentions of Members, one after another. */
export function mentionText(mentioned: readonly MemberId[]): string {
  return mentioned.map((memberId) => `<@${memberId}>`).join(" ");
}

/** A follow-up message of mentions only, for the Members beyond a first message. */
export function mentionsMessage(mentioned: readonly MemberId[]): BaseMessageOptions {
  return { content: mentionText(mentioned), allowedMentions: { parse: [], users: [...mentioned] } };
}

export function chunksOf<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

/**
 * A text with its mentions, as messages. The first message carries the text, the embeds and as many mentions as fit
 * with the text (at most 80); the rest follow as mention-only messages of 80. allowedMentions are exactly those Members.
 */
export function textWithMentions(text: string, mentioned: readonly MemberId[], embeds: APIEmbed[] = []): BaseMessageOptions[] {
  const first = mentioned.slice(0, firstChunkSize(text, mentioned));
  const content = first.length === 0 ? text : `${text} ${mentionText(first)}`;
  const head: BaseMessageOptions = { content, embeds, allowedMentions: { parse: [], users: [...first] } };
  return [head, ...chunksOf(mentioned.slice(first.length), MENTIONS_PER_MESSAGE).map(mentionsMessage)];
}

/** The most mentions, up to 80, that keep the text and its mentions within Discord's 2,000 characters. */
function firstChunkSize(text: string, mentioned: readonly MemberId[]): number {
  let size = Math.min(MENTIONS_PER_MESSAGE, mentioned.length);
  while (size > 0 && `${text} ${mentionText(mentioned.slice(0, size))}`.length > CONTENT_LIMIT) size -= 1;
  return size;
}
