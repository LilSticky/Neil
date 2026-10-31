import { ButtonStyle, ComponentType, MessageFlags, TextInputStyle } from "discord.js";
import { describe, expect, test } from "vitest";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Player } from "../domain/player.js";
import type { ApprovableRank, MemberId, RankApproval } from "../domain/rank-approval.js";
import {
  abandonedLogLine,
  askUidMessage,
  alreadyLinkedMessage,
  buttonOfSomeoneElseReply,
  checkingReply,
  foundCardMessage,
  handedOffLogLine,
  handedOffMessage,
  interviewAlreadyOpenReply,
  interviewCustomId,
  interviewEndedReply,
  interviewLinkedReply,
  interviewOpenedReply,
  interviewThreadName,
  leftMessage,
  linkLogLine,
  linkedMessage,
  malformedUidMessage,
  notFoundMessage,
  parseInterviewCustomId,
  parseRankCustomId,
  quotaResetMessage,
  quotaSpentMessage,
  rankApprovedMessage,
  rankAskedMessage,
  rankCancelledLeftMessage,
  rankCancelledLogLine,
  rankCustomId,
  rankNotAllowedReply,
  rankSetLogLine,
  refusedLogLine,
  rejectedMessage,
  timedOutMessage,
  uidHelpMessage,
  uidModal,
  unavailableMessage,
  type OfficerRoles,
} from "./interview-texts.js";

const MEMBER: MemberId = "111111111111111111";
const LEADER: MemberId = "222222222222222222";
const APPROVER: MemberId = "555555555555555555";
const THREAD = "666666666666666666";
const OFFICERS: OfficerRoles = { moderatorRoleId: "333333333333333333", kingRoleId: "444444444444444444" };
const NOW = new Date("2026-10-30T20:48:00Z");
const RESETS_AT = new Date("2026-10-31T00:00:00Z");
const UID_HELP =
  "In the game, tap your profile picture in the top left, then the feather next to your name. The number under the picture is your uid; the button next to it copies it.";

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
  alliance: { tag: "NML", name: "Neil's Men", leaderUid: undefined },
  allianceRank: "R5",
};

const rankUnknown: Player = { ...inAlliance, allianceRank: "unknown" };

const withoutAlliance: Player = {
  uid: uid("145563254785"),
  name: "Vex",
  kingdom: kingdom(330),
  power: 15902728,
  sanctuaryLevel: 42,
  alliance: undefined,
  allianceRank: undefined,
};

const pendingApproval: RankApproval = {
  state: "pending",
  id: 3,
  linkedMemberId: MEMBER,
  threadId: THREAD,
  approver: { kind: "member", memberId: LEADER },
  askedAt: NOW,
};

const officersApproval: RankApproval = {
  ...pendingApproval,
  approver: { kind: "officers" },
};

const approvedApproval: Extract<RankApproval, { state: "approved" }> = {
  state: "approved",
  id: 3,
  linkedMemberId: MEMBER,
  threadId: THREAD,
  approver: { kind: "member", memberId: LEADER },
  askedAt: NOW,
  rank: "R3",
  approvedBy: APPROVER,
  approvedAt: NOW,
};

const GIVE_UID_BUTTON = {
  type: ComponentType.ActionRow,
  components: [{ type: ComponentType.Button, label: "Give my uid", custom_id: "interview:uid:7" }],
};

describe("interviewThreadName", () => {
  test("names the thread Interview – {username}", () => {
    expect(interviewThreadName("vex")).toBe("Interview – vex");
  });

  test("cuts the name to 100 characters", () => {
    const name = interviewThreadName("v".repeat(150));

    expect(name.length).toBe(100);
    expect(name).toBe(`Interview – ${"v".repeat(150)}`.slice(0, 100));
  });
});

