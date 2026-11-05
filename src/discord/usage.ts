import { MessageFlags, type InteractionReplyOptions } from "discord.js";
import type { AllowanceKeeper } from "../game-api/allowance-keeper.js";
import { isOfficer } from "../domain/officer.js";
import type { MemberId } from "../domain/rank-approval.js";
import { usageReply } from "./usage-texts.js";

/** The part of a discord.js chat-input interaction that /usage uses: who ran it, their roles, and the private reply. */
export interface UsageInteraction {
  readonly callerId: MemberId;
  memberRoleIds(): readonly string[];
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

export interface UsageContext {
  /** The Daily Allowance of today and the requests a Member's lookups caused today. */
  readonly allowance: Pick<AllowanceKeeper, "allowance" | "usageOf">;
  readonly officerRoleIds: readonly string[];
  readonly now: () => Date;
  readonly logError: (message: string) => void;
}

/** Answers /usage privately with the caller's requests today; no Game API request is made. A failed reply is logged, never thrown. */
export async function handleUsage(interaction: UsageInteraction, context: UsageContext): Promise<void> {
  try {
    const content = usageReply({
      used: context.allowance.usageOf(interaction.callerId),
      allowance: context.allowance.allowance(),
      officer: isOfficer(interaction.memberRoleIds(), context.officerRoleIds),
      now: context.now(),
    });
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  } catch (error) {
    context.logError(`Replying to /usage failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
