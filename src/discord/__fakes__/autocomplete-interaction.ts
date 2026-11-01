/** One choice an autocomplete answer offers: the label Discord shows and the value the command receives. */
export interface AutocompleteChoice {
  readonly name: string;
  readonly value: string;
}

/** The option the Member is typing in, as discord.js reports it with getFocused(true). */
export interface FocusedOption {
  readonly name: string;
  readonly value: string;
}

/**
 * An /alliance autocomplete interaction that records every answer it gets. Nothing reaches Discord; the focused option
 * is the one the test names.
 */
export class FakeAutocompleteInteraction {
  readonly responses: (readonly AutocompleteChoice[])[] = [];
  readonly options: { getFocused(getFull: true): FocusedOption };

  constructor(private readonly focused: FocusedOption) {
    this.options = {
      getFocused: () => this.focused,
    };
  }

  respond(choices: readonly AutocompleteChoice[]): Promise<void> {
    this.responses.push(choices);
    return Promise.resolve();
  }
}
