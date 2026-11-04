import type { BaseMessageOptions } from "discord.js";
import type { RankOnLink } from "../domain/link.js";
import {
  EXPERIENCES,
  GAME_LANGUAGES,
  REGIONS,
  allianceRankOf,
  interestOptions,
  type ExperienceKey,
  type GameLanguageCode,
  type InterestKey,
  type Preferences,
  type RegionKey,
} from "../domain/preferences.js";
import type { AllianceRank } from "../domain/player.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { LinkStore } from "../storage/link-store.js";
import type { PreferenceStore } from "../storage/preference-store.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import type { PreferenceRoles } from "./preferences.js";
import type { PrivateReply } from "./interview-texts.js";
import {
  notLinkedReply,
  notYoursReply,
  parsePreferencesCustomId,
  preferencesLogLine,
  preferencesMessage,
  savedMessage,
  type PreferenceQuestion,
} from "./preferences-texts.js";

/** What the Preferences message's presses need: the stores, the Preference Roles, the log, and the guides forum. */
export interface PreferenceChoicesDeps {
  readonly roles: Pick<PreferenceRoles, "apply">;
  readonly preferences: Pick<
    PreferenceStore,
    "get" | "setLanguages" | "setRegion" | "setInterests" | "setExperience" | "prompt" | "closePrompt"
  >;
  readonly links: Pick<LinkStore, "linkFor">;
  readonly rankApprovals: Pick<LinkStore, "pendingFor">;
  readonly channels: Pick<OnboardingChannels, "log" | "deleteThread">;
  readonly guidesForumId: string | undefined;
  readonly logError: (line: string) => void;
}

/** The part of a discord.js select menu or button press that the Preferences message uses. */
export interface PreferencePress {
  readonly customId: string;
  readonly user: { readonly id: MemberId };
  /** What a select menu press picked, as option values; absent for the Done button. */
  readonly values?: readonly string[] | undefined;
  reply(message: PrivateReply): Promise<void>;
  update(options: BaseMessageOptions): Promise<void>;
}

/** Handles the presses on a Preferences message. */
export interface PreferenceChoices {
  /** Answers a press and makes its change. Never throws: a failure is logged. */
  press(press: PreferencePress): Promise<void>;
}

/** Builds the handler of the Preferences message's presses. */
export function createPreferenceChoices(deps: PreferenceChoicesDeps): PreferenceChoices {
  return {
    async press(press) {
      try {
        await handlePress(deps, press);
      } catch (error) {
        deps.logError(`A Preferences press by ${press.user.id} failed: ${reasonOf(error)}`);
      }
    },
  };
}

async function handlePress(deps: PreferenceChoicesDeps, press: PreferencePress): Promise<void> {
  const parsed = parsePreferencesCustomId(press.customId);
  if (parsed === undefined) {
    deps.logError(`A Preferences press with an unknown custom id by ${press.user.id} was ignored`);
    return;
  }
  const { question, memberId } = parsed;
  if (memberId !== press.user.id) {
    await press.reply(notYoursReply());
    return;
  }
  const link = deps.links.linkFor(memberId);
  if (link === undefined) {
    await press.reply(notLinkedReply());
    return;
  }
  if (question === "done") {
    await finish(deps, press, memberId);
    return;
  }
  await change(deps, press, { memberId, rank: link.allianceRank, question });
}

/** Done: the message is answered first, then the prompt closes and its thread goes, unless a Rank Approval waits. */
async function finish(deps: PreferenceChoicesDeps, press: PreferencePress, memberId: MemberId): Promise<void> {
  await press.update(savedMessage());
  const prompt = deps.preferences.prompt(memberId);
  if (prompt === undefined) return;
  deps.preferences.closePrompt(memberId);
  if (deps.rankApprovals.pendingFor(memberId) !== undefined) return;
  await deps.channels.deleteThread(prompt.threadId);
}

/** A select change: saves the answer, answers the press with the new Preferences, then applies the roles and logs. */
async function change(
  deps: PreferenceChoicesDeps,
  press: PreferencePress,
  target: { readonly memberId: MemberId; readonly rank: RankOnLink; readonly question: SelectQuestion },
): Promise<void> {
  const { memberId, rank, question } = target;
  const values = press.values ?? [];
  const alliance = allianceRankOf(rank);
  switch (question) {
    case "languages":
      deps.preferences.setLanguages(memberId, languagesPicked(values));
      break;
    case "region":
      deps.preferences.setRegion(memberId, regionPicked(values));
      break;
    case "interests":
      deps.preferences.setInterests(memberId, interestsPicked(values, alliance));
      break;
    case "experience":
      deps.preferences.setExperience(memberId, experiencePicked(values));
      break;
  }
  const preferences: Preferences = deps.preferences.get(memberId);
  await press.update(
    preferencesMessage({
      memberId,
      preferences,
      rank: alliance,
      playerLanguage: undefined,
      guidesForumId: deps.guidesForumId,
    }),
  );
  await deps.roles.apply(memberId, rank);
  await deps.channels.log(preferencesLogLine(memberId, preferences));
}

/** The questions a select menu of the Preferences message answers: every question but Done. */
type SelectQuestion = Exclude<PreferenceQuestion, "done">;

function languagesPicked(values: readonly string[]): ReadonlySet<GameLanguageCode> {
  return new Set(GAME_LANGUAGES.map((language) => language.code).filter((code) => values.includes(code)));
}

function regionPicked(values: readonly string[]): RegionKey | undefined {
  return REGIONS.find((region) => values.includes(region.key))?.key;
}

function interestsPicked(values: readonly string[], rank: AllianceRank | undefined): ReadonlySet<InterestKey> {
  return new Set(
    interestOptions(rank)
      .map((interest) => interest.key)
      .filter((key) => values.includes(key)),
  );
}

function experiencePicked(values: readonly string[]): ExperienceKey | undefined {
  return EXPERIENCES.find((experience) => values.includes(experience.key))?.key;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