describe("interview custom ids", () => {
  test.each(["uid", "modal", "confirm", "reject"] as const)("%s round-trips through parseInterviewCustomId", (action) => {
    expect(parseInterviewCustomId(interviewCustomId(action, 7))).toEqual({ action, interviewId: 7 });
  });

  test("builds interview:uid:{id}", () => {
    expect(interviewCustomId("uid", 7)).toBe("interview:uid:7");
  });

  test("builds interview:modal:{id}", () => {
    expect(interviewCustomId("modal", 7)).toBe("interview:modal:7");
  });

  test("builds interview:confirm:{id} and interview:reject:{id}", () => {
    expect(interviewCustomId("confirm", 7)).toBe("interview:confirm:7");
    expect(interviewCustomId("reject", 7)).toBe("interview:reject:7");
  });

  test.each([
    ["an unknown action", "interview:bogus:7"],
    ["a non-numeric id", "interview:uid:abc"],
    ["an empty id", "interview:uid:"],
    ["an extra segment", "interview:uid:7:extra"],
    ["a fractional id", "interview:uid:1.5"],
    ["a negative id", "interview:uid:-1"],
    ["another prefix", "pick:uid:7"],
    ["a rank custom id", "rank:7:R1"],
    ["the empty string", ""],
  ])("parseInterviewCustomId gives undefined for %s", (_label, customId) => {
    expect(parseInterviewCustomId(customId)).toBeUndefined();
  });

  test("every interview custom id is at most 100 characters, even for the largest id", () => {
    for (const action of ["uid", "modal", "confirm", "reject"] as const) {
      expect(interviewCustomId(action, Number.MAX_SAFE_INTEGER).length).toBeLessThanOrEqual(100);
    }
  });
});

describe("rank custom ids", () => {
  const ranks: readonly ApprovableRank[] = ["R1", "R2", "R3", "R4", "R5"];

  test.each(ranks)("%s round-trips through parseRankCustomId", (rank) => {
    expect(parseRankCustomId(rankCustomId(12, rank))).toEqual({ approvalId: 12, rank });
  });

  test("builds rank:{approvalId}:{rank}", () => {
    expect(rankCustomId(12, "R3")).toBe("rank:12:R3");
  });

  test.each([
    ["an unknown rank", "rank:12:unknown"],
    ["a rank beyond R5", "rank:12:R6"],
    ["a non-numeric id", "rank:x:R1"],
    ["a missing rank", "rank:12"],
    ["another prefix", "interview:12:R1"],
  ])("parseRankCustomId gives undefined for %s", (_label, customId) => {
    expect(parseRankCustomId(customId)).toBeUndefined();
  });

  test("every rank custom id is at most 100 characters, even for the largest id", () => {
    for (const rank of ranks) {
      expect(rankCustomId(Number.MAX_SAFE_INTEGER, rank).length).toBeLessThanOrEqual(100);
    }
  });
});

