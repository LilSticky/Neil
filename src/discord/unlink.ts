import type { BaseMessageOptions } from "discord.js";
import { handToOfficers, type MemberId, type RankApproval } from "../domain/rank-approval.js";
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

/** The private message to the Member; a refusal by Discord is expected (no shared server, DMs closed), so it is not logged. */
async function tellMember(deps: UnlinkDeps, memberId: MemberId): Promise<void> {
  try {
    await deps.sendPrivateMessage(memberId, unlinkedPrivateMessage());
  } catch {
    // Discord refused the private message; the Unlink stands and nothing is logged.
  }
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

/** Saves the Rank Approval with the Officers as approver, then posts in its thread; a thread that is gone is only logged. */
async function handOn(deps: UnlinkDeps, memberId: MemberId, approval: RankApproval): Promise<void> {
  const change = handToOfficers(approval);
  if (!change.ok) return;
  const handed = change.approval;
  // saveIfPending: an Officer may have approved meanwhile, and then the approval must stay as it is.
  const saved = attempt(deps, memberId, `handing Rank Approval ${approval.id.toString()} to the Officers`, () =>
    deps.links.saveIfPending(handed),
  );
  if (saved !== true) return;
  await attemptAsync(deps, memberId, `posting in the thread of Rank Approval ${approval.id.toString()}`, () =>
    deps.channels.post(handed.threadId, rankHandedToOfficersMessage(deps.officerRoles)),
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
