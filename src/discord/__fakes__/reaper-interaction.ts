import type {
  InteractionDeferReplyOptions,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
} from "discord.js";

/** One call the handler made on a /reaper interaction, in the order it was made. */
export type ReaperInteractionCall =
  | { readonly method: "deferReply"; readonly options: InteractionDeferReplyOptions | undefined }
  | { readonly method: "editReply"; readonly options: InteractionEditReplyOptions }
  | { readonly method: "followUp"; readonly options: InteractionReplyOptions }
  | { readonly method: "reply"; readonly options: InteractionReplyOptions };

/** The option values the Member typed, by option name; an option left out reads as null. */
export interface ReaperOptionValues {
  readonly strings?: Readonly<Record<string, string>>;
  readonly integers?: Readonly<Record<string, number>>;
}

/** A /reaper interaction that records its calls in order, including the options of a deferral. */
export class FakeReaperInteraction {
  readonly calls: ReaperInteractionCall[] = [];
  readonly user: { readonly id: string };
  readonly options: {
    getString(name: string, required?: false): string | null;
    getInteger(name: string, required?: false): number | null;
  };

  constructor(values: ReaperOptionValues, userId: string) {
    this.user = { id: userId };
    this.options = {
      getString: (name: string): string | null => values.strings?.[name] ?? null,
      getInteger: (name: string): number | null => values.integers?.[name] ?? null,
    };
  }

  deferReply(options?: InteractionDeferReplyOptions): Promise<void> {
    this.calls.push({ method: "deferReply", options });
    return Promise.resolve();
  }

  editReply(options: InteractionEditReplyOptions): Promise<void> {
    this.calls.push({ method: "editReply", options });
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
