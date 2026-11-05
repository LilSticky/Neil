/** A Member's presence in the server, as Discord reports it. */
export type PresenceStatus = "online" | "idle" | "dnd" | "offline";

/** A Member came online when they were offline, or had no presence yet, and now are not offline. */
export function cameOnline(before: PresenceStatus | undefined, after: PresenceStatus): boolean {
  return (before === undefined || before === "offline") && after !== "offline";
}

/** The facts about a Member that decide whether Neil starts an Interview for them. */
export interface InterviewWish {
  readonly bot: boolean;
  readonly linked: boolean;
  readonly open: boolean;
  readonly handedOff: boolean;
}

/** A Member wants an Interview when they are not a bot, not Linked, have no open Interview and were not handed off. */
export function wantsInterview(wish: InterviewWish): boolean {
  return !wish.bot && !wish.linked && !wish.open && !wish.handedOff;
}
