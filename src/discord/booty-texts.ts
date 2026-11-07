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
