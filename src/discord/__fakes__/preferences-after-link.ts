import type { RankOnLink } from "../../domain/link.js";
import type { Player } from "../../domain/player.js";
import type { MemberId } from "../../domain/rank-approval.js";
import type { PreferencesAfterLink } from "../preferences-after-link.js";

/** One Preferences message the Interview asked for after a Link. */
export interface PostedAfterLink {
  readonly memberId: MemberId;
  readonly threadId: string;
  readonly player: Player;
  readonly rank: RankOnLink;
}

/**
 * The Preferences message after a Link, as the Interview asks for it: records every request that was answered. A request
 * answers true and is recorded in `posted`, or, after `declineAll`, answers false and is recorded in `declined` (a Player
 * outside the Home Kingdom, for which nothing is posted). After `failWith`, every request rejects, as a refused post
 * would; nothing is recorded then, which models the prompt not being opened.
 */
export class FakePreferencesAfterLink implements PreferencesAfterLink {
  readonly posted: PostedAfterLink[] = [];
  readonly declined: PostedAfterLink[] = [];
  private failure: Error | undefined = undefined;
  private declining = false;

  /** Every call in the order made, under the name of the method; a test may share one trace with other fakes. */
  constructor(readonly trace: string[] = []) {}

  failWith(error: Error): void {
    this.failure = error;
  }

  /** Every later request answers false: nothing is posted, as for a Player outside the Home Kingdom. */
  declineAll(): void {
    this.declining = true;
  }

  postAfterLink(memberId: MemberId, threadId: string, player: Player, rank: RankOnLink): Promise<boolean> {
    this.trace.push("preferences.postAfterLink");
    if (this.failure !== undefined) return Promise.reject(this.failure);
    const request: PostedAfterLink = { memberId, threadId, player, rank };
    if (this.declining) {
      this.declined.push(request);
      return Promise.resolve(false);
    }
    this.posted.push(request);
    return Promise.resolve(true);
  }
}
