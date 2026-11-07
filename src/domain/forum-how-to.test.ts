import { describe, expect, test } from "vitest";
import { forumHowTo } from "./forum-how-to.js";
import type { ForumSetup } from "./server-layout.js";

const PVP_TACTICS: ForumSetup = {
  tags: ["Rally", "Defense", "Scouting", "Troops", "Lessons learned"],
  reaction: "⚔️",
  howTo: {
    belongs: "One battle plan, trick or lesson per post.",
    exampleTitle: "Rally timing against #412",
    template: ["Situation", "What we did", "What worked", "What didn't"],
  },
};

describe("forumHowTo", () => {
  test("titles the how-to post with the forum's name", () => {
    expect(forumHowTo("pvp-tactics", PVP_TACTICS).title).toBe("How to post in #pvp-tactics");
  });

  test("builds the content from the forum's what belongs, example title, tags, template and reaction", () => {
    expect(forumHowTo("pvp-tactics", PVP_TACTICS).content).toBe(
      [
        "📌 **How to post in #pvp-tactics**",
        "One battle plan, trick or lesson per post.",
        "",
        '**Title:** what your post is about, e.g. "Rally timing against #412"',
        "**Tags:** pick one or two: Rally, Defense, Scouting, Troops, Lessons learned",
        "**Body:** copy this and fill it in:",
        "```",
        "Situation:",
        "What we did:",
        "What worked:",
        "What didn't:",
        "```",
        "",
        "Reply inside a post to discuss it. React with ⚔️ to a post you found useful.",
      ].join("\n"),
    );
  });
});
