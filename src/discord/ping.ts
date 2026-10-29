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
