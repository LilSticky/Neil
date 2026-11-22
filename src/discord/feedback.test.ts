import { MessageType, type BaseMessageOptions } from "discord.js";
import { describe, expect, test } from "vitest";
import { FEEDBACK_TEMPLATE } from "./feedback-texts.js";
import { createFeedback, isFeedbackPost } from "./feedback.js";
import {
  FEEDBACK_CHANNEL,
  FakeFeedbackServer,
  GUILD_ID,
  NEIL_ID,
  SUGGESTIONS_CHANNEL,
  postOf,
  threadUnder,
} from "./__fakes__/feedback-server.js";

function contentOf(message: BaseMessageOptions): string {
  return message.content ?? "";
}

describe("isFeedbackPost", () => {
  test("a Member's post in #feedback or #suggestions is a Feedback Post", () => {
    expect(isFeedbackPost(postOf({ channel: FEEDBACK_CHANNEL }), GUILD_ID)).toBe(true);
    expect(isFeedbackPost(postOf({ channel: SUGGESTIONS_CHANNEL }), GUILD_ID)).toBe(true);
  });

  test("a reply in a feedback channel is a Feedback Post too", () => {
    expect(isFeedbackPost(postOf({ type: MessageType.Reply, channel: FEEDBACK_CHANNEL }), GUILD_ID)).toBe(true);
  });

  test("a post in a thread under a feedback channel is a Feedback Post", () => {
    const thread = threadUnder(SUGGESTIONS_CHANNEL, "Map freeze");

    expect(isFeedbackPost(postOf({ channel: thread }), GUILD_ID)).toBe(true);
  });

  test("posts by bots, by webhooks and system messages are not Feedback Posts", () => {
    expect(isFeedbackPost(postOf({ bot: true, channel: FEEDBACK_CHANNEL }), GUILD_ID)).toBe(false);
    expect(isFeedbackPost(postOf({ webhookId: "500000000000000001", channel: FEEDBACK_CHANNEL }), GUILD_ID)).toBe(false);
    expect(isFeedbackPost(postOf({ type: MessageType.ThreadCreated, channel: FEEDBACK_CHANNEL }), GUILD_ID)).toBe(false);
  });

  test("posts in other channels and in other guilds are not Feedback Posts", () => {
    const general = { id: "200000000000000009", name: "general", type: FEEDBACK_CHANNEL.type, parent: null };

    expect(isFeedbackPost(postOf({ channel: general }), GUILD_ID)).toBe(false);
    expect(isFeedbackPost(postOf({ channel: FEEDBACK_CHANNEL, guildId: "100000000000000009" }), GUILD_ID)).toBe(false);
  });
});

