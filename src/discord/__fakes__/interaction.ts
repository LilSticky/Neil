import type { PingInteraction, PingReplyOptions } from "../ping.js";

/** A ping interaction that records its replies, optionally failing them. */
export class FakePingInteraction implements PingInteraction {
  readonly replies: PingReplyOptions[] = [];

  constructor(
    readonly createdTimestamp: number,
    private readonly failWith?: Error,
  ) {}

  reply(options: PingReplyOptions): Promise<void> {
    if (this.failWith !== undefined) return Promise.reject(this.failWith);
    this.replies.push(options);
    return Promise.resolve();
  }
}
