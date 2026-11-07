import type { ChannelType, WantedOverwrite } from "./server-layout.js";

/** What a channel is described with: its name, type and description, as the layout gives them. */
export interface DescribedChannel {
  name: string;
  type: ChannelType;
  description: string;
  codeOfConduct?: readonly string[];
}

/** The topic is set on the channel; the message is pinned in it (slice 029, data-model.md "Description message"). */
export interface ChannelDescription {
  topic: string | undefined;
  message: string | undefined;
}

const NO_POSTS = "read only";

/**
 * Describes a channel from its wanted overwrites (research R5). `hidden` are the targets Neil never names as seers
 * (Neil itself and the external roles).
 */
export function describeChannel(
  channel: DescribedChannel,
  overwrites: readonly WantedOverwrite[],
  hidden: ReadonlySet<string>,
): ChannelDescription {
  const topic = channel.type === "voice" ? undefined : channel.description;
  if (channel.type === "forum") return { topic, message: undefined };

  const seers = overwrites.filter((overwrite) => isSeer(overwrite, hidden)).map((overwrite) => overwrite.target);
  const posters = overwrites
    .filter((overwrite) => overwrite.allow.includes("SendMessages") || (isSeer(overwrite, hidden) && !overwrite.deny.includes("SendMessages")))
    .map((overwrite) => overwrite.target);

  const lines = [`📌 **#${channel.name}**`, channel.description, "", `👀 Seen by: ${seers.join(", ")}`];
  if (channel.type !== "voice") lines.push(`✍️ Posts: ${posters.length > 0 ? posters.join(", ") : NO_POSTS}`);
  if (channel.codeOfConduct !== undefined && channel.codeOfConduct.length > 0) lines.push("", ...channel.codeOfConduct);
  return { topic, message: lines.join("\n") };
}

function isSeer(overwrite: WantedOverwrite, hidden: ReadonlySet<string>): boolean {
  return overwrite.allow.includes("ViewChannel") && !hidden.has(overwrite.target);
}
