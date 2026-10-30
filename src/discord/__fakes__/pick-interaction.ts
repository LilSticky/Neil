import type { InteractionReplyOptions, InteractionUpdateOptions } from "discord.js";

export type PickCallName = "update" | "deferUpdate" | "followUp" | "reply";

/** One call the handler made on a component interaction, in the order it was made. */
export type PickCall =
  | { readonly method: "update"; readonly options: InteractionUpdateOptions }
  | { readonly method: "deferUpdate" }
  | { readonly method: "followUp"; readonly options: InteractionReplyOptions }
  | { readonly method: "reply"; readonly options: InteractionReplyOptions };

/**
 * A button or string-select interaction that records its calls in order. `values` is what the Member picked from
 * a select menu; a button has none.
 */
export class FakePickInteraction {
  readonly calls: PickCall[] = [];
  readonly customId: string;
  readonly user: { readonly id: string };
  readonly values: readonly string[];

  constructor(input: { readonly customId: string; readonly userId: string; readonly values?: readonly string[] }) {
    this.customId = input.customId;
    this.user = { id: input.userId };
    this.values = input.values ?? [];
  }

  update(options: InteractionUpdateOptions): Promise<void> {
    this.calls.push({ method: "update", options });
    return Promise.resolve();
  }

  deferUpdate(): Promise<void> {
    this.calls.push({ method: "deferUpdate" });
    return Promise.resolve();
  }

  followUp(options: InteractionReplyOptions): Promise<void> {
    this.calls.push({ method: "followUp", options });
    return Promise.resolve();
  }

  reply(options: InteractionReplyOptions): Promise<void> {
    this.calls.push({ method: "reply", options });
    return Promise.resolve();
  }
}
