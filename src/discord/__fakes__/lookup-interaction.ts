import type { InteractionEditReplyOptions, InteractionReplyOptions } from "discord.js";

export type LookupCallName = "reply" | "deferReply" | "editReply" | "deleteReply" | "followUp";

/** One call the handler made on the interaction, in the order it was made. */
export type LookupCall =
  | { readonly method: "reply"; readonly options: InteractionReplyOptions }
  | { readonly method: "deferReply" }
  | { readonly method: "editReply"; readonly options: InteractionEditReplyOptions }
  | { readonly method: "deleteReply" }
  | { readonly method: "followUp"; readonly options: InteractionReplyOptions };

/**
 * A /player interaction that records its calls in order. A call is recorded even when it is
 * made to fail with fail(); the failure then rejects that call, as Discord does.
 */
export class FakeLookupInteraction {
  readonly calls: LookupCall[] = [];
  readonly options: { getString(name: string, required: true): string };

  private readonly failures = new Map<LookupCallName, Error>();

  constructor(private readonly uid: string) {
    this.options = {
      getString: (name: string): string => {
        if (name !== "uid") throw new Error(`the fake has no string option "${name}"`);
        return this.uid;
      },
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
