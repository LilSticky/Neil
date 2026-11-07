import type { BootyMode } from "../domain/booty.js";
import type { StoredBootyAlerts } from "../storage/booty-alerts-store.js";

const MODE_LABELS: Readonly<Record<BootyMode, string>> = {
  off: "Off",
  always: "Always",
  online: "Only when online",
  offline: "Only when offline",
};

/** A minute after midnight as HH:MM, 24-hour. */
function clockOf(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

/** The window as Neil shows it: the whole day when start and end are equal, otherwise start to end. */
function windowOf(alerts: StoredBootyAlerts): string {
  const { startMinute, endMinute } = alerts.window;
  if (startMinute === endMinute) return "all day";
  return `${clockOf(startMinute)} to ${clockOf(endMinute)}`;
}

/** The Booty Alerts a Member has, in plain words. Off has no window or time zone to show. */
function summaryOf(alerts: StoredBootyAlerts | undefined): string {
  if (alerts === undefined || alerts.mode === "off") return "Your Booty Alerts: Off.";
  return `Your Booty Alerts: ${MODE_LABELS[alerts.mode]}, ${windowOf(alerts)}, time zone ${alerts.timeZone}.`;
}

/** The texts of /booty-alerts. Neil speaks as the Liaison in the alliance hall: short, plain, and always private. */
export const bootyAlertsMessages = {
  notLinked:
    "Neil keeps Booty Alerts for Linked Members only. Link your Player first, then run /booty-alerts again.",
  invalidMode: "Neil does not know that mode. Choose Off, Always, Only when online or Only when offline. Nothing was changed.",
  invalidStart: "Neil needs the start as HH:MM on the 24-hour clock, such as 08:00. Nothing was changed.",
  invalidEnd: "Neil needs the end as HH:MM on the 24-hour clock, such as 23:00. Nothing was changed.",
  invalidTimeZone:
    "Neil does not know that time zone. Pick one from the suggestions, such as Europe/Lisbon. Nothing was changed.",
  unavailable: "Neil could not read or record your Booty Alerts just now. Try again in a moment.",
  /** What the Booty Alerts are, when the Member asks or has changed nothing. */
  shown: (alerts: StoredBootyAlerts | undefined): string => summaryOf(alerts),
  /** What the Booty Alerts are after a change. */
  recorded: (alerts: StoredBootyAlerts): string => `Recorded. ${summaryOf(alerts)}`,
};

/** The texts of /booty and its Booty Call. Neil speaks as the Liaison in the alliance hall: short, plain, and never a doctor. */
export const bootyCallMessages = {
  notLinked: "Neil calls a Booty only for Linked Members. Link your Player first, then run /booty again. Nothing was posted.",
  wrongChannel: "Neil calls a Booty only in #alliance-chat, in the category of your Alliance. Nothing was posted.",
  notInAlliance: "Only holders of your Alliance's role can call a Booty. Nothing was posted.",
  /** The private question before a Booty Call: nothing is posted until Confirm. */
  confirmation: (roleName: string): string =>
    `Call a Booty for ${roleName}? Press Confirm within one minute, or Cancel. Nothing is posted until you press Confirm.`,
  cancelled: "Booty Call cancelled. Nothing was posted.",
  expired: "This Booty Call has expired. Run /booty again to start a new one. Nothing was posted.",
  notYours: "This Booty Call is another Member's. Run /booty to start your own. Nothing was posted.",
  unknownButton: "Neil does not know this button any more. Run /booty again.",
  /** A Booty Call in the Alliance within the minute: the card's link when it is posted already. */
  coolingDown: (roleName: string, link: string | undefined): string =>
    link === undefined
      ? `A Booty Call is already going out for ${roleName}. Wait a minute before the next one.`
      : `A Booty Call went out for ${roleName} a moment ago: ${link}. Wait a minute before the next one.`,
  calling: "Neil is calling the Alliance...",
  posted: (link: string): string => `The Booty Call is posted: ${link}`,
  postFailed: "Neil could not post the Booty Call just now. Nothing went out; try again in a moment.",
  unavailable: "Neil could not make the Booty Call just now. Try again in a moment.",
  /** The first line of the card: who called, for which Alliance. The mentions follow it. */
  callLine: (callerName: string, roleName: string): string => `${callerName} calls a Booty for ${roleName}.`,
  card: {
    title: "Booty Call",
    description: "The Members whose Booty Alerts match right now are mentioned above.",
  },
  /** The #neil-log line: the caller, the Alliance, how many were mentioned, and a note when the Game API could not answer. */
  logLine: (callerId: string, roleName: string, mentioned: number, gameAnswered: boolean): string => {
    const note = gameAnswered ? "" : " The Game API could not answer, so Discord alone decided who is online.";
    return `Booty Call by ${callerId} for ${roleName}: ${mentioned.toString()} mentioned.${note}`;
  },
};
