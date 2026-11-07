import type { InteractionEditReplyOptions, InteractionReplyOptions, InteractionUpdateOptions } from "discord.js";
import type { BootyChannel } from "../booty-call.js";

/** One answer the Booty Call made on its interaction, in the order it was made. */
export type BootyCallAnswer =
  | { readonly method: "reply"; readonly options: InteractionReplyOptions }
  | { readonly method: "followUp"; readonly options: InteractionReplyOptions }
  | { readonly method: "update"; readonly options: InteractionUpdateOptions }
  | { readonly method: "editReply"; readonly options: InteractionEditReplyOptions };

/**
 * A /booty command, or a press of a Booty Call button when `customId` is given. The caller and the channel are the ones
 * the test gives. Nothing reaches Discord; every answer is recorded.
 */
export class FakeBootyCallInteraction {
  readonly answers: BootyCallAnswer[] = [];
  readonly user: { readonly id: string; readonly displayName: string };
  readonly channel: BootyChannel | undefined;
  readonly customId: string;

  constructor(input: {
    readonly userId: string;
    readonly displayName: string;
    readonly channel: BootyChannel | undefined;
    readonly customId?: string;
  }) {
    this.user = { id: input.userId, displayName: input.displayName };
    this.channel = input.channel;
    this.customId = input.customId ?? "";
  }

  reply(options: InteractionReplyOptions): Promise<void> {
    this.answers.push({ method: "reply", options });
    return Promise.resolve();
  }

  followUp(options: InteractionReplyOptions): Promise<void> {
    this.answers.push({ method: "followUp", options });
    return Promise.resolve();
  }

  update(options: InteractionUpdateOptions): Promise<void> {
    this.answers.push({ method: "update", options });
    return Promise.resolve();
  }

  editReply(options: InteractionEditReplyOptions): Promise<void> {
    this.answers.push({ method: "editReply", options });
    return Promise.resolve();
  }
}
