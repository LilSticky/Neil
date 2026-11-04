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
 * The Preferences message after a Link, as the Interview asks for it: records every request that was answered. After
 * `failWith`, every request rejects, as a refused post would; nothing is recorded then, which models the prompt not
 * being opened.
 */
export class FakePreferencesAfterLink implements PreferencesAfterLink {
  readonly posted: PostedAfterLink[] = [];
  private failure: Error | undefined = undefined;

  /** Every call in the order made, under the name of the method; a test may share one trace with other fakes. */
  constructor(readonly trace: string[] = []) {}

  failWith(error: Error): void {
    this.failure = error;
  }

  postAfterLink(memberId: MemberId, threadId: string, player: Player, rank: RankOnLink): Promise<void> {
    this.trace.push("preferences.postAfterLink");
    if (this.failure !== undefined) return Promise.reject(this.failure);
    this.posted.push({ memberId, threadId, player, rank });
    return Promise.resolve();
  }
}
