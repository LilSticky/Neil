import type { ForumSetup } from "./server-layout.js";

/** The how-to post Neil pins in a forum: its title and its content (slice 030, how-to-posts.md). */
export interface ForumHowTo {
  title: string;
  content: string;
}

/** Builds the how-to post of a forum from its layout entry; pure, the post itself is posted by the setup. */
export function forumHowTo(name: string, forum: ForumSetup): ForumHowTo {
  const { belongs, exampleTitle, template } = forum.howTo;
  const content = [
    `📌 **How to post in #${name}**`,
    belongs,
    "",
    `**Title:** what your post is about, e.g. "${exampleTitle}"`,
    `**Tags:** pick one or two: ${forum.tags.join(", ")}`,
    "**Body:** copy this and fill it in:",
    "```",
    ...template.map((line) => `${line}:`),
    "```",
    "",
    `Reply inside a post to discuss it. React with ${forum.reaction} to a post you found useful.`,
  ].join("\n");
  return { title: `How to post in #${name}`, content };
}
