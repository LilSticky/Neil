import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type APIActionRowComponent,
  type APIAllowedMentions,
  type APIButtonComponentWithCustomId,
  type APIStringSelectComponent,
  type APISelectMenuOption,
} from "discord.js";
import {
  EXPERIENCES,
  GAME_LANGUAGES,
  INTERESTS,
  PREFERENCE_STEPS,
  REGIONS,
  interestOptions,
  nextStep,
  preselectedLanguage,
  previousStep,
  type ExperienceKey,
  type GameLanguageCode,
  type InterestKey,
  type PreferenceStep,
  type Preferences,
} from "../domain/preferences.js";
import type { AllianceRank } from "../domain/player.js";
import type { MemberId } from "../domain/rank-approval.js";
import { somethingWentWrongReply, type Message, type PrivateReply } from "./interview-texts.js";

/** The questions of the Preferences messages: a select menu each for the four steps, and the Done button. */
const PREFERENCE_QUESTIONS = ["languages", "region", "interests", "experience", "done"] as const;
/** One of the Preferences message's questions. */
export type PreferenceQuestion = (typeof PREFERENCE_QUESTIONS)[number];

/** A Preference step message: its select menu, then its buttons. */
export interface PreferencesMessage extends Message {
  readonly components: APIActionRowComponent<APIStringSelectComponent | APIButtonComponentWithCustomId>[];
}

/** The custom id prefix of every component on the Preferences message. */
export const PREFERENCES_PREFIX = "pref:";

const PREFERENCES_CUSTOM_ID = /^pref:([a-z]+):(\d{17,20})$/;

const GUIDES_FORUM_NAME = "the guides forum";

function noMentions(): APIAllowedMentions {
  return { parse: [] };
}

/** Joins the non-empty parts with single spaces. */
function sentences(...parts: readonly string[]): string {
  return parts.filter((part) => part !== "").join(" ");
}

function asPreferenceQuestion(text: string): PreferenceQuestion | undefined {
  return PREFERENCE_QUESTIONS.find((question) => question === text);
}

/** The custom id of a Preferences component: pref:{question}:{memberId}. */
export function preferencesCustomId(question: PreferenceQuestion, memberId: MemberId): string {
  return `${PREFERENCES_PREFIX}${question}:${memberId}`;
}

/** Reads a Preferences custom id; undefined when it is not one, or its Member ID is not a Discord ID. */
export function parsePreferencesCustomId(
  customId: string,
): { readonly question: PreferenceQuestion; readonly memberId: MemberId } | undefined {
  const match = PREFERENCES_CUSTOM_ID.exec(customId);
  if (match === null) return undefined;
  const question = asPreferenceQuestion(match[1] ?? "");
  const memberId = match[2] ?? "";
  if (question === undefined) return undefined;
  return { question, memberId };
}

/** The private reply to /channels for a Member who is not Linked yet. */
export function notLinkedReply(): PrivateReply {
  return {
    content: "Please finish onboarding first, then run /channels again.",
    flags: MessageFlags.Ephemeral,
    allowedMentions: noMentions(),
  };
}

/** The private reply to a press on the Preferences message by a Member it does not belong to. */
export function notYoursReply(): PrivateReply {
  return {
    content: "These choices belong to another Member.",
    flags: MessageFlags.Ephemeral,
    allowedMentions: noMentions(),
  };
}

/** The private reply to a press on the Preferences message that could not be read or saved: the same wording as the Interview's. */
export function preferencesFailedReply(): PrivateReply {
  return somethingWentWrongReply();
}

/** The message that replaces the last step once Done is pressed: a saved text, with no menus left. */
export interface SavedMessage extends Message {
  readonly components: never[];
}

/** The private message to a Member after an Officer Link: their Preferences are chosen with /channels. */
export function officerLinkPreferencesMessage(): Message {
  return {
    content: "You are Linked now. Run /channels to choose the channels you want to see.",
    allowedMentions: noMentions(),
  };
}

/** The private refusal to a known Guest on /channels, or on a select menu press: no mentions, and nothing is changed. */
export function guestChannelsReply(): PrivateReply {
  return {
    content: "Channel choices are for Home Kingdom Members. As a Guest, you see the Guest area.",
    flags: MessageFlags.Ephemeral,
    allowedMentions: noMentions(),
  };
}

/** The guides line for a Member's Experience: Veteran is invited to write guides, New to read them; none otherwise. */
export function guidesLine(experience: ExperienceKey | undefined, guidesForumId: string | undefined): string | undefined {
  const forum = guidesForumId === undefined ? GUIDES_FORUM_NAME : `<#${guidesForumId}>`;
  if (experience === "veteran") return `Since you're a Veteran, please write guides in ${forum}.`;
  if (experience === "new") return `New to the game? Read the guides in ${forum}.`;
  return undefined;
}

