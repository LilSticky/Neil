import type { RankOnLink } from "../domain/link.js";
import { allianceRankOf, preselectedLanguage } from "../domain/preferences.js";
import type { Player } from "../domain/player.js";
import type { KingdomNumber } from "../domain/lookup-input.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { PreferenceStore } from "../storage/preference-store.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import { hasNoPreferences, preferenceStepMessage } from "./preferences-texts.js";

/**
 * The Languages step the Interview posts in the thread after a Link. Resolves true when it is posted; false, with
 * nothing posted or stored, for a Player outside the Home Kingdom. Rejects when the message cannot be posted.
 */
export interface PreferencesAfterLink {
  postAfterLink(memberId: MemberId, threadId: string, player: Player, rank: RankOnLink): Promise<boolean>;
}

export interface PreferencesAfterLinkDeps {
  readonly preferences: PreferenceStore;
  readonly channels: Pick<OnboardingChannels, "post">;
  readonly guidesForumId: string | undefined;
  readonly homeKingdom: KingdomNumber;
  readonly now: () => Date;
}

export function createPreferencesAfterLink(deps: PreferencesAfterLinkDeps): PreferencesAfterLink {
  return {
    async postAfterLink(memberId, threadId, player, rank) {
      // A Guest is not offered Preferences: nothing is posted, stored or opened.
      if (player.kingdom !== deps.homeKingdom) return false;
      const playerLanguage = player.details?.language;
      // A Member with no Preferences yet gets the Player's game Language stored first, so that it shows preselected.
      if (hasNoPreferences(deps.preferences.get(memberId))) {
        const preselected = preselectedLanguage(playerLanguage);
        if (preselected !== undefined) deps.preferences.setLanguages(memberId, new Set([preselected.code]));
      }
      await deps.channels.post(
        threadId,
        preferenceStepMessage({
          memberId,
          step: "languages",
          preferences: deps.preferences.get(memberId),
          rank: allianceRankOf(rank),
          playerLanguage,
          guidesForumId: deps.guidesForumId,
        }),
      );
      deps.preferences.openPrompt(memberId, threadId, deps.now());
      return true;
    },
  };
}
