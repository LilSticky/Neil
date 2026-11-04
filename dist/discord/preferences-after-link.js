import { allianceRankOf, preselectedLanguage } from "../domain/preferences.js";
import { hasNoPreferences, preferencesMessage } from "./preferences-texts.js";
export function createPreferencesAfterLink(deps) {
    return {
        async postAfterLink(memberId, threadId, player, rank) {
            const playerLanguage = player.details?.language;
            // A Member with no Preferences yet gets the Player's game Language stored first, so that it shows preselected.
            if (hasNoPreferences(deps.preferences.get(memberId))) {
                const preselected = preselectedLanguage(playerLanguage);
                if (preselected !== undefined)
                    deps.preferences.setLanguages(memberId, new Set([preselected.code]));
            }
            await deps.channels.post(threadId, preferencesMessage({
                memberId,
                preferences: deps.preferences.get(memberId),
                rank: allianceRankOf(rank),
                playerLanguage,
                guidesForumId: deps.guidesForumId,
            }));
            deps.preferences.openPrompt(memberId, threadId, deps.now());
        },
    };
}
//# sourceMappingURL=preferences-after-link.js.map