import type { BaseMessageOptions } from "discord.js";
import type { MemberId } from "../../domain/rank-approval.js";

/** One private message a flow tried to send a Member. */
export interface PrivateMessageAttempt {
  readonly memberId: MemberId;
  readonly message: BaseMessageOptions;
}

/**
 * The private messages to Members, as a flow sends them by Discord DM: records every attempt, a refused one included.
 * After `refuseWith`, every attempt rejects, as Discord does for a Member who blocks private messages.
 */
export class FakePrivateMessages {
  readonly attempts: PrivateMessageAttempt[] = [];
  private failure: Error | undefined = undefined;

  refuseWith(error: Error): void {
    this.failure = error;
  }

  send(memberId: MemberId, message: BaseMessageOptions): Promise<void> {
    this.attempts.push({ memberId, message });
    return this.failure === undefined ? Promise.resolve() : Promise.reject(this.failure);
  }
}