/** Whether nothing at all is stored in the Preferences, so the Player's language may be preselected. */
export function hasNoPreferences(preferences: Preferences): boolean {
  return (
    preferences.languages.size === 0 &&
    preferences.region === undefined &&
    preferences.interests.size === 0 &&
    preferences.experience === undefined
  );
}

/** The Languages a menu shows as chosen: the stored ones, else the Player's language when nothing is stored. */
function shownLanguages(preferences: Preferences, playerLanguage: string | undefined): ReadonlySet<GameLanguageCode> {
  if (!hasNoPreferences(preferences)) return preferences.languages;
  const preselected = preselectedLanguage(playerLanguage);
  return new Set<GameLanguageCode>(preselected === undefined ? [] : [preselected.code]);
}

function selectMenu(
  question: PreferenceQuestion,
  memberId: MemberId,
  options: readonly APISelectMenuOption[],
  maxValues: number,
): APIActionRowComponent<APIStringSelectComponent> {
  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.StringSelect,
        custom_id: preferencesCustomId(question, memberId),
        options: [...options],
        min_values: 0,
        max_values: maxValues,
      },
    ],
  };
}

const PREFERENCE_GO_CUSTOM_ID = /^pref:go:([a-z]+):(\d{17,20})$/;

/** The custom id of a button that shows a step: pref:go:{step}:{memberId}. */
export function preferenceGoCustomId(step: PreferenceStep, memberId: MemberId): string {
  return `${PREFERENCES_PREFIX}go:${step}:${memberId}`;
}

/** Reads a step button's custom id; undefined when it is not one, or names no step. */
export function parsePreferenceGoCustomId(
  customId: string,
): { readonly step: PreferenceStep; readonly memberId: MemberId } | undefined {
  const match = PREFERENCE_GO_CUSTOM_ID.exec(customId);
  if (match === null) return undefined;
  const step = PREFERENCE_STEPS.find((candidate) => candidate === match[1]);
  if (step === undefined) return undefined;
  return { step, memberId: match[2] ?? "" };
}

/** What each Interest shows, as its menu option says it: at most 100 characters. */
const INTEREST_EXPLANATIONS: Readonly<Record<InterestKey, string>> = {
  pvp: "Fights: chat, voice, intel and tactics.",
  events: "Event chat, announcements, help and the guides forum.",
  recruitment: "Recruiting Players to our Alliances: a general channel and one for each Region.",
  "off-topic": "Off-topic chat and memes.",
  nap: "Closed talks on non-aggression pacts between Alliances.",
};

/** The heading and explanation of each step. */
const STEP_TEXTS: Readonly<Record<PreferenceStep, { readonly heading: string; readonly body: string }>> = {
  languages: {
    heading: "🗣️ **Step 1 of 4: Languages**",
    body:
      "A few quick questions, and the alliance hall will show you the channels that suit you. Each answer counts at once, and you can skip anything.\n" +
      "Which languages do you speak? Each one opens that language's chat.",
  },
  interests: {
    heading: "🎯 **Step 2 of 4: Interests**",
    body:
      "What brings you to the hall? Each Interest opens its channels.\n" +
      "PvP or Events also shows Alliance Duel and Kingdom vs Kingdom.",
  },
  region: {
    heading: "🌍 **Step 3 of 4: Region (optional)**",
    body: "Where do you play from? It gives you a role, so others can see your part of the world.",
  },
  experience: {
    heading: "📖 **Step 4 of 4: Experience (optional)**",
    body:
      "How well do you know the game? New Members are pointed to the guides, and Veterans are invited to write them.\n" +
      "Press Done when you're finished. You can change your answers any time with /channels.",
  },
};

/** The one menu of a step, showing the stored answers as chosen. */
function stepMenu(
  step: PreferenceStep,
  memberId: MemberId,
  languages: ReadonlySet<GameLanguageCode>,
  preferences: Preferences,
  rank: AllianceRank | undefined,
): APIActionRowComponent<APIStringSelectComponent> {
  switch (step) {
    case "languages":
      return selectMenu(
        step,
        memberId,
        GAME_LANGUAGES.map((language) => ({
          label: language.roleName,
          value: language.code,
          default: languages.has(language.code),
        })),
        GAME_LANGUAGES.length,
      );
    case "interests": {
      const interests = interestOptions(rank);
      return selectMenu(
        step,
        memberId,
        interests.map((interest) => ({
          label: interest.roleName,
          value: interest.key,
          description: INTEREST_EXPLANATIONS[interest.key],
          default: preferences.interests.has(interest.key),
        })),
        interests.length,
      );
    }
    case "region":
      return selectMenu(
        step,
        memberId,
        REGIONS.map((region) => ({
          label: region.roleName,
          value: region.key,
          default: preferences.region === region.key,
        })),
        1,
      );
    case "experience":
      return selectMenu(
        step,
        memberId,
        EXPERIENCES.map((experience) => ({
          label: experience.roleName,
          value: experience.key,
          default: preferences.experience === experience.key,
        })),
        1,
      );
  }
}

