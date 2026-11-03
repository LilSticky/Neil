import { DiscordAPIError, RESTJSONErrorCodes, type BaseMessageOptions } from "discord.js";
import type { MemberId, RankApproval } from "../domain/rank-approval.js";
import type { AppliedStore } from "../storage/applied-store.js";
import type { LinkStore } from "../storage/link-store.js";
import type { OfficerRoles } from "./interview-texts.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import {
  rankHandedToOfficersMessage,
  unlinkedLogLine,
  unlinkedPrivateMessage,
  type UnlinkReason,
} from "./unlink-texts.js";

/** A Member as an Unlink needs them: the id, to find their Link and its applied state. */
export interface UnlinkedMember {
  readonly id: MemberId;
}

/** The Unlink entry point the Discord client and the startup and Daily Sync checks route to. It never throws. */
export interface Unlink {
  unlink(member: UnlinkedMember, reason: UnlinkReason): Promise<void>;
}

/** Everything an Unlink reads and writes, injected so that tests run without Discord. */
export interface UnlinkDeps {
  readonly links: LinkStore;
  readonly applied: AppliedStore;
  readonly channels: Pick<OnboardingChannels, "log" | "post">;
  readonly sendPrivateMessage: (memberId: MemberId, message: BaseMessageOptions) => Promise<void>;
  readonly officerRoles: OfficerRoles;
  readonly logError: (line: string) => void;
}

export function createUnlink(deps: UnlinkDeps): Unlink {
  return { unlink: (member, reason) => unlinkMember(deps, member.id, reason) };
}

/**
 * Ends a Member's Link: reads the nickname Neil gave them, removes the Link and its applied state, then logs, tells the
 * Member privately, and hands on the Rank Approvals they were to approve. Each step is guarded, so a failure is logged
 * and the next step still runs.
 */
async function unlinkMember(deps: UnlinkDeps, memberId: MemberId, reason: UnlinkReason): Promise<void> {
  const nickname = attempt(deps, memberId, "reading the nickname", () => deps.applied.get(memberId)?.nickname);
  const removed = attempt(deps, memberId, "ending the Link", () => deps.links.unlink(memberId));
  if (removed !== undefined) {
    await attemptAsync(deps, memberId, "logging the Unlink", () =>
      deps.channels.log(unlinkedLogLine(memberId, removed.uid, nickname, reason)),
    );
    await tellMember(deps, memberId);
  }
  await handOnRankApprovals(deps, memberId);
}

/** The private message to the Member. Discord refuses it when the Member cannot be messaged: expected, so not logged. */
async function tellMember(deps: UnlinkDeps, memberId: MemberId): Promise<void> {
  try {
    await deps.sendPrivateMessage(memberId, unlinkedPrivateMessage());
  } catch (error) {
    if (isCannotBeMessaged(error)) return;
    deps.logError(failureLine(memberId, "telling the Member", error));
  }
}

/** Discord's refusal to send a private message to a user who cannot be messaged (no shared server, DMs closed). */
function isCannotBeMessaged(error: unknown): boolean {
  return error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.CannotSendMessagesToThisUser;
}

/** Hands each pending Rank Approval the Member was to approve to the Officers, one at a time. */
async function handOnRankApprovals(deps: UnlinkDeps, memberId: MemberId): Promise<void> {
  const pending = attempt(deps, memberId, "listing the Rank Approvals waiting on the Member", () =>
    deps.links.pendingApprovedBy(memberId),
  );
  for (const approval of pending ?? []) {
    await handOn(deps, memberId, approval);
  }
}

/**
 * Hands the Rank Approval to the Officers, then posts in its thread; a thread that is gone is only logged. The post
 * follows only when this Unlink made the change: an Officer may have approved meanwhile, or another Unlink of the
 * Member may have handed it on already.
 */
async function handOn(deps: UnlinkDeps, memberId: MemberId, approval: RankApproval): Promise<void> {
  const handed = attempt(deps, memberId, `handing Rank Approval ${approval.id.toString()} to the Officers`, () =>
    deps.links.handToOfficers(approval.id, memberId),
  );
  if (handed !== true) return;
  await attemptAsync(deps, memberId, `posting in the thread of Rank Approval ${approval.id.toString()}`, () =>
    deps.channels.post(approval.threadId, rankHandedToOfficersMessage(deps.officerRoles)),
  );
}

/** Runs one synchronous step; a failure is logged and gives undefined, so the next step still runs. */
function attempt<T>(deps: UnlinkDeps, memberId: MemberId, step: string, work: () => T): T | undefined {
  try {
    return work();
  } catch (error) {
    deps.logError(failureLine(memberId, step, error));
    return undefined;
  }
}

/** Runs one asynchronous step; a failure is logged and the Unlink goes on. */
async function attemptAsync(
  deps: UnlinkDeps,
  memberId: MemberId,
  step: string,
  work: () => Promise<unknown>,
): Promise<void> {
  try {
    await work();
  } catch (error) {
    deps.logError(failureLine(memberId, step, error));
  }
}

function failureLine(memberId: MemberId, step: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : "unknown error";
  return `Unlink of ${memberId} failed while ${step}: ${reason}`;
}
