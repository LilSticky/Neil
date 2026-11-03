import { describe, expect, test } from "vitest";
import type { OfficerRoles } from "./interview-texts.js";
import { rankHandedToOfficersMessage, unlinkedLogLine, unlinkedPrivateMessage } from "./unlink-texts.js";

const MEMBER = "111111111111111111";
const OFFICER = "888888888888888888";
const UID = "145563254785";
const OFFICERS: OfficerRoles = { moderatorRoleId: "900000000000000001", kingRoleId: "900000000000000002" };

describe("unlinkedLogLine", () => {
  test("names the Member by mention, the uid and the nickname Neil had given them", () => {
    const line = unlinkedLogLine(MEMBER, UID, "NML Rogue", "left").content;

    expect(line).toContain(`<@${MEMBER}>`);
    expect(line).toContain(UID);
    expect(line).toContain("NML Rogue");
  });

  test("leaves the nickname out, without the word undefined, when Neil gave none", () => {
    const line = unlinkedLogLine(MEMBER, UID, undefined, "left").content;

    expect(line).toContain(`<@${MEMBER}>`);
    expect(line).toContain(UID);
    expect(line).not.toContain("undefined");
  });

  test("says the Member left when the reason is left, and says something else when the reason is missing", () => {
    const left = unlinkedLogLine(MEMBER, UID, "NML Rogue", "left").content;
    const missing = unlinkedLogLine(MEMBER, UID, "NML Rogue", "missing").content;

    expect(left).toContain("left");
    expect(missing).not.toContain("left");
    expect(missing).not.toBe(left);
  });

  test("pings nobody", () => {
    expect(unlinkedLogLine(MEMBER, UID, "NML Rogue", "left").allowedMentions).toEqual({ parse: [] });
  });

  test("names the Officer who Unlinked the Member, and still pings nobody", () => {
    const message = unlinkedLogLine(MEMBER, UID, "NML Rogue", { kind: "officer", officerId: OFFICER });

    expect(message.content).toContain(`<@${MEMBER}>`);
    expect(message.content).toContain(`<@${OFFICER}>`);
    expect(message.content).toContain(UID);
    expect(message.allowedMentions).toEqual({ parse: [] });
  });

  test("says the Member Unlinked themselves, and names no Officer when the reason is self", () => {
    const content = unlinkedLogLine(MEMBER, UID, "NML Rogue", "self").content;

    expect(content).toContain("themselves");
    expect(content).not.toContain("left");
    expect(content).not.toContain("<@&");
  });
});

describe("unlinkedPrivateMessage", () => {
  test("tells the Member their Link ended and that they will be interviewed again if they come back", () => {
    const content = unlinkedPrivateMessage().content;

    expect(content).toContain("Link");
    expect(content).toMatch(/interview/i);
    expect(content).toMatch(/back/i);
  });
});

describe("rankHandedToOfficersMessage", () => {
  test("mentions both Officer roles, and allows those roles to be pinged", () => {
    const message = rankHandedToOfficersMessage(OFFICERS);

    expect(message.content).toContain(`<@&${OFFICERS.moderatorRoleId}>`);
    expect(message.content).toContain(`<@&${OFFICERS.kingRoleId}>`);
    expect(message.allowedMentions.roles).toEqual(expect.arrayContaining([OFFICERS.moderatorRoleId, OFFICERS.kingRoleId]));
  });
});
