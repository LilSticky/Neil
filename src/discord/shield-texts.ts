import type { ShieldStanding } from "../domain/shield.js";
import { mentionText } from "./mentions.js";
import { timestamp } from "./timestamps.js";

/** The custom id prefix of the Shielded button: `shield:<week>`. */
export const SHIELD_PREFIX = "shield:";

/** The channel of each Alliance area the Shield Reminders go to. */
export const ALLIANCE_CHAT_CHANNEL = "alliance-chat";
/** The channel of each Alliance area the Shield Lists go to: seen only by that Alliance's Leaders Role and Neil. */
export const ALLIANCE_LEADERS_CHANNEL = "alliance-leaders";

/** Discord's limit on a message's content; a Shield List is split into messages below it. */
const CONTENT_LIMIT = 2000;

/** The Shield Deadline as Discord timestamps: the full date and time, and how long until then. */
function deadlineText(deadline: Date): string {
  return `${timestamp(deadline, "F")} (${timestamp(deadline, "R")})`;
}

export const shieldMessages = {
  buttonLabel: "Shielded",
  reminder: (tag: string, deadline: Date): string =>
    `🛡️ **Shield before Friday's reset, [${tag}]!** It is a KvK Week: shield your city before ${deadlineText(deadline)}, so the enemy Kingdom gets no easy points. Press **Shielded** once you have, and Neil stops reminding you this week.`,
  list: (tag: string, deadline: Date, standing: ShieldStanding): string[] => {
    const header = `🛡️ **Shield List of [${tag}]**, Friday's reset ${deadlineText(deadline)}`;
    if (standing.total === 0) return [header, "No Linked Members of the Alliance are on the server."];
    const lines = [header, `${standing.confirmed.toString()} of ${standing.total.toString()} confirmed.`];
    if (standing.toRemind.length === 0 && standing.remindersOff.length === 0) {
      lines.push("Everyone has confirmed. 🎉");
      return lines;
    }
    if (standing.toRemind.length > 0) lines.push(`Not confirmed: ${mentionText(standing.toRemind)}`);
    if (standing.remindersOff.length > 0) {
      lines.push(`Not confirmed, Shield Reminders Off: ${mentionText(standing.remindersOff)}`);
    }
    return lines;
  },
  press: {
    invalid: "This button is not one Neil knows. Nothing was recorded.",
    notAllowed: "Only a Linked Member of this Alliance can confirm here. Nothing was recorded.",
    passed: "Friday's reset has passed. Nothing was recorded.",
    notKvkWeek: "This week is no longer a KvK Week. Nothing was recorded.",
    recorded: (deadline: Date): string =>
      `🛡️ Neil has recorded that you are shielded for Friday's reset ${deadlineText(deadline)}. No more Shield Reminders this week.`,
    already: "Your Shield Confirmation for this week is already recorded.",
  },
  reminders: {
    unavailable: "Shield Reminders are not available right now. Please tell an Officer.",
    notLinked: "Only Linked Members can choose their Shield Reminders. Nothing was changed.",
    invalid: "Choose On or Off. Nothing was changed.",
    shown: (off: boolean): string =>
      off
        ? "Your Shield Reminders are **off**: Neil does not mention you before Friday's reset in a KvK Week. You can still press Shielded."
        : "Your Shield Reminders are **on**: in a KvK Week Neil mentions you in your alliance-chat until you press Shielded.",
    recorded: (off: boolean): string =>
      off
        ? "Your Shield Reminders are now **off**. Your Alliance's leaders still see in the Shield List that you have not confirmed."
        : "Your Shield Reminders are now **on**.",
  },
  kvkWeek: {
    unavailable: "KvK Weeks are not available right now.",
    notAllowed: "Only Officers mark KvK Weeks. Nothing was changed.",
    marked: (deadline: Date): string =>
      `Neil has marked the week of Friday's reset ${deadlineText(deadline)} as a KvK Week. Shield Reminders go out before it.`,
    alreadyMarked: (deadline: Date): string =>
      `The week of Friday's reset ${deadlineText(deadline)} is already a KvK Week. Nothing was changed.`,
    unmarked: (deadline: Date): string =>
      `Neil has unmarked the week of Friday's reset ${deadlineText(deadline)}: no more Shield Reminders go out, and its Shield Confirmations are deleted.`,
    notMarked: (deadline: Date): string =>
      `The week of Friday's reset ${deadlineText(deadline)} is not a KvK Week. Nothing was changed.`,
    shown: (deadline: Date, marked: boolean): string =>
      marked
        ? `The week of Friday's reset ${deadlineText(deadline)} is a KvK Week.`
        : `The week of Friday's reset ${deadlineText(deadline)} is not a KvK Week.`,
    logMarked: (officerId: string, week: string): string => `🛡️ <@${officerId}> marked the week of ${week} as a KvK Week.`,
    logUnmarked: (officerId: string, week: string): string => `🛡️ <@${officerId}> unmarked the week of ${week} as a KvK Week.`,
  },
  log: {
    round: (week: string, leadMinutes: number, mentioned: number, alliances: number): string =>
      `🛡️ Shield Reminder (${leadMinutes.toString()} minutes before the reset of ${week}): ${mentioned.toString()} Members mentioned in ${alliances.toString()} Alliances.`,
    noChannel: (tag: string, channel: string, what: string): string =>
      `The ${what} for [${tag}] was not posted: its area has no ${channel}.`,
    failed: (tag: string, what: string, reason: string): string => `Posting the ${what} for [${tag}] failed: ${reason}`,
  },
};

/** Lines as messages under Discord's 2,000 characters: whole lines where they fit, a too long line split at its spaces. */
export function packLines(lines: readonly string[]): string[] {
  const limit = CONTENT_LIMIT - 1;
  const messages: string[] = [];
  let current = "";
  const add = (piece: string, separator: string): void => {
    if (current.length === 0) current = piece;
    else if (current.length + separator.length + piece.length <= limit) current = `${current}${separator}${piece}`;
    else {
      messages.push(current);
      current = piece;
    }
  };
  for (const line of lines) {
    if (line.length <= limit) {
      add(line, "\n");
      continue;
    }
    line.split(" ").forEach((word, index) => {
      add(word, index === 0 ? "\n" : " ");
    });
  }
  if (current.length > 0) messages.push(current);
  return messages;
}
