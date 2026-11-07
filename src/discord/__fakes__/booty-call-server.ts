import type { BaseMessageOptions } from "discord.js";
import type { PresenceStatus } from "../../domain/interview-start.js";
import type { MemberId } from "../../domain/rank-approval.js";
import type { BootyCallServer } from "../booty-call.js";
import type { CallTimeline } from "./booty-call-interaction.js";

/** One message a Booty Call posted to a channel, with the link Discord would give it. */
export interface PostedMessage {
  readonly channelId: string;
  readonly message: BaseMessageOptions;
  readonly link: string;
}

const GUILD_ID = "100000000000000000";

/**
 * The server as Booty Calls use it: who holds a role, the Discord presence of a Member, posts to a channel, and the
 * #neil-log lines. Nothing reaches Discord. A Member whose presence was never set reads as offline. A post that was
 * made to fail with `failNextPost` rejects once, and is not recorded as posted. A read of holders that was made to
 * fail with `failNextHoldersRead` rejects once. Each read of holders is written to the timeline given, if any.
 */
export class FakeBootyCallServer implements BootyCallServer {
  readonly posts: PostedMessage[] = [];
  readonly logs: string[] = [];
  private readonly roles = new Map<string, MemberId[]>();
  private readonly presences = new Map<MemberId, PresenceStatus>();
  private readonly timeline: CallTimeline;
  private postFailure: Error | undefined = undefined;
  private holdersFailure: Error | undefined = undefined;

  constructor(timeline: CallTimeline = []) {
    this.timeline = timeline;
  }

  /** The Member holds the role, by its name (such as `[NML]`). */
  grantRole(roleName: string, memberId: MemberId): void {
    this.roles.set(roleName, [...(this.roles.get(roleName) ?? []), memberId]);
  }

  /** The Member no longer holds the role, as when Discord takes it away after /booty. */
  revokeRole(roleName: string, memberId: MemberId): void {
    this.roles.set(roleName, (this.roles.get(roleName) ?? []).filter((holder) => holder !== memberId));
  }

  setPresence(memberId: MemberId, status: PresenceStatus): void {
    this.presences.set(memberId, status);
  }

  /** The next post rejects with the error, as Discord does when it refuses a message. */
  failNextPost(error: Error): void {
    this.postFailure = error;
  }

  /** The next read of a role's holders rejects with the error, as Discord does when it cannot answer. */
  failNextHoldersRead(error: Error): void {
    this.holdersFailure = error;
  }

  holdersOf(roleName: string): Promise<readonly MemberId[]> {
    this.timeline.push("holdersOf");
    if (this.holdersFailure !== undefined) {
      const failure = this.holdersFailure;
      this.holdersFailure = undefined;
      return Promise.reject(failure);
    }
    return Promise.resolve([...(this.roles.get(roleName) ?? [])]);
  }

  presenceOf(memberId: MemberId): Promise<PresenceStatus | undefined> {
    return Promise.resolve(this.presences.get(memberId) ?? "offline");
  }

  post(channelId: string, message: BaseMessageOptions): Promise<string> {
    if (this.postFailure !== undefined) {
      const failure = this.postFailure;
      this.postFailure = undefined;
      return Promise.reject(failure);
    }
    const link = `https://discord.com/channels/${GUILD_ID}/${channelId}/${(this.posts.length + 1).toString()}`;
    this.posts.push({ channelId, message, link });
    return Promise.resolve(link);
  }

  log(line: string): Promise<void> {
    this.logs.push(line);
    return Promise.resolve();
  }
}
