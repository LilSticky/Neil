import { describe, expect, test } from "vitest";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Player } from "../domain/player.js";
import { lookupMessages, renderPlayerCard } from "./lookup-cards.js";

function uid(text: string): Uid {
  const parsed = parseUid(text);
  if (!parsed.ok) throw new Error(`test uid "${text}" is not a valid uid`);
  return parsed.value;
}

function kingdom(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`test Kingdom ${number.toString()} is not valid`);
  return parsed.value;
}

const inAlliance: Player = {
  uid: uid("145563254785"),
  name: "Vex",
  kingdom: kingdom(330),
  power: 15902728,
  sanctuaryLevel: 42,
  alliance: { tag: "NML", name: "Neil's Men" },
  allianceRank: "R5",
};

const withoutAlliance: Player = {
  uid: uid("145563254785"),
  name: "Vex",
  kingdom: kingdom(330),
  power: 15902728,
  sanctuaryLevel: 42,
  alliance: undefined,
  allianceRank: undefined,
};

describe("renderPlayerCard", () => {
  test("titles the card with the Player's name", () => {
    expect(renderPlayerCard(inAlliance)).toMatchObject({ title: "Vex" });
  });

  test("shows uid, Kingdom, Power, Sanctuary level, Alliance and Alliance Rank as inline fields", () => {
    expect(renderPlayerCard(inAlliance)).toMatchObject({
      fields: [
        { name: "uid", value: "145563254785", inline: true },
        { name: "Kingdom", value: "#330", inline: true },
        { name: "Power", value: "15,902,728", inline: true },
        { name: "Sanctuary level", value: "42", inline: true },
        { name: "Alliance", value: "[NML] Neil's Men", inline: true },
        { name: "Alliance Rank", value: "R5", inline: true },
      ],
    });
  });

  test("shows No alliance and leaves out the Alliance Rank field without an Alliance", () => {
    const card = renderPlayerCard(withoutAlliance);

    expect(card).toMatchObject({
      fields: [
        { name: "uid", value: "145563254785" },
        { name: "Kingdom", value: "#330" },
        { name: "Power", value: "15,902,728" },
        { name: "Sanctuary level", value: "42" },
        { name: "Alliance", value: "No alliance" },
      ],
    });
    expect(card.fields?.map((field) => field.name)).not.toContain("Alliance Rank");
  });

  test("shows Unknown as the Alliance Rank when the Game gives none", () => {
    const card = renderPlayerCard({ ...inAlliance, allianceRank: "unknown" });

    expect(card.fields?.find((field) => field.name === "Alliance Rank")).toMatchObject({ value: "Unknown" });
  });

  test("credits Last Asylum Tracker in the footer", () => {
    expect(renderPlayerCard(inAlliance)).toMatchObject({ footer: { text: "Data from Last Asylum Tracker" } });
  });

  test("escapes markdown in the Player's name and in the Alliance's name", () => {
    const card = renderPlayerCard({
      ...inAlliance,
      name: "*Bold_* `x`",
      alliance: { tag: "NML", name: "_Tilted_ ~Men~" },
    });

    expect(card).toMatchObject({ title: "\\*Bold\\_\\* \\`x\\`" });
    expect(card.fields?.find((field) => field.name === "Alliance")).toMatchObject({
      value: "[NML] \\_Tilted\\_ \\~Men\\~",
    });
  });
});

describe("lookupMessages", () => {
  test.each([
    ["invalidUid", "That doesn't look like a uid. A uid is a number: in the game, tap your profile picture (top left), then the feather next to your name; the number under the picture is your uid."],
    ["quotaSpent", "Lookups are used up for today. They work again after 00:00 UTC."],
    ["tryAgain", "The game tracker is busy right now. Try again in a moment."],
    ["unavailable", "Lookups are not working right now. Please tell an Officer."],
  ] as const)("%s has the contract's text", (key, text) => {
    expect(lookupMessages[key]).toBe(text);
  });

  test("playerNotFound names the uid", () => {
    expect(lookupMessages.playerNotFound("145563254785")).toBe("No player has the uid 145563254785.");
  });

  test("playerNotFound escapes the uid as typed", () => {
    expect(lookupMessages.playerNotFound("1_2*")).toBe("No player has the uid 1\\_2\\*.");
  });
});
