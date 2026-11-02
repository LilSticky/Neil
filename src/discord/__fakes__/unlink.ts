import type { MemberId } from "../../domain/rank-approval.js";
import type { LinkStore } from "../../storage/link-store.js";
import type { Unlink, UnlinkedMember } from "../unlink.js";
import type { UnlinkReason } from "../unlink-texts.js";

/** One call to unlink: the Member and the reason given. */
export interface UnlinkCall {
  readonly memberId: MemberId;
  readonly reason: UnlinkReason;
}

/**
 * The Unlink as the wiring reaches it: records every call. Given the LinkStore, it also ends the Member's Link there, as
 * the real Unlink does, so a test can see what a later join finds. `onCall` runs before the Link is ended, so a test can
 * read the state the wiring has reached when Unlink is called. The Unlink itself is tested in unlink.test.ts.
 */
export class FakeUnlink implements Unlink {
  readonly calls: UnlinkCall[] = [];
  onCall: ((call: UnlinkCall) => void) | undefined = undefined;

  constructor(private readonly links?: LinkStore) {}

  unlink(member: UnlinkedMember, reason: UnlinkReason): Promise<void> {
    const call: UnlinkCall = { memberId: member.id, reason };
    this.calls.push(call);
    this.onCall?.(call);
    this.links?.unlink(member.id);
    return Promise.resolve();
  }
}
