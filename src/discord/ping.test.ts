import { describe, expect, test } from "vitest";
import { startCount } from "../domain/start-record.js";
import { renderPingReply } from "./ping.js";

const startRecord = { firstStartedAt: new Date("2026-10-29T12:00:59Z"), startCount: startCount(3) };

describe("renderPingReply", () => {
  test("renders greeting, latency, version and start record", () => {
    const text = renderPingReply({
      latencyMs: 123,
      gatewayPingMs: 45,
      buildInfo: { version: "2f7a537", builtAt: new Date("2026-10-29T14:02:31Z") },
      startRecord,
    });

    expect(text).toBe(
      [
        "👋 Hi, I'm Neil and I'm online.",
        "Latency: 123 ms (gateway 45 ms)",
        "Version: 2f7a537 (built 2026-10-29 14:02 UTC)",
        "Data kept since 2026-10-29 12:00 UTC · start #3",
      ].join("\n"),
    );
  });

  test("shows the gateway as – before the first heartbeat", () => {
    const text = renderPingReply({ latencyMs: 80, gatewayPingMs: -1, buildInfo: "dev", startRecord });

    expect(text).toContain("Latency: 80 ms (gateway –)");
  });

  test("shows version dev without a build time when there is no build info", () => {
    const text = renderPingReply({ latencyMs: 80, gatewayPingMs: 10, buildInfo: "dev", startRecord });

    expect(text).toContain("Version: dev\n");
    expect(text).not.toContain("built");
  });

  test("rounds latencies to whole milliseconds", () => {
    const text = renderPingReply({ latencyMs: 12.6, gatewayPingMs: 3.2, buildInfo: "dev", startRecord });

    expect(text).toContain("Latency: 13 ms (gateway 3 ms)");
  });
});
