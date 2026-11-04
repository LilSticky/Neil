import type { InteractionReplyOptions, InteractionUpdateOptions } from "discord.js";

/** One call the handler made on a page button of /reaper, in the order it was made. */
export type ReaperPageCall =
  | { readonly method: "update"; readonly options: InteractionUpdateOptions }
  | { readonly method: "reply"; readonly options: InteractionReplyOptions };

/** A press of a page button under a /reaper answer, recording the calls the handler makes on it. */
export class FakeReaperPageInteraction {
  readonly calls: ReaperPageCall[] = [];
  readonly customId: string;
  readonly user: { readonly id: string };

  constructor(input: { readonly customId: string; readonly userId: string }) {
    this.customId = input.customId;
    this.user = { id: input.userId };
  }

  update(options: InteractionUpdateOptions): Promise<void> {
    this.calls.push({ method: "update", options });
    return Promise.resolve();
  }

  reply(options: InteractionReplyOptions): Promise<void> {
    this.calls.push({ method: "reply", options });
    return Promise.resolve();
  }
}
