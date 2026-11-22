import { describe, expect, test } from "vitest";
import { FEEDBACK_CHANNELS, FEEDBACK_TEMPLATE, feedbackEntry, type FeedbackPostView } from "./feedback-texts.js";

const POST: FeedbackPostView = {
  channelName: "feedback",
  memberName: "Mira",
  text: "the card shows my old Alliance",
  attachmentUrls: [],
  stickerNames: [],
  hasEmbeds: false,
  jumpLink: "https://discord.com/channels/1/2/3",
};

function postWith(changes: Partial<FeedbackPostView>): FeedbackPostView {
  return { ...POST, ...changes };
}

describe("the feedback channels", () => {
  test("are feedback and suggestions", () => {
    expect(FEEDBACK_CHANNELS).toEqual(["feedback", "suggestions"]);
  });
});

describe("the Feedback Template", () => {
  test.each(["Type: Bug | Idea", "Where: ", "What happened: ", "Expected: ", "What: ", "Steps: "])("contains the line %s", (line) => {
    expect(FEEDBACK_TEMPLATE).toContain(line);
  });

  test("fits in one Discord message", () => {
    expect(FEEDBACK_TEMPLATE.length).toBeLessThanOrEqual(2000);
  });
});

describe("a Feedback Post entry", () => {
  test("names the channel, the Member, the text and the jump link in one message", () => {
    const parts = feedbackEntry(POST);

    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain("#feedback");
    expect(parts[0]).toContain("Mira");
    expect(parts[0]).toContain("the card shows my old Alliance");
    expect(parts[0]).toContain("https://discord.com/channels/1/2/3");
  });

  test("names the thread under its channel", () => {
    const parts = feedbackEntry(postWith({ channelName: "suggestions", threadName: "Ideas for the card" }));

    expect(parts.join("\n")).toContain("#suggestions › Ideas for the card");
  });

  test("lists every attachment as a link", () => {
    const parts = feedbackEntry(
      postWith({ attachmentUrls: ["https://cdn.discordapp.com/attachments/1/a.png", "https://cdn.discordapp.com/attachments/1/b.png"] }),
    );

    expect(parts.join("\n")).toContain("https://cdn.discordapp.com/attachments/1/a.png");
    expect(parts.join("\n")).toContain("https://cdn.discordapp.com/attachments/1/b.png");
  });

  test("keeps mentions as written", () => {
    const parts = feedbackEntry(postWith({ text: "ask <@123> and <@&456>, @everyone" }));

    expect(parts.join("\n")).toContain("ask <@123> and <@&456>, @everyone");
  });

  test("says there is no text and lists the stickers when the post has only a sticker", () => {
    const parts = feedbackEntry(postWith({ text: "", stickerNames: ["Wave"] }));

    expect(parts.join("\n")).toMatch(/no text/i);
    expect(parts.join("\n")).toContain("Wave");
  });

  test("says there is no text and that the post has embeds when it has only an embed", () => {
    const parts = feedbackEntry(postWith({ text: "", hasEmbeds: true }));

    expect(parts.join("\n")).toMatch(/no text/i);
    expect(parts.join("\n")).toMatch(/embed/i);
  });

  test("a long text is split into parts of at most 2000 characters at line breaks, losing no line", () => {
    const lines = Array.from({ length: 120 }, (_, index) => `line ${index.toString().padStart(3, "0")} ${"a".repeat(40)}`);
    const text = lines.join("\n");
    expect(text.length).toBeGreaterThan(5000);

    const parts = feedbackEntry(postWith({ text }));

    expect(parts.length).toBeGreaterThan(1);
    expect(Math.max(...parts.map((part) => part.length))).toBeLessThanOrEqual(2000);
    const readBack = parts.join("\n").split("\n").filter((line) => lines.includes(line));
    expect(readBack).toEqual(lines);
  });
});
