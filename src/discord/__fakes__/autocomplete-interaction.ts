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
 * An autocomplete interaction that records every answer it gets. Nothing reaches Discord; the focused option is the one
 * the test names. The optional kingdom is what the Member typed in the kingdom option (null when empty), as
 * getInteger("kingdom") reports it.
 */
export class FakeAutocompleteInteraction {
  readonly responses: (readonly AutocompleteChoice[])[] = [];
  readonly options: { getFocused(getFull: true): FocusedOption; getInteger(name: string): number | null };

  constructor(
    private readonly focused: FocusedOption,
    private readonly kingdom: number | null = null,
  ) {
    this.options = {
      getFocused: () => this.focused,
      getInteger: (name: string) => (name === "kingdom" ? this.kingdom : null),
    };
  }

  respond(choices: readonly AutocompleteChoice[]): Promise<void> {
    this.responses.push(choices);
    return Promise.resolve();
  }
}
