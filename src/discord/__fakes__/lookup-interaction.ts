import type { InteractionEditReplyOptions, InteractionReplyOptions } from "discord.js";

export type LookupCallName = "reply" | "deferReply" | "editReply" | "deleteReply" | "followUp";

/** One call the handler made on the interaction, in the order it was made. */
export type LookupCall =
  | { readonly method: "reply"; readonly options: InteractionReplyOptions }
  | { readonly method: "deferReply" }
  | { readonly method: "editReply"; readonly options: InteractionEditReplyOptions }
  | { readonly method: "deleteReply" }
  | { readonly method: "followUp"; readonly options: InteractionReplyOptions };

/** The option values the Member typed, by option name; an option left out reads as null. */
export interface LookupOptionValues {
  readonly strings?: Readonly<Record<string, string>>;
  readonly integers?: Readonly<Record<string, number>>;
}

/** The Member who ran the command when the test does not name one. */
export const DEFAULT_LOOKUP_USER_ID = "310000000000000001";

/**
 * A /player or /alliance interaction that records its calls in order. A call is recorded even when it is
 * made to fail with fail(); the failure then rejects that call, as Discord does.
 */
export class FakeLookupInteraction {
  readonly calls: LookupCall[] = [];
  readonly user: { readonly id: string };
  readonly options: {
    getString(name: string, required?: false): string | null;
    getInteger(name: string, required?: false): number | null;
  };

  private readonly failures = new Map<LookupCallName, Error>();

  constructor(values: LookupOptionValues, userId: string = DEFAULT_LOOKUP_USER_ID) {
    this.user = { id: userId };
    this.options = {
      getString: (name: string): string | null => values.strings?.[name] ?? null,
      getInteger: (name: string): number | null => values.integers?.[name] ?? null,
    };
  }

  fail(method: LookupCallName, error: Error): void {
    this.failures.set(method, error);
  }

  reply(options: InteractionReplyOptions): Promise<void> {
    return this.record({ method: "reply", options });
  }

  deferReply(): Promise<void> {
    return this.record({ method: "deferReply" });
  }

  editReply(options: InteractionEditReplyOptions): Promise<void> {
    return this.record({ method: "editReply", options });
  }

  deleteReply(): Promise<void> {
    return this.record({ method: "deleteReply" });
  }

  followUp(options: InteractionReplyOptions): Promise<void> {
    return this.record({ method: "followUp", options });
  }

  private record(call: LookupCall): Promise<void> {
    this.calls.push(call);
    const error = this.failures.get(call.method);
    return error === undefined ? Promise.resolve() : Promise.reject(error);
  }
}
