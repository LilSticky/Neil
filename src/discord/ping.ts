import { MessageFlags } from "discord.js";
import type { StartRecord } from "../domain/start-record.js";

/** The running build, or `dev` when no build info was written (local runs). */
export type BuildInfo = "dev" | { readonly version: string; readonly builtAt: Date };

export interface PingReplyInput {
  readonly latencyMs: number;
  /** The client's websocket ping; negative before the first heartbeat. */
  readonly gatewayPingMs: number;
  readonly buildInfo: BuildInfo;
  readonly startRecord: StartRecord;
}

export function renderPingReply(input: PingReplyInput): string {
  const gateway = input.gatewayPingMs < 0 ? "–" : `${Math.round(input.gatewayPingMs).toString()} ms`;
  const version =
    input.buildInfo === "dev" ? "dev" : `${input.buildInfo.version} (built ${utcMinute(input.buildInfo.builtAt)})`;
  return [
    "👋 Hi, I'm Neil and I'm online.",
    `Latency: ${Math.round(input.latencyMs).toString()} ms (gateway ${gateway})`,
    `Version: ${version}`,
    `Data kept since ${utcMinute(input.startRecord.firstStartedAt)} · start #${input.startRecord.startCount.toString()}`,
  ].join("\n");
}

function utcMinute(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export interface PingReplyOptions {
  readonly content: string;
  readonly flags: MessageFlags.Ephemeral;
}

/** The part of a discord.js chat-input interaction that /ping uses. */
export interface PingInteraction {
  readonly createdTimestamp: number;
  reply(options: PingReplyOptions): Promise<unknown>;
}

export interface PingContext {
  readonly now: () => number;
  readonly gatewayPingMs: () => number;
  readonly buildInfo: BuildInfo;
  readonly startRecord: StartRecord;
  readonly logError: (message: string) => void;
}

/** Answers /ping privately; a failed reply is logged, never thrown. */
export async function handlePing(interaction: PingInteraction, context: PingContext): Promise<void> {
  const content = renderPingReply({
    latencyMs: context.now() - interaction.createdTimestamp,
    gatewayPingMs: context.gatewayPingMs(),
    buildInfo: context.buildInfo,
    startRecord: context.startRecord,
  });
  try {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  } catch (error) {
    context.logError(`Replying to /ping failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
