import { duelDayOf, type DuelPlan } from "../domain/duel-plan.js";
import { serverDayOf } from "../domain/server-time.js";
import type { EventStore } from "../storage/event-store.js";
import type { EventServer } from "./event-server.js";
import { duelDayName, duelPlanMessage } from "./event-texts.js";

export interface DuelPlanDeps {
  readonly server: Pick<EventServer, "announcementsChannelId" | "post" | "log">;
  readonly events: Pick<EventStore, "duelPlanPostedOn" | "recordDuelPlanPosted">;
  readonly plan: DuelPlan;
  readonly now: () => Date;
  readonly logError: (line: string) => void;
}

export interface DuelPlanPoster {
  /** Posts today's Duel Plan card, once per Duel day. Nothing here throws. */
  tick(): Promise<void>;
}

/**
 * Creates the Duel Plan poster. On each Duel day, Monday to Saturday in Server Time, the first tick posts the day's card
 * in #event-announcements: at the reset, or later that day if Neil was off then, never on a later day. The day is recorded
 * before the post, so a failed post is logged once and not retried, and a day is never posted twice. A day with no text
 * posts nothing and writes one #neil-log line.
 */
export function createDuelPlanPoster(deps: DuelPlanDeps): DuelPlanPoster {
  const { server, events } = deps;

  async function postToday(): Promise<void> {
    const now = deps.now();
    const day = duelDayOf(now);
    if (day === undefined) return;
    const serverDay = serverDayOf(now).date;
    if (events.duelPlanPostedOn(serverDay)) return;
    events.recordDuelPlanPosted(serverDay, now.toISOString());

    const entry = deps.plan[day];
    if (entry.scores.trim().length === 0) {
      await server.log(`No Duel Plan text for ${duelDayName(day)} in src/duel-plan.ts; nothing was posted.`);
      return;
    }
    const channelId = server.announcementsChannelId();
    if (channelId === undefined) {
      deps.logError(`The Duel Plan for ${duelDayName(day)} was not posted: the server has no #event-announcements`);
      return;
    }
    await server.post(channelId, duelPlanMessage(day, entry, now));
  }

  return {
    async tick() {
      try {
        await postToday();
      } catch (error) {
        deps.logError(`Posting the Duel Plan failed: ${errorMessage(error)}`);
      }
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
