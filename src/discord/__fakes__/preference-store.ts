import { EMPTY_PREFERENCES, type InterestKey, type Preferences } from "../../domain/preferences.js";
import type { MemberId } from "../../domain/rank-approval.js";
import type { PreferenceStore } from "../../storage/preference-store.js";

/**
 * The part of the Preference store the Preference Roles use: Preferences a test sets, the Interests the apply stores, and
 * every forget recorded in order. The store itself is tested in preference-store.test.ts.
 */
export class FakePreferenceStore implements Pick<PreferenceStore, "get" | "setInterests" | "forget"> {
  /** Every Member a forget was asked for, in order: a test checks the rows are deleted even when the server is not reached. */
  readonly forgotten: MemberId[] = [];
  private readonly stored = new Map<MemberId, Preferences>();

  set(memberId: MemberId, preferences: Preferences): void {
    this.stored.set(memberId, preferences);
  }

  get(memberId: MemberId): Preferences {
    return this.stored.get(memberId) ?? EMPTY_PREFERENCES;
  }

  setInterests(memberId: MemberId, interests: ReadonlySet<InterestKey>): void {
    this.set(memberId, { ...this.get(memberId), interests: new Set(interests) });
  }

  forget(memberId: MemberId): void {
    this.stored.delete(memberId);
    this.forgotten.push(memberId);
  }
}
