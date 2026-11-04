import { EMPTY_PREFERENCES, type InterestKey, type Preferences } from "../../domain/preferences.js";
import type { MemberId } from "../../domain/rank-approval.js";
import type { PreferencePrompt, PreferenceStore } from "../../storage/preference-store.js";

/**
 * The part of the Preference store the Preference Roles and the Preferences message use: Preferences a test sets, the
 * Interests the apply stores, the open prompts, and every forget recorded in order. As in the real store, a forget also
 * deletes the Member's open prompt. The store itself is tested in preference-store.test.ts.
 */
export class FakePreferenceStore implements Pick<PreferenceStore, "get" | "setInterests" | "forget" | "prompt"> {
  /** Every Member a forget was asked for, in order: a test checks the rows are deleted even when the server is not reached. */
  readonly forgotten: MemberId[] = [];
  private readonly stored = new Map<MemberId, Preferences>();
  private readonly prompts = new Map<MemberId, PreferencePrompt>();

  set(memberId: MemberId, preferences: Preferences): void {
    this.stored.set(memberId, preferences);
  }

  /** Records a Preferences message as open in the thread, posted at the given time. */
  openPrompt(memberId: MemberId, threadId: string, postedAt: Date): void {
    this.prompts.set(memberId, { threadId, postedAt });
  }

  prompt(memberId: MemberId): PreferencePrompt | undefined {
    return this.prompts.get(memberId);
  }

  get(memberId: MemberId): Preferences {
    return this.stored.get(memberId) ?? EMPTY_PREFERENCES;
  }

  setInterests(memberId: MemberId, interests: ReadonlySet<InterestKey>): void {
    this.set(memberId, { ...this.get(memberId), interests: new Set(interests) });
  }

  forget(memberId: MemberId): void {
    this.stored.delete(memberId);
    this.prompts.delete(memberId);
    this.forgotten.push(memberId);
  }
}
