import type { InteractionEditReplyOptions, InteractionReplyOptions } from "discord.js";

/** One call the handler made on a Look again button, in the order it was made. */
export type LookAgainCall =
  | { readonly method: "deferUpdate" }
  | { readonly method: "editReply"; readonly options: InteractionEditReplyOptions }
  | { readonly method: "followUp"; readonly options: InteractionReplyOptions }
  | { readonly method: "reply"; readonly options: InteractionReplyOptions };

/** A Look again button press that records its calls in order: the custom id it carries and the Member who pressed it. */
export class FakeLookAgainInteraction {
  readonly calls: LookAgainCall[] = [];
  readonly customId: string;
  readonly user: { readonly id: string };
  private readonly roleIds: readonly string[];

  constructor(input: { readonly customId: string; readonly userId: string; readonly roleIds?: readonly string[] }) {
    this.customId = input.customId;
    this.user = { id: input.userId };
    this.roleIds = input.roleIds ?? [];
  }

  /** The Discord role ids the Member holds, as the Officer check reads them. */
  memberRoleIds(): readonly string[] {
    return this.roleIds;
  }

  deferUpdate(): Promise<void> {
    this.calls.push({ method: "deferUpdate" });
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
