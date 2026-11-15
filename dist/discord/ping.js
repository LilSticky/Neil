import { MessageFlags } from "discord.js";
import { timestamp } from "./timestamps.js";
export function renderPingReply(input) {
    const gateway = input.gatewayPingMs < 0 ? "–" : `${Math.round(input.gatewayPingMs).toString()} ms`;
    const version = input.buildInfo === "dev" ? "dev" : `${input.buildInfo.version} (built ${timestamp(input.buildInfo.builtAt, "f")})`;
    return [
        "👋 Hi, I'm Neil and I'm online.",
        `Latency: ${Math.round(input.latencyMs).toString()} ms (gateway ${gateway})`,
        `Version: ${version}`,
        `Data kept since ${timestamp(input.startRecord.firstStartedAt, "f")} · start #${input.startRecord.startCount.toString()}`,
    ].join("\n");
}
/** Answers /ping privately; a failed reply is logged, never thrown. */
export async function handlePing(interaction, context) {
    const content = renderPingReply({
        latencyMs: context.now() - interaction.createdTimestamp,
        gatewayPingMs: context.gatewayPingMs(),
        buildInfo: context.buildInfo,
        startRecord: context.startRecord,
    });
    try {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
    catch (error) {
        context.logError(`Replying to /ping failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
//# sourceMappingURL=ping.js.map