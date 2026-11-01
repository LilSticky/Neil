import { escapeMarkdown } from "discord.js";
import { describe, expect, test } from "vitest";
import type { ApplyReport } from "./member-roles.js";
import { nameAndRolesLogLine } from "./name-and-roles-texts.js";

const MEMBER = "111111111111111111";

describe("nameAndRolesLogLine", () => {
  test("names the nickname set, the roles added, removed and created, and mentions nobody", () => {
    const report: ApplyReport = { nickname: "set", added: ["NML", "R4"], removed: ["OLD"], created: ["R4"], skipped: [] };

    expect(nameAndRolesLogLine(MEMBER, report, "[NML] Rogue")).toEqual({
      content: `🏷️ <@${MEMBER}>: nickname set to ${escapeMarkdown("[NML] Rogue")}; added NML, R4; removed OLD; created R4.`,
      allowedMentions: { parse: [] },
    });
  });

  test("names a skipped nickname and each skipped step with its reason in words", () => {
    const report: ApplyReport = {
      nickname: "skipped",
      added: ["T7"],
      removed: [],
      created: [],
      skipped: [
        { what: "nickname", reason: "owner" },
        { what: "T6", reason: "hierarchy" },
      ],
    };

    expect(nameAndRolesLogLine(MEMBER, report, "[NML] Rogue")).toEqual({
      content: `🏷️ <@${MEMBER}>: nickname not set; added T7; skipped nickname (server owner), T6 (above Neil's highest role).`,
      allowedMentions: { parse: [] },
    });
  });

  test("escapes Discord markdown in the nickname it names", () => {
    const report: ApplyReport = { nickname: "set", added: [], removed: [], created: [], skipped: [] };

    const line = nameAndRolesLogLine(MEMBER, report, "[NML] *Rogue*");

    expect(line.content).toContain(escapeMarkdown("[NML] *Rogue*"));
    expect(line.content).not.toContain("*Rogue*");
  });
});
