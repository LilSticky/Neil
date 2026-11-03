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

  test("names a role that grants permissions as one that must lose its permissions or be renamed first", () => {
    const report: ApplyReport = {
      nickname: "set",
      added: ["NML"],
      removed: [],
      created: [],
      skipped: [{ what: "R4", reason: "has-permissions" }],
    };

    const content = nameAndRolesLogLine(MEMBER, report, "[NML|R4] Rogue").content;

    expect(content).toContain("R4");
    expect(content).toContain("must lose its permissions");
    expect(content).toContain("renamed");
  });

  test("escapes Discord markdown in every role name it names", () => {
    const report: ApplyReport = {
      nickname: "untouched",
      added: ["*T1*"],
      removed: ["_R3_"],
      created: ["*T1*"],
      skipped: [{ what: "~~R4~~", reason: "hierarchy" }],
    };

    const content = nameAndRolesLogLine(MEMBER, report, "[NML] Rogue").content;

    expect(content).toContain(escapeMarkdown("*T1*"));
    expect(content).toContain(escapeMarkdown("_R3_"));
    expect(content).toContain(escapeMarkdown("~~R4~~"));
    expect(content).not.toContain("*T1*");
    expect(content).not.toContain("_R3_");
    expect(content).not.toContain("~~R4~~");
  });

  test("escapes Discord markdown in the nickname it names", () => {
    const report: ApplyReport = { nickname: "set", added: [], removed: [], created: [], skipped: [] };

    const line = nameAndRolesLogLine(MEMBER, report, "[NML] *Rogue*");

    expect(line.content).toContain(escapeMarkdown("[NML] *Rogue*"));
    expect(line.content).not.toContain("*Rogue*");
  });
});
