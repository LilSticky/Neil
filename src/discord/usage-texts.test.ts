import type { APIEmbed } from "discord.js";
import { describe, expect, test } from "vitest";
import { refusalMessage, usageLine, withUsage } from "./usage-texts.js";

const NOW = new Date("2026-10-30T16:00:00Z");
const RESETS_AT = new Date("2026-10-31T00:00:00Z");

const MEMBER_LINE = "4 of 14 Game API requests used today · cached answers are free · resets 00:00 UTC";
const OFFICER_LINE =
  "4 Game API requests used today · Officers are not limited · cached answers are free · resets 00:00 UTC";
const CARD_FOOTER = "Data from Last Asylum Tracker · as of 15:20 UTC";

function cardEmbed(): APIEmbed {
  return { title: "Vex", footer: { text: CARD_FOOTER } };
}

describe("refusalMessage", () => {
  test("says the Daily Allowance is spent with M of M requests, that cached answers still work, and when it resets with the time left", () => {
    expect(refusalMessage(RESETS_AT, 3, NOW)).toBe(
      "Your Daily Allowance is spent: 3 of 3 Game API requests used today. Cached answers still work. It resets at 00:00 UTC (in 8 h 0 min).",
    );
  });
});

describe("usageLine", () => {
  test("gives a Member the count of the allowance, that cached answers are free, and when it resets", () => {
    expect(usageLine({ used: 4, allowance: 14, officer: false })).toBe(MEMBER_LINE);
  });

  test("gives an Officer the count with no allowance, saying Officers are not limited", () => {
    expect(usageLine({ used: 4, allowance: 14, officer: true })).toBe(OFFICER_LINE);
  });
});

describe("withUsage", () => {
  test("adds the line last in the embed footer, after the existing footer text", () => {
    expect(withUsage({ embeds: [cardEmbed()] }, MEMBER_LINE)).toEqual({
      embeds: [{ title: "Vex", footer: { text: `${CARD_FOOTER} · ${MEMBER_LINE}` } }],
    });
  });

  test("makes the line the footer of an embed that has no footer yet", () => {
    expect(withUsage({ embeds: [{ title: "Vex" }] }, MEMBER_LINE)).toEqual({
      embeds: [{ title: "Vex", footer: { text: MEMBER_LINE } }],
    });
  });

  test("adds the line at the end of the text when the message has no embed", () => {
    expect(withUsage({ content: "No player has the uid 93159425." }, MEMBER_LINE)).toEqual({
      content: `No player has the uid 93159425.\n${MEMBER_LINE}`,
    });
  });

  test("keeps the rest of the message and does not change the message it was given", () => {
    const message = () => ({ content: 'Several players are named "DrLOL". Pick one:', components: [] });
    const given = message();

    const result = withUsage(given, MEMBER_LINE);

    expect(result).toEqual({
      content: `Several players are named "DrLOL". Pick one:\n${MEMBER_LINE}`,
      components: [],
    });
    expect(given).toEqual(message());
  });
});