describe("createFeedback forward", () => {
  test("logs the entry with mentions off, then reacts 📝 to the post", async () => {
    const server = new FakeFeedbackServer();
    const feedback = server.addChannel(FEEDBACK_CHANNEL);
    const post = server.post({ channel: FEEDBACK_CHANNEL, content: "The map freezes" });

    await createFeedback(server.options).forward(post);

    expect(server.logs.length).toBeGreaterThan(0);
    for (const line of server.logs) expect(line.allowedMentions).toEqual({ parse: [] });
    const logged = server.logs.map(contentOf).join("\n");
    expect(logged).toContain("The map freezes");
    expect(logged).toContain(post.url);
    expect(server.timeline[server.timeline.length - 1]).toBe("react 📝");
    expect(post.reactions).toEqual(["📝"]);
    expect(feedback.sent).toEqual([]);
  });

  test("names the Member by server nickname, else by display name", async () => {
    const server = new FakeFeedbackServer();
    server.addChannel(FEEDBACK_CHANNEL);
    const withNickname = server.post({ member: { nickname: "Sir Ann", displayName: "Annabel" } });
    const withoutNickname = server.post({ member: { nickname: null, displayName: "Annabel" } });

    await createFeedback(server.options).forward(withNickname);
    await createFeedback(server.options).forward(withoutNickname);

    expect(contentOf(server.logs[0] ?? {})).toContain("Sir Ann");
    expect(contentOf(server.logs[0] ?? {})).not.toContain("Annabel");
    expect(contentOf(server.logs[1] ?? {})).toContain("Annabel");
  });

  test("names the thread and its channel for a post in a thread", async () => {
    const server = new FakeFeedbackServer();
    server.addChannel(SUGGESTIONS_CHANNEL);
    const post = server.post({ channel: threadUnder(SUGGESTIONS_CHANNEL, "Map freeze") });

    await createFeedback(server.options).forward(post);

    const logged = server.logs.map(contentOf).join("\n");
    expect(logged).toContain("suggestions");
    expect(logged).toContain("Map freeze");
  });

  test("lists every attachment as a link", async () => {
    const server = new FakeFeedbackServer();
    server.addChannel(FEEDBACK_CHANNEL);
    const post = server.post({
      attachmentUrls: ["https://cdn.discordapp.com/attachments/1/2/one.png", "https://cdn.discordapp.com/attachments/1/3/two.png"],
    });

    await createFeedback(server.options).forward(post);

    const logged = server.logs.map(contentOf).join("\n");
    expect(logged).toContain("https://cdn.discordapp.com/attachments/1/2/one.png");
    expect(logged).toContain("https://cdn.discordapp.com/attachments/1/3/two.png");
  });

  test("sends every part of a long entry in order, then reacts", async () => {
    const server = new FakeFeedbackServer();
    server.addChannel(FEEDBACK_CHANNEL);
    const longText = Array.from({ length: 60 }, (_, index) => `line ${index.toString()}: ${"x".repeat(60)}`).join("\n");
    const post = server.post({ content: longText });

    await createFeedback(server.options).forward(post);

    expect(server.logs.length).toBeGreaterThan(1);
    for (const line of server.logs) expect(contentOf(line).length).toBeLessThanOrEqual(2000);
    const logged = server.logs.map(contentOf).join("\n");
    for (const line of longText.split("\n")) expect(logged).toContain(line);
    expect(server.timeline[server.timeline.length - 1]).toBe("react 📝");
    expect(server.timeline.slice(0, -1).every((step) => step === "log")).toBe(true);
  });

  test("when the entry cannot be logged, nothing is reacted and nothing is posted in the channel", async () => {
    const server = new FakeFeedbackServer();
    const feedback = server.addChannel(FEEDBACK_CHANNEL);
    const post = server.post({ channel: FEEDBACK_CHANNEL });
    const failure = new Error("Missing Access");
    server.failNextLog(failure);

    await expect(createFeedback(server.options).forward(post)).resolves.toBeUndefined();

    expect(post.reactions).toEqual([]);
    expect(feedback.sent).toEqual([]);
    expect(server.errors).toEqual([failure]);
  });

  test("when the reaction fails, the entry is still logged and one line says so, with mentions off", async () => {
    const server = new FakeFeedbackServer();
    server.addChannel(FEEDBACK_CHANNEL);
    const post = server.post({ channel: FEEDBACK_CHANNEL, content: "The map freezes" });
    post.reactionRefusal = new Error("Missing Permissions");

    await createFeedback(server.options).forward(post);

    expect(server.logs).toHaveLength(2);
    expect(contentOf(server.logs[0] ?? {})).toContain("The map freezes");
    expect(server.logs[1]?.allowedMentions).toEqual({ parse: [] });
    expect(post.reactions).toEqual([]);
  });
});

describe("createFeedback pinTemplates", () => {
  test("posts and pins the Feedback Template in a feedback channel that has none", async () => {
    const server = new FakeFeedbackServer();
    const feedback = server.addChannel(FEEDBACK_CHANNEL);

    await createFeedback(server.options).pinTemplates();

    expect(feedback.sent.map(contentOf)).toEqual([FEEDBACK_TEMPLATE]);
    expect(feedback.pinned).toEqual(feedback.sentIds);
  });

  test("changes nothing when Neil's own Feedback Template is already pinned", async () => {
    const server = new FakeFeedbackServer();
    const feedback = server.addChannel(FEEDBACK_CHANNEL);
    feedback.pinnedMessages.set("810000000000000009", { content: FEEDBACK_TEMPLATE, author: { id: NEIL_ID } });

    await createFeedback(server.options).pinTemplates();

    expect(feedback.sent).toEqual([]);
    expect(feedback.pinned).toEqual([]);
  });

  test("posts the template again when a pinned message with that text is not Neil's", async () => {
    const server = new FakeFeedbackServer();
    const feedback = server.addChannel(FEEDBACK_CHANNEL);
    feedback.pinnedMessages.set("810000000000000009", { content: FEEDBACK_TEMPLATE, author: { id: "300000000000000001" } });

    await createFeedback(server.options).pinTemplates();

    expect(feedback.sent.map(contentOf)).toEqual([FEEDBACK_TEMPLATE]);
  });

  test("a missing feedback channel writes one log line and does not stop the other channel", async () => {
    const server = new FakeFeedbackServer();
    const suggestions = server.addChannel(SUGGESTIONS_CHANNEL);

    await expect(createFeedback(server.options).pinTemplates()).resolves.toBeUndefined();

    expect(server.logs).toHaveLength(1);
    expect(suggestions.pinned).toEqual(suggestions.sentIds);
  });

  test("a refused pin writes one log line and does not throw", async () => {
    const server = new FakeFeedbackServer();
    const feedback = server.addChannel(FEEDBACK_CHANNEL);
    feedback.pinRefusal = new Error("Missing Permissions");

    await expect(createFeedback(server.options).pinTemplates()).resolves.toBeUndefined();

    expect(server.logs).toHaveLength(1);
    expect(feedback.pinned).toEqual([]);
  });
});
