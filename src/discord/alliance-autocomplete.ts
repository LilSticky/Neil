import { matchAlliances, normalise, type KnownAlliance } from "../domain/alliance-match.js";

/** Discord shows at most 25 choices. */
const MAX_CHOICES = 25;
/** Discord takes at most 100 characters of a choice's label and of its value. */
const MAX_CHOICE_TEXT = 100;

/** One choice an autocomplete answer offers: the label Discord shows and the value the command receives. */
export interface AutocompleteChoice {
  readonly name: string;
  readonly value: string;
}

/** The option the Member is typing in, as discord.js reports it with getFocused(true). */
export interface FocusedOption {
  readonly name: string;
  readonly value: string | number;
}

/** The part of a discord.js autocomplete interaction that /alliance's suggestions use. */
export interface AllianceAutocompleteInteraction {
  readonly options: { getFocused(getFull: true): FocusedOption };
  respond(choices: readonly AutocompleteChoice[]): Promise<void>;
}

/** What the suggestions need: the Known Alliances, the time, and where a failed read is logged. */
export interface AllianceAutocompleteContext {
  readonly knownAlliances: { all(now: Date): readonly KnownAlliance[] };
  readonly now: () => Date;
  readonly logError: (message: string) => void;
}

/**
 * Answers the autocomplete of /alliance from the Known Alliances, without asking the Game API. The name option offers
 * the full name as value; the tag option offers the tag. Nothing typed yet offers the most recently seen. A failed read
 * answers an empty list and is logged.
 */
export async function handleAllianceAutocomplete(
  interaction: AllianceAutocompleteInteraction,
  context: AllianceAutocompleteContext,
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const choices = suggest(focused, context);
  await interaction.respond(choices);
}

/** The choices for the focused option; an empty list when the Known Alliances cannot be read. */
function suggest(focused: FocusedOption, context: AllianceAutocompleteContext): AutocompleteChoice[] {
  try {
    const now = context.now();
    const query = String(focused.value);
    const alliances = alliancesFor(query, context.knownAlliances.all(now), now);
    return alliances.map((alliance) => ({
      name: truncate(`[${alliance.tag}] ${alliance.name}`),
      value: truncate(focused.name === "tag" ? alliance.tag : alliance.name),
    }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    context.logError(`Suggesting alliances failed: ${reason}`);
    return [];
  }
}

/** The matches for what is typed, best first; with nothing typed, the most recently seen Known Alliances. */
function alliancesFor(query: string, known: readonly KnownAlliance[], now: Date): readonly KnownAlliance[] {
  if (normalise(query) !== "") return matchAlliances(query, known, now, MAX_CHOICES);
  return [...known].sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime()).slice(0, MAX_CHOICES);
}

function truncate(text: string): string {
  return text.slice(0, MAX_CHOICE_TEXT);
}
