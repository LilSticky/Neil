import { MessageFlags, type BaseMessageOptions } from "discord.js";
import type { RankOnLink } from "../domain/link.js";
import {
  EXPERIENCES,
  GAME_LANGUAGES,
  REGIONS,
  allianceRankOf,
  interestOptions,
  isKnownGuest,
  type ExperienceKey,
  type GameLanguageCode,
  type InterestKey,
  type PreferenceStep,
  type Preferences,
  type RegionKey,
} from "../domain/preferences.js";
import type { KingdomNumber } from "../domain/lookup-input.js";
import type { AllianceRank } from "../domain/player.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { AppliedStore } from "../storage/applied-store.js";
import type { LinkStore } from "../storage/link-store.js";
import type { PreferenceStore } from "../storage/preference-store.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import type { OnboardingRole } from "./onboarding-role.js";
import type { PreferenceRoles } from "./preferences.js";
import type { PrivateReply } from "./interview-texts.js";
import {
  guestChannelsReply,
  notLinkedReply,
  notYoursReply,
  parsePreferenceGoCustomId,
  parsePreferencesCustomId,
  preferenceStepMessage,
  preferencesFailedReply,
  preferencesLogLine,
  finishedMessage,
  type PreferenceQuestion,
  type PreferencesMessage,
} from "./preferences-texts.js";