/** Whether the step's question has an answer, which turns its Skip button into Next. */
function isAnswered(step: PreferenceStep, languages: ReadonlySet<GameLanguageCode>, preferences: Preferences): boolean {
  switch (step) {
    case "languages":
      return languages.size > 0;
    case "interests":
      return preferences.interests.size > 0;
    case "region":
      return preferences.region !== undefined;
    case "experience":
      return preferences.experience !== undefined;
  }
}

function stepButton(label: string, style: ButtonStyle.Primary | ButtonStyle.Secondary, customId: string): APIButtonComponentWithCustomId {
  return { type: ComponentType.Button, style, label, custom_id: customId };
}

/** The buttons of a step: Back unless it is the first, then Skip or Next, or Done on the last. */
function stepButtons(step: PreferenceStep, memberId: MemberId, answered: boolean): APIButtonComponentWithCustomId[] {
  const before = previousStep(step);
  const after = nextStep(step);
  const back = before === undefined ? [] : [stepButton("Back", ButtonStyle.Secondary, preferenceGoCustomId(before, memberId))];
  const forward =
    after === undefined
      ? stepButton("Done", ButtonStyle.Primary, preferencesCustomId("done", memberId))
      : stepButton(answered ? "Next" : "Skip", ButtonStyle.Primary, preferenceGoCustomId(after, memberId));
  return [...back, forward];
}

/** One Preference step: its heading and explanation, one menu, and its buttons. Experience adds the guides line. */
export function preferenceStepMessage(options: {
  readonly memberId: MemberId;
  readonly step: PreferenceStep;
  readonly preferences: Preferences;
  readonly rank: AllianceRank | undefined;
  readonly playerLanguage: string | undefined;
  readonly guidesForumId: string | undefined;
}): PreferencesMessage {
  const { memberId, step, preferences, rank, playerLanguage, guidesForumId } = options;
  const languages = shownLanguages(preferences, playerLanguage);
  const { heading, body } = STEP_TEXTS[step];
  const guides = step === "experience" ? guidesLine(preferences.experience, guidesForumId) : undefined;
  return {
    content: [heading, body, ...(guides === undefined ? [] : [guides])].join("\n"),
    components: [
      stepMenu(step, memberId, languages, preferences, rank),
      {
        type: ComponentType.ActionRow,
        components: stepButtons(step, memberId, isAnswered(step, languages, preferences)),
      },
    ],
    allowedMentions: noMentions(),
  };
}

/** The message that replaces the last step when Done is pressed: what is saved, /channels, and the guides line. */
export function finishedMessage(experience: ExperienceKey | undefined, guidesForumId: string | undefined): SavedMessage {
  return {
    content: sentences(
      "✅ All set! Your choices are saved. Run /channels any time to change them.",
      guidesLine(experience, guidesForumId) ?? "",
    ),
    components: [],
    allowedMentions: noMentions(),
  };
}

/** The log line for a Preferences change: the Member, then each chosen answer after its name, parts separated by ·. */
export function preferencesLogLine(memberId: MemberId, preferences: Preferences): Message {
  const languageNames = [...preferences.languages].map(
    (code) => GAME_LANGUAGES.find((language) => language.code === code)?.roleName ?? code,
  );
  const parts: string[] = [];
  if (languageNames.length > 0) parts.push(`Languages ${languageNames.join(", ")}`);
  const region = REGIONS.find((candidate) => candidate.key === preferences.region);
  if (region !== undefined) parts.push(`Region ${region.roleName}`);
  const interestNames = INTERESTS.filter((interest) => preferences.interests.has(interest.key)).map(
    (interest) => interest.roleName,
  );
  if (interestNames.length > 0) parts.push(`Interests ${interestNames.join(", ")}`);
  const experience = EXPERIENCES.find((candidate) => candidate.key === preferences.experience);
  if (experience !== undefined) parts.push(`Experience ${experience.roleName}`);

  const chosen = parts.length === 0 ? "none" : parts.join(" · ");
  return { content: `<@${memberId}> Preferences: ${chosen}`, allowedMentions: noMentions() };
}
