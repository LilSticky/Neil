import type { RankOnLink } from "../domain/link.js";
import { allianceRankOf, preselectedLanguage } from "../domain/preferences.js";
import type { Player } from "../domain/player.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { PreferenceStore } from "../storage/preference-store.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import { hasNoPreferences, preferencesMessage } from "./preferences-texts.js";

/** The Preferences message the Interview posts in the thread after a Link. Rejects when the message cannot be posted. */
export interface PreferencesAfterLink {
  postAfterLink(memberId: MemberId, threadId: string, player: Player, rank: RankOnLink): Promise<void>;
}

export interface PreferencesAfterLinkDeps {
  readonly preferences: PreferenceStore;
  readonly channels: Pick<OnboardingChannels, "post">;
  readonly guidesForumId: string | undefined;
  readonly now: () => Date;
}

export function createPreferencesAfterLink(deps: PreferencesAfterLinkDeps): PreferencesAfterLink {
  return {
    async postAfterLink(memberId, threadId, player, rank) {
      const playerLanguage = player.details?.language;
      // A Member with no Preferences yet gets the Player's game Language stored first, so that it shows preselected.
      if (hasNoPreferences(deps.preferences.get(memberId))) {
        const preselected = preselectedLanguage(playerLanguage);
        if (preselected !== undefined) deps.preferences.setLanguages(memberId, new Set([preselected.code]));
      }
      await deps.channels.post(
        threadId,
        preferencesMessage({
          memberId,
          preferences: deps.preferences.get(memberId),
          rank: allianceRankOf(rank),
          playerLanguage,
          guidesForumId: deps.guidesForumId,
        }),
      );
      deps.preferences.openPrompt(memberId, threadId, deps.now());
    },
  };
}