/** What the Preferences message's presses need: the stores, the Preference Roles, the log, the guides forum and the Home Kingdom. */
export interface PreferenceChoicesDeps {
  readonly roles: Pick<PreferenceRoles, "apply">;
  readonly preferences: Pick<
    PreferenceStore,
    "get" | "setLanguages" | "setRegion" | "setInterests" | "setExperience" | "prompt" | "closePrompt"
  >;
  readonly links: Pick<LinkStore, "linkFor">;
  readonly rankApprovals: Pick<LinkStore, "pendingFor">;
  readonly applied: Pick<AppliedStore, "get">;
  readonly homeKingdom: KingdomNumber;
  readonly channels: Pick<OnboardingChannels, "log" | "deleteThread">;
  /** Taken off just before the Done thread is deleted; a pending Rank Approval keeps the thread and the role. */
  readonly onboardingRole: Pick<OnboardingRole, "takeOff">;
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

/** The part of a discord.js /channels command that the choices use: who ran it, and the private reply. */
export interface ChannelsCommand {
  readonly user: { readonly id: MemberId };
  reply(message: PrivateReply): Promise<void>;
}

/** Handles the presses on a Preferences message, and the /channels command that shows one. */
export interface PreferenceChoices {
  /** Answers a press and makes its change. Never throws: a failure is logged, and answered privately when nothing was answered. */
  press(press: PreferencePress): Promise<void>;
  /** Answers /channels with the Member's Preferences message, or tells a Member who is not Linked to finish onboarding. Never throws. */
  showChannels(command: ChannelsCommand): Promise<void>;
}

/** Builds the handler of the Preferences message's presses and of /channels. */
export function createPreferenceChoices(deps: PreferenceChoicesDeps): PreferenceChoices {
  return {
    async press(press) {
      const tracked = trackAnswer(press);
      try {
        await handlePress(deps, tracked.press);
      } catch (error) {
        deps.logError(`A Preferences press by ${press.user.id} failed: ${reasonOf(error)}`);
        if (!tracked.answered()) await replyFailed(deps, press);
      }
    },
    async showChannels(command) {
      try {
        await answerChannels(deps, command);
      } catch (error) {
        deps.logError(`/channels by ${command.user.id} failed: ${reasonOf(error)}`);
      }
    },
  };
}

/** What a press on the Preferences message asks for. */
type PressAction =
  | { readonly kind: "done" }
  | { readonly kind: "show"; readonly step: PreferenceStep }
  | { readonly kind: "change"; readonly question: SelectQuestion };

/** Reads a press's custom id: whose Preferences it is and what it asks for; undefined when it is none of the Preferences message's. */
function targetOf(customId: string): { readonly memberId: MemberId; readonly action: PressAction } | undefined {
  const go = parsePreferenceGoCustomId(customId);
  if (go !== undefined) return { memberId: go.memberId, action: { kind: "show", step: go.step } };
  const select = parsePreferencesCustomId(customId);
  if (select === undefined) return undefined;
  if (select.question === "done") return { memberId: select.memberId, action: { kind: "done" } };
  return { memberId: select.memberId, action: { kind: "change", question: select.question } };
}

async function handlePress(deps: PreferenceChoicesDeps, press: PreferencePress): Promise<void> {
  const target = targetOf(press.customId);
  if (target === undefined) throw new Error(`the custom id ${press.customId} is not one of the Preferences message`);
  const { memberId, action } = target;
  if (memberId !== press.user.id) {
    await press.reply(notYoursReply());
    return;
  }
  const link = deps.links.linkFor(memberId);
  if (link === undefined) {
    await press.reply(notLinkedReply());
    return;
  }
  if (action.kind === "done") {
    await finish(deps, press, memberId);
    return;
  }
  if (isKnownGuest(deps.applied.get(memberId)?.roles, deps.homeKingdom)) {
    await press.reply(guestChannelsReply());
    return;
  }
  if (action.kind === "show") {
    await show(deps, press, { memberId, step: action.step, rank: link.allianceRank });
    return;
  }
  await change(deps, press, { memberId, rank: link.allianceRank, question: action.question });
}

/** A step button: shows that step from the stored answers. Nothing is saved, applied or logged. */
async function show(
  deps: PreferenceChoicesDeps,
  press: PreferencePress,
  target: { readonly memberId: MemberId; readonly step: PreferenceStep; readonly rank: RankOnLink },
): Promise<void> {
  const { memberId, step, rank } = target;
  const preferences = deps.preferences.get(memberId);
  await press.update(stepMessageFor(deps, memberId, step, preferences, allianceRankOf(rank)));
}

/** /channels: a Linked Member gets their Preferences message, privately, and nothing changes. */
async function answerChannels(deps: PreferenceChoicesDeps, command: ChannelsCommand): Promise<void> {
  const memberId = command.user.id;
  const link = deps.links.linkFor(memberId);
  if (link === undefined) {
    await command.reply(notLinkedReply());
    return;
  }
  if (isKnownGuest(deps.applied.get(memberId)?.roles, deps.homeKingdom)) {
    await command.reply(guestChannelsReply());
    return;
  }
  const message = stepMessageFor(deps, memberId, "languages", deps.preferences.get(memberId), allianceRankOf(link.allianceRank));
  await command.reply({ ...message, flags: MessageFlags.Ephemeral });
}

/**
 * Done: the message is answered first, then the thread goes, unless a Rank Approval waits, and only then the prompt closes:
 * a thread that cannot be deleted leaves the prompt open, so that the next sweep retries it. The Onboarding Role is taken
 * off just before the thread goes, since that closes the Interview.
 */
async function finish(deps: PreferenceChoicesDeps, press: PreferencePress, memberId: MemberId): Promise<void> {
  await press.update(finishedMessage(deps.preferences.get(memberId).experience, deps.guidesForumId));
  const prompt = deps.preferences.prompt(memberId);
  if (prompt === undefined) return;
  if (deps.rankApprovals.pendingFor(memberId) === undefined) {
    await deps.onboardingRole.takeOff(memberId);
    await deps.channels.deleteThread(prompt.threadId);
  }
  deps.preferences.closePrompt(memberId);
}

/** The press as the handler sees it, and whether it has been answered: a reply or an update, once made, counts. */
function trackAnswer(press: PreferencePress): { readonly press: PreferencePress; answered(): boolean } {
  let answered = false;
  return {
    press: {
      customId: press.customId,
      user: press.user,
      values: press.values,
      reply: (message) => {
        answered = true;
        return press.reply(message);
      },
      update: (options) => {
        answered = true;
        return press.update(options);
      },
    },
    answered: () => answered,
  };
}

/** A press that failed before it was answered gets a private error, so that Discord does not show it as failed. */
async function replyFailed(deps: PreferenceChoicesDeps, press: PreferencePress): Promise<void> {
  try {
    await press.reply(preferencesFailedReply());
  } catch (error) {
    deps.logError(`Answering a failed Preferences press by ${press.user.id} failed: ${reasonOf(error)}`);
  }
}

/** A select change: saves the answer, re-renders the same step with the new Preferences, then applies the roles and logs. */
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
  await press.update(stepMessageFor(deps, memberId, question, preferences, alliance));
  await deps.roles.apply(memberId);
  await deps.channels.log(preferencesLogLine(memberId, preferences));
}

/** One step of the Preferences, as the presses and /channels show it; the Member's playing language is not looked up here. */
function stepMessageFor(
  deps: PreferenceChoicesDeps,
  memberId: MemberId,
  step: PreferenceStep,
  preferences: Preferences,
  rank: AllianceRank | undefined,
): PreferencesMessage {
  return preferenceStepMessage({
    memberId,
    step,
    preferences,
    rank,
    playerLanguage: undefined,
    guidesForumId: deps.guidesForumId,
  });
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
