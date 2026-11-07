import type {
  InteractionDeferReplyOptions,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  InteractionUpdateOptions,
} from "discord.js";
import type { BootyChannel } from "../booty-call.js";

/** The calls the interaction and the server received, in the order they were made (for example "deferReply", "holdersOf"). */
export type CallTimeline = string[];

/** One answer the Booty Call made on its interaction, in the order it was made. */
export type BootyCallAnswer =
  | { readonly method: "reply"; readonly options: InteractionReplyOptions }
  | { readonly method: "deferReply"; readonly options: InteractionDeferReplyOptions }
  | { readonly method: "followUp"; readonly options: InteractionReplyOptions }
  | { readonly method: "update"; readonly options: InteractionUpdateOptions }
  | { readonly method: "editReply"; readonly options: InteractionEditReplyOptions };

/**
 * A /booty command, or a press of a Booty Call button when `customId` is given. The caller and the channel are the ones
 * the test gives. Nothing reaches Discord; every answer is recorded, a refused deferral included. Each call is also
 * written to the timeline given, if any, so the order against the server's reads can be checked. After `failNextDefer`,
 * the next deferReply rejects, as Discord does when it cannot acknowledge the command.
 */
export class FakeBootyCallInteraction {
  readonly answers: BootyCallAnswer[] = [];
  readonly user: { readonly id: string; readonly displayName: string };
  readonly channel: BootyChannel | undefined;
  readonly customId: string;
  private readonly timeline: CallTimeline;
  private deferFailure: Error | undefined = undefined;

  constructor(input: {
    readonly userId: string;
    readonly displayName: string;
    readonly channel: BootyChannel | undefined;
    readonly customId?: string;
    readonly timeline?: CallTimeline;
  }) {
    this.user = { id: input.userId, displayName: input.displayName };
    this.channel = input.channel;
    this.customId = input.customId ?? "";
    this.timeline = input.timeline ?? [];
  }

  /** The next deferReply rejects with the error. */
  failNextDefer(error: Error): void {
    this.deferFailure = error;
  }

  reply(options: InteractionReplyOptions): Promise<void> {
    this.timeline.push("reply");
    this.answers.push({ method: "reply", options });
    return Promise.resolve();
  }

  deferReply(options: InteractionDeferReplyOptions): Promise<void> {
    this.timeline.push("deferReply");
    this.answers.push({ method: "deferReply", options });
    if (this.deferFailure !== undefined) {
      const failure = this.deferFailure;
      this.deferFailure = undefined;
      return Promise.reject(failure);
    }
    return Promise.resolve();
  }

  followUp(options: InteractionReplyOptions): Promise<void> {
    this.timeline.push("followUp");
    this.answers.push({ method: "followUp", options });
    return Promise.resolve();
  }

  update(options: InteractionUpdateOptions): Promise<void> {
    this.timeline.push("update");
    this.answers.push({ method: "update", options });
    return Promise.resolve();
  }

  editReply(options: InteractionEditReplyOptions): Promise<void> {
    this.timeline.push("editReply");
    this.answers.push({ method: "editReply", options });
    return Promise.resolve();
  }
}
