import { describe, expect, test } from "vitest";
import { parseAllianceKey, parseKingdom, parseUid } from "../domain/lookup-input.js";
import allianceBody from "../game-api/__fixtures__/alliance.json" with { type: "json" };
import playerBody from "../game-api/__fixtures__/player-in-alliance.json" with { type: "json" };
import { GameApiClient } from "../game-api/client.js";
import { QuotaKeeper } from "../game-api/quota-keeper.js";
import { renderAllianceCard, renderPlayerCard } from "./lookup-cards.js";

const NOW = new Date("2026-10-30T16:00:00Z");

/** A client whose every request is answered with the given recorded body (SC-002). */
function clientAnswering(body: unknown): GameApiClient {
  const now = (): Date => new Date("2026-10-30T15:20:00Z");
  return new GameApiClient({
    apiKey: "fake-key",
    version: "test",
    now,
    quota: new QuotaKeeper({ store: { load: () => undefined, save: () => undefined }, now, reserve: 100 }),
    cacheTtlMs: 600_000,
    sleep: () => Promise.resolve(),
    random: () => 0.5,
    fetch: () =>
      Promise.resolve(
        new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
      ),
    logError: () => undefined,
  });
}

describe("cards from recorded Game API answers", () => {
  test("the Player card shows the recorded Player's values", async () => {
    const uid = parseUid("145563254785");
    if (!uid.ok) throw new Error("uid must parse");

    const result = await clientAnswering(playerBody).getPlayer(uid.value, "lookup");
    if (result.kind !== "found") throw new Error(`expected found, got ${result.kind}`);

    expect(renderPlayerCard(result.value, result.fetchedAt, NOW)).toEqual({
      title: "DrLOL",
      color: 0xb33a3a,
      author: { name: "Kingdom #1", icon_url: "https://lastasylumtracker.com/static/kingdom/badge_1.png" },
      thumbnail: { url: "https://lastasylumtracker.com/static/avatars/head_90002.png" },
      description: "Last online 2 days ago",
      fields: [
        { name: "Power", value: "15,902,728", inline: true },
        { name: "Kills", value: "4,420", inline: true },
        { name: "Likes", value: "110", inline: true },
        { name: "Sanctuary level", value: "23", inline: true },
        { name: "VIP Level", value: "4", inline: true },
        { name: "Language", value: "English", inline: true },
        { name: "Alliance", value: "[NML] No Man's Land", inline: true },
        { name: "Alliance Rank", value: "R5", inline: true },
        { name: "Location", value: "X:807 Y:846", inline: true },
      ],
      footer: { text: "Data from Last Asylum Tracker · as of 15:20 UTC" },
    });
  });

  test("the Alliance card shows the recorded Alliance's values", async () => {
    const kingdom = parseKingdom(1);
    const key = parseAllianceKey("NML");
    if (!kingdom.ok || !key.ok) throw new Error("input must parse");

    const result = await clientAnswering(allianceBody).getAlliance(kingdom.value, key.value, "lookup");
    if (result.kind !== "found") throw new Error(`expected found, got ${result.kind}`);

    const card = renderAllianceCard(result.value, result.fetchedAt, NOW);
    expect(card).toMatchObject({
      title: "[NML] No Man's Land",
      color: 0xb33a3a,
      author: { name: "Kingdom #1", icon_url: "https://lastasylumtracker.com/static/kingdom/badge_1.png" },
      thumbnail: { url: "https://lastasylumtracker.com/static/alliance/badge_103.png" },
      description: "**Join Requirements:** Open to all",
      footer: { text: "Data from Last Asylum Tracker · as of 15:20 UTC" },
    });
    // The roster fields follow these seven; their rows are covered in lookup-cards.test.ts.
    expect(card.fields?.slice(0, 7)).toMatchObject([
      { name: "Power", value: "208,815,434" },
      { name: "Kingdom Power Rank", value: "#25 in Kingdom #1" },
      { name: "Members", value: "52/100" },
      { name: "Leader", value: "DrLOL" },
      { name: "Alliance Level", value: "Level 4 · 8,829,850 XP" },
      { name: "Gift Level", value: "6" },
      { name: "Language", value: "Japanese" },
    ]);
  });
});
