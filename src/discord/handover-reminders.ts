import {
  nextHoldingAlliance,
  nextRoyalCitySiege,
  sameTag,
  type CityRotationMode,
} from "../domain/city-rotation.js";
import { dueHandoverPosts, HANDOVER_POST_KINDS, type HandoverPostKind } from "../domain/handover.js";
import { allianceRoleName } from "../domain/managed-roles.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { CityRotationStore } from "../storage/city-rotation-store.js";
import type { HandoverStore } from "../storage/handover-store.js";
import type { EventInvitationServer } from "./events.js";
import {
  handoverReminderText,
  nextHolderAnnouncement,
  noLeaderLogLine,
  type HandoverAlliances,
  type HandoverReminderKind,
} from "./handover-texts.js";
import { textWithMentions } from "./mentions.js";

/** The role of an Alliance's leader. */
const R5_ROLE = "R5";

/** The part of the server the Handover Reminders use: role holders, #nap-leaders, #home-kingdom-announcements, posts and #neil-log. */
export interface HandoverServer extends Pick<EventInvitationServer, "holdersOf" | "post" | "log"> {
  /** #nap-leaders; undefined when the server has none. */
  napLeadersChannelId(): string | undefined;
  /** #home-kingdom-announcements, an announcement channel; undefined when the server has none. */
  kingdomAnnouncementsChannelId(): string | undefined;
}

export interface HandoverReminderDeps {
  readonly server: HandoverServer;
  readonly rotation: Pick<CityRotationStore, "load">;
  readonly handovers: Pick<HandoverStore, "handoverPosted" | "recordHandoverPosted">;
  readonly mode: CityRotationMode;
  readonly now: () => Date;
  readonly logError: (line: string) => void;
}

export interface HandoverReminders {
  /** Sends the Handover Reminders and the next-holder announcement now due. Nothing here throws. */
  tick(): Promise<void>;
}

const CHANNEL_NAMES: Readonly<Record<HandoverPostKind, string>> = {
  "reminder-24h": "#nap-leaders",
  "reminder-1h": "#nap-leaders",
  announcement: "#home-kingdom-announcements",
};

const POST_NAMES: Readonly<Record<HandoverPostKind, string>> = {
  "reminder-24h": "The 24-hour Handover Reminder",
  "reminder-1h": "The 1-hour Handover Reminder",
  announcement: "The next-holder announcement",
};

/**
 * Creates the Handover Reminders. Before each Friday Royal City siege in Rotation mode, a Handover Reminder goes to
 * #nap-leaders 24 hours and 1 hour before, mentioning the R5s of the outgoing Holding Alliance and of the receiving
 * Alliance, and the next-holder announcement goes to #home-kingdom-announcements with the first. Each post is recorded
 * before it is sent, so it goes out at most once per siege; a failed post is logged once and not retried. A post missed
 * while Neil was off goes out late before the siege; a 24-hour reminder overtaken by the 1-hour one is dropped.
 */
export function createHandoverReminders(deps: HandoverReminderDeps): HandoverReminders {
  const { server, handovers } = deps;

  /** The Alliances of the coming Handover; undefined when there is nothing to hand over. */
  function alliancesOfHandover(): HandoverAlliances | undefined {
    if (deps.mode !== "rotation") return undefined;
    const { order, holding } = deps.rotation.load();
    if (order === undefined || order.length === 0) return undefined;
    const outgoing = holding ?? order[0] ?? "";
    const receiving = nextHoldingAlliance({ order, holding: outgoing });
    return sameTag(outgoing, receiving) ? undefined : { outgoing, receiving };
  }

  /** The Members who hold R5 and the Alliance's role. */
  async function leadersOf(tag: string): Promise<MemberId[]> {
    const leaders = new Set(await server.holdersOf(R5_ROLE));
    return (await server.holdersOf(allianceRoleName(tag))).filter((memberId) => leaders.has(memberId));
  }

  async function postReminder(kind: HandoverReminderKind, alliances: HandoverAlliances, siege: Date): Promise<void> {
    const channelId = server.napLeadersChannelId();
    if (channelId === undefined) {
      deps.logError(`${POST_NAMES[kind]} was not posted: the server has no ${CHANNEL_NAMES[kind]}`);
      return;
    }
    const mentioned: MemberId[] = [];
    for (const tag of [alliances.outgoing, alliances.receiving]) {
      const leaders = await leadersOf(tag);
      if (leaders.length === 0) await server.log(noLeaderLogLine(kind, tag));
      mentioned.push(...leaders.filter((memberId) => !mentioned.includes(memberId)));
    }
    for (const message of textWithMentions(handoverReminderText(kind, alliances, siege), mentioned)) {
      await server.post(channelId, message);
    }
  }

  async function postAnnouncement(alliances: HandoverAlliances, siege: Date): Promise<void> {
    const channelId = server.kingdomAnnouncementsChannelId();
    if (channelId === undefined) {
      deps.logError(`${POST_NAMES.announcement} was not posted: the server has no ${CHANNEL_NAMES.announcement}`);
      return;
    }
    await server.post(channelId, nextHolderAnnouncement(alliances, siege));
  }

  async function postDue(): Promise<void> {
    const alliances = alliancesOfHandover();
    if (alliances === undefined) return;
    const now = deps.now();
    const siege = nextRoyalCitySiege(now);
    const sent = new Set(HANDOVER_POST_KINDS.filter((kind) => handovers.handoverPosted(siege, kind)));
    const due = dueHandoverPosts(siege, sent, now);
    for (const kind of due.drop) handovers.recordHandoverPosted(siege, kind, now);
    for (const kind of due.post) {
      handovers.recordHandoverPosted(siege, kind, now);
      try {
        if (kind === "announcement") await postAnnouncement(alliances, siege);
        else await postReminder(kind, alliances, siege);
      } catch (error) {
        deps.logError(`${POST_NAMES[kind]} failed: ${errorMessage(error)}`);
      }
    }
  }

  return {
    async tick() {
      try {
        await postDue();
      } catch (error) {
        deps.logError(`Posting the Handover Reminders failed: ${errorMessage(error)}`);
      }
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
