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
  REGIONS,
  interestOptions,
  preselectedLanguage,
  type ExperienceKey,
  type GameLanguageCode,
  type Preferences,
} from "../domain/preferences.js";
import type { AllianceRank } from "../domain/player.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { Message, PrivateReply } from "./interview-texts.js";

/** The questions of the Preferences message: one select menu each, and the Done button. */
const PREFERENCE_QUESTIONS = ["languages", "region", "interests", "experience", "done"] as const;
/** One of the Preferences message's questions. */
export type PreferenceQuestion = (typeof PREFERENCE_QUESTIONS)[number];

/** The Preferences message: four select menus, then the Done button. */
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

/** The Preferences message once Done is pressed: a saved text, with no menus left. */
export interface SavedMessage extends Message {
  readonly components: never[];
}

/** The message that replaces the Preferences message when Done is pressed. */
export function savedMessage(): SavedMessage {
  return {
    content: "Your choices are saved. Run /channels any time to change them.",
    components: [],
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

/** The Preferences message: a menu for Languages, Region, Interests and Experience, then Done, with the guides line. */
export function preferencesMessage(options: {
  readonly memberId: MemberId;
  readonly preferences: Preferences;
  readonly rank: AllianceRank | undefined;
  readonly playerLanguage: string | undefined;
  readonly guidesForumId: string | undefined;
}): PreferencesMessage {
  const { memberId, preferences, rank, playerLanguage, guidesForumId } = options;
  const languages = shownLanguages(preferences, playerLanguage);
  const interests = interestOptions(rank);
  const guides = guidesLine(preferences.experience, guidesForumId);
  const intro = "Choose what you play and what you're here for. Each choice gives its role at once; press Done when you're finished.";

  return {
    content: sentences(intro, guides ?? ""),
    components: [
      selectMenu(
        "languages",
        memberId,
        GAME_LANGUAGES.map((language) => ({
          label: language.roleName,
          value: language.code,
          default: languages.has(language.code),
        })),
        GAME_LANGUAGES.length,
      ),
      selectMenu(
        "region",
        memberId,
        REGIONS.map((region) => ({
          label: region.roleName,
          value: region.key,
          default: preferences.region === region.key,
        })),
        1,
      ),
      selectMenu(
        "interests",
        memberId,
        interests.map((interest) => ({
          label: interest.roleName,
          value: interest.key,
          default: preferences.interests.has(interest.key),
        })),
        interests.length,
      ),
      selectMenu(
        "experience",
        memberId,
        EXPERIENCES.map((experience) => ({
          label: experience.roleName,
          value: experience.key,
          default: preferences.experience === experience.key,
        })),
        1,
      ),
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Primary,
            label: "Done",
            custom_id: preferencesCustomId("done", memberId),
          },
        ],
      },
    ],
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