describe("/interview replies", () => {
  test("opening an Interview replies privately that it waits in the thread", () => {
    expect(interviewOpenedReply(THREAD)).toEqual({
      content: `Your interview is waiting in <#${THREAD}>.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  });

  test("an open Interview replies privately that it is already open in the thread", () => {
    expect(interviewAlreadyOpenReply(THREAD)).toEqual({
      content: `Your interview is already open: <#${THREAD}>.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  });

  test("a Linked Member is told the uid of the Player they are linked to, privately", () => {
    expect(interviewLinkedReply(uid("145563254785"))).toEqual({
      content: "You're already linked to the player with uid 145563254785.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  });
});

describe("thread messages for asking and entering a uid", () => {
  test("asking for a uid welcomes the Member, mentions them, and explains the help text", () => {
    expect(askUidMessage(7, MEMBER)).toMatchObject({
      content: `Welcome, <@${MEMBER}>! Tell me who you are in the game: press the button and enter your uid.\n${UID_HELP}`,
      components: [GIVE_UID_BUTTON],
      allowedMentions: { users: [MEMBER] },
    });
  });

  test("the uid help is its own message with the contract's text and no buttons", () => {
    expect(uidHelpMessage()).toMatchObject({
      content: UID_HELP,
      allowedMentions: { parse: [] },
    });
    expect(uidHelpMessage()).not.toHaveProperty("components");
  });

  test("a malformed uid says it is only digits, gives the example and the help, and keeps the Give my uid button", () => {
    const message = malformedUidMessage(7);

    expect(message.content).toContain("That isn't a uid: it's only digits, like 145563254785.");
    expect(message.content).toContain(UID_HELP);
    expect(message).toMatchObject({ components: [GIVE_UID_BUTTON], allowedMentions: { parse: [] } });
  });

  test("the checking reply is private and says one moment", () => {
    expect(checkingReply()).toEqual({
      content: "One moment, I'm still looking that up.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  });

  test("the uid modal has the custom id interview:modal:{id}, the title Your uid and one short uid field", () => {
    expect(uidModal(7)).toMatchObject({
      custom_id: "interview:modal:7",
      title: "Your uid",
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              custom_id: "uid",
              style: TextInputStyle.Short,
              min_length: 1,
              max_length: 32,
              placeholder: "145563254785",
            },
          ],
        },
      ],
    });
  });
});

describe("thread messages for a uid that was looked up", () => {
  test("a found Player shows the card with Is this you? and the two buttons", () => {
    const message = foundCardMessage(7, inAlliance);

    expect(message.content).toContain("Vex");
    expect(message.content).toContain("145563254785");
    expect(message.content).toContain("#330");
    expect(message.content).toContain("[NML] Neil's Men");
    expect(message.content).toContain("R5");
    expect(message.content).toContain("Is this you?");
    expect(message).toMatchObject({
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            { type: ComponentType.Button, label: "That's me", custom_id: "interview:confirm:7" },
            { type: ComponentType.Button, label: "That's not me", custom_id: "interview:reject:7" },
          ],
        },
      ],
      allowedMentions: { parse: [] },
    });
  });

  test("a Player in an Alliance with an unknown rank reads rank unknown on the card", () => {
    expect(foundCardMessage(7, rankUnknown).content).toContain("rank unknown");
  });

  test("a Player without an Alliance reads no alliance on the card", () => {
    expect(foundCardMessage(7, withoutAlliance).content).toContain("no alliance");
  });

  test("the found card escapes the Player Name", () => {
    expect(foundCardMessage(7, { ...inAlliance, name: "*Bold_*" }).content).toContain("\\*Bold\\_\\*");
  });

  test("a not-found uid names the uid, asks the Member to check it, and keeps the Give my uid button", () => {
    const message = notFoundMessage(7, uid("145563254785"), 4);

    expect(message.content).toContain("I couldn't find a player with uid 145563254785. Check the number.");
    expect(message.content).toContain("4 tries left.");
    expect(message.content).toContain(UID_HELP);
    expect(message).toMatchObject({ components: [GIVE_UID_BUTTON], allowedMentions: { parse: [] } });
  });

  test("a not-found uid with five tries left shows no tries count", () => {
    expect(notFoundMessage(7, uid("145563254785"), 5).content).not.toContain("tries left");
  });

  test("a not-found uid with one try left says the singular, 1 try left.", () => {
    expect(notFoundMessage(7, uid("145563254785"), 1).content).toContain("1 try left.");
  });

  test("an already Linked uid says it belongs to another member, offers an Officer, and shows the tries left", () => {
    const message = alreadyLinkedMessage(7, 3);

    expect(message.content).toContain(
      "That player is already linked to another member. If it's yours, an Officer can help.",
    );
    expect(message.content).toContain("3 tries left.");
    expect(message).toMatchObject({ components: [GIVE_UID_BUTTON], allowedMentions: { parse: [] } });
  });

  test("an already Linked uid never names the Member who holds it", () => {
    expect(alreadyLinkedMessage(7, 3).content).not.toMatch(/<@|<#/);
  });

  test("a rejected Player says let's try again, shows the tries left and the help", () => {
    const message = rejectedMessage(7, 2);

    expect(message.content).toContain("Okay, let's try again.");
    expect(message.content).toContain("2 tries left.");
    expect(message.content).toContain(UID_HELP);
    expect(message).toMatchObject({ components: [GIVE_UID_BUTTON], allowedMentions: { parse: [] } });
  });

  test("an unavailable tracker says so and keeps the Give my uid button, with no attempt text", () => {
    expect(unavailableMessage(7)).toMatchObject({
      content: "The game tracker isn't answering right now. Try again in a few minutes.",
      components: [GIVE_UID_BUTTON],
      allowedMentions: { parse: [] },
    });
  });
});

describe("thread messages for the Daily Quota", () => {
  test("a spent quota says when lookups work again with the time left, and that Neil will ping then", () => {
    expect(quotaSpentMessage(RESETS_AT, NOW)).toEqual({
      content: "I can't look players up again until 00:00 UTC (in 3 h 12 min). I'll ping you here then.",
      allowedMentions: { parse: [] },
    });
  });

  test("a quota reset pings the Member, says lookups work again, and asks again with the Give my uid button", () => {
    const message = quotaResetMessage(7, MEMBER);

    expect(message.content).toContain(`<@${MEMBER}>, I can look players up again.`);
    expect(message.content).toContain("Tell me who you are in the game: press the button and enter your uid.");
    expect(message.content.split(`<@${MEMBER}>`)).toHaveLength(2);
    expect(message).toMatchObject({ components: [GIVE_UID_BUTTON], allowedMentions: { users: [MEMBER] } });
  });
});

describe("thread messages for ending an Interview", () => {
  test("a link greets the Member by mention and names the Player with the uid, with no buttons", () => {
    expect(linkedMessage(MEMBER, inAlliance)).toEqual({
      content: `Done, <@${MEMBER}>: you're linked to Vex (uid 145563254785).`,
      allowedMentions: { users: [MEMBER] },
    });
  });

  test("the link message escapes the Player Name", () => {
    expect(linkedMessage(MEMBER, { ...inAlliance, name: "_Vex_" }).content).toBe(
      `Done, <@${MEMBER}>: you're linked to \\_Vex\\_ (uid 145563254785).`,
    );
  });

  test("a hand-off mentions both Officer roles and the Member, asks for help, and points to /interview, with no buttons", () => {
    expect(handedOffMessage(MEMBER, OFFICERS)).toEqual({
      content: `<@&${OFFICERS.moderatorRoleId}> <@&${OFFICERS.kingRoleId}>: <@${MEMBER}> couldn't be linked after 5 tries. Please help here.\nAn Officer will help you, <@${MEMBER}>. You can also start again later with /interview.`,
      allowedMentions: { users: [MEMBER], roles: [OFFICERS.moderatorRoleId, OFFICERS.kingRoleId] },
    });
  });

  test("a timed-out Interview says how long the silence was and how to start again", () => {
    const message = timedOutMessage(24 * 60 * 60_000);

    expect(message.content).toContain("No answer for ");
    expect(message.content).toContain("so this interview is closed. Run /interview to start again.");
    expect(message.allowedMentions).toEqual({ parse: [] });
  });

  test("a Member who left says so with the escaped username", () => {
    expect(leftMessage("_vex_")).toEqual({
      content: "\\_vex\\_ left the server; this interview is closed.",
      allowedMentions: { parse: [] },
    });
  });

  test("a button press by someone else is answered privately", () => {
    expect(buttonOfSomeoneElseReply()).toEqual({
      content: "This interview belongs to someone else.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  });

  test("a button on an ended Interview is answered privately and points to /interview", () => {
    expect(interviewEndedReply()).toEqual({
      content: "This interview has ended. Run /interview to start a new one.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  });
});

describe("Rank Approval messages", () => {
  test("asking the leader's Member pings that Member and offers R1 to R5 buttons", () => {
    expect(rankAskedMessage(pendingApproval, inAlliance, OFFICERS)).toEqual({
      content: `<@${LEADER}>, the tracker shows no rank for Vex in [NML]. Which rank do they have?`,
      components: [
        {
          type: ComponentType.ActionRow,
          components: (["R1", "R2", "R3", "R4", "R5"] as const).map((rank) => ({
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            label: rank,
            custom_id: `rank:3:${rank}`,
          })),
        },
      ],
      allowedMentions: { users: [LEADER] },
    });
  });

  test("asking the Officers mentions both Officer roles, says R5 is not linked here, and offers the buttons", () => {
    expect(rankAskedMessage(officersApproval, inAlliance, OFFICERS)).toMatchObject({
      content: `<@&${OFFICERS.moderatorRoleId}> <@&${OFFICERS.kingRoleId}>: the tracker shows no rank for Vex in [NML], and their R5 isn't linked here. Which rank do they have?`,
      components: [
        {
          type: ComponentType.ActionRow,
          components: (["R1", "R2", "R3", "R4", "R5"] as const).map(
            (rank): unknown => expect.objectContaining({ custom_id: `rank:3:${rank}`, label: rank }),
          ),
        },
      ],
      allowedMentions: { roles: [OFFICERS.moderatorRoleId, OFFICERS.kingRoleId] },
    });
  });

  test("the rank question escapes the Player Name", () => {
    expect(rankAskedMessage(pendingApproval, { ...inAlliance, name: "*Vex*" }, OFFICERS).content).toContain(
      "the tracker shows no rank for \\*Vex\\* in [NML]",
    );
  });

  test("an approved rank reads as the approver setting the Linked Member's rank, pinging only the approver", () => {
    expect(rankApprovedMessage(approvedApproval)).toEqual({
      content: `<@${APPROVER}> set <@${MEMBER}>'s rank to R3.`,
      allowedMentions: { users: [APPROVER] },
    });
  });

  test("a press by someone not allowed is answered privately", () => {
    expect(rankNotAllowedReply()).toEqual({
      content: "You can't approve this rank.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  });

  test("a cancelled Rank Approval says the Member left, with the escaped username", () => {
    expect(rankCancelledLeftMessage("_vex_")).toEqual({
      content: "\\_vex\\_ left the server; the rank approval is cancelled.",
      allowedMentions: { parse: [] },
    });
  });
});

describe("log channel lines", () => {
  test("a link names the Member, the Player, uid, Kingdom, Alliance tag and rank, and pings nobody", () => {
    expect(linkLogLine(MEMBER, inAlliance, undefined)).toEqual({
      content: `🔗 <@${MEMBER}> linked to Vex (uid 145563254785, #330, [NML], R5).`,
      allowedMentions: { parse: [] },
    });
  });

  test("a link with an unknown rank reads rank unknown", () => {
    expect(linkLogLine(MEMBER, rankUnknown, undefined).content).toContain("[NML], rank unknown).");
  });

  test("a link outside an Alliance reads no alliance", () => {
    expect(linkLogLine(MEMBER, withoutAlliance, undefined).content).toContain("no alliance).");
  });

  test("a link whose Alliance leader is Linked and on the server adds the leader's mention and pings only the leader", () => {
    expect(linkLogLine(MEMBER, inAlliance, LEADER)).toEqual({
      content: `🔗 <@${MEMBER}> linked to Vex (uid 145563254785, #330, [NML], R5). <@${LEADER}>`,
      allowedMentions: { users: [LEADER] },
    });
  });

  test("the link line escapes the Player Name", () => {
    expect(linkLogLine(MEMBER, { ...inAlliance, name: "_Vex_" }, undefined).content).toContain(
      "linked to \\_Vex\\_ (uid",
    );
  });

  test("a refused uid line names the Member and the uid", () => {
    expect(refusedLogLine(MEMBER, uid("145563254785"))).toEqual({
      content: `⛔ <@${MEMBER}> gave uid 145563254785, which is already linked.`,
      allowedMentions: { parse: [] },
    });
  });

  test("a hand-off line names the Member and the thread", () => {
    expect(handedOffLogLine(MEMBER, THREAD)).toEqual({
      content: `🙋 <@${MEMBER}> was handed off after 5 failed tries: <#${THREAD}>.`,
      allowedMentions: { parse: [] },
    });
  });

  test("an abandoned line says the interview closed timed out", () => {
    expect(abandonedLogLine(MEMBER, "timed-out")).toEqual({
      content: `💤 <@${MEMBER}>'s interview closed (timed out).`,
      allowedMentions: { parse: [] },
    });
  });

  test("an abandoned line says the interview closed when the Member left", () => {
    expect(abandonedLogLine(MEMBER, "left")).toEqual({
      content: `💤 <@${MEMBER}>'s interview closed (left).`,
      allowedMentions: { parse: [] },
    });
  });

  test("a rank set line names the approver, the Member and the rank", () => {
    expect(rankSetLogLine(APPROVER, MEMBER, "R3")).toEqual({
      content: `🎖️ <@${APPROVER}> set <@${MEMBER}>'s rank to R3.`,
      allowedMentions: { parse: [] },
    });
  });

  test("a cancelled rank approval line names the Member", () => {
    expect(rankCancelledLogLine(MEMBER)).toEqual({
      content: `🎖️ Rank approval for <@${MEMBER}> cancelled (left).`,
      allowedMentions: { parse: [] },
    });
  });
});
