import { ChannelType, RESTJSONErrorCodes, type BaseMessageOptions } from "discord.js";
import { describe, expect, test } from "vitest";
import { kingMoveServerOf, type KingMoveGuildLike, type ListedMember } from "./king-move-server.js";

const KING_ROLE = "900000000000000002";
const MODERATOR_ROLE = "900000000000000001";
const LOG = "700000000000000009";

class FakeGuild implements KingMoveGuildLike {
  readonly sent: BaseMessageOptions[] = [];
  readonly added: [string, string][] = [];
  readonly removed: [string, string][] = [];
  editError: Error | undefined;
  members: ListedMember[] = [
    { id: "1", roleIds: [KING_ROLE, "R5"] },
    { id: "2", roleIds: [MODERATOR_ROLE] },
    { id: "3", roleIds: [KING_ROLE] },
  ];
  readonly channels = {
    fetch: (channelId: string) =>
      Promise.resolve(
        channelId === LOG
          ? {
              id: LOG,
              type: ChannelType.GuildText,
              send: (message: BaseMessageOptions) => {
                this.sent.push(message);
                return Promise.resolve({ id: "800000000000000001" });
              },
              messages: {
                edit: () => (this.editError === undefined ? Promise.resolve() : Promise.reject(this.editError)),
              },
            }
          : null,
      ),
  };
  addRole(memberId: string, roleId: string): Promise<unknown> {
    this.added.push([memberId, roleId]);
    return Promise.resolve();
  }
  removeRole(memberId: string, roleId: string): Promise<unknown> {
    this.removed.push([memberId, roleId]);
    return Promise.resolve();
  }
  everyMember(): Promise<readonly ListedMember[]> {
    return Promise.resolve(this.members);
  }
  isOnServer(memberId: string): Promise<boolean> {
    return Promise.resolve(this.members.some((member) => member.id === memberId));
  }
}

function serverOf(guild: FakeGuild, logs: BaseMessageOptions[] = []) {
  return kingMoveServerOf(guild, {
    kingRoleId: KING_ROLE,
    logChannelId: LOG,
    log: (message) => {
      logs.push(message);
      return Promise.resolve();
    },
  });
}

describe("kingMoveServerOf", () => {
  test("lists the holders of the King role only", async () => {
    expect(await serverOf(new FakeGuild()).kingHolders()).toEqual(["1", "3"]);
  });

  test("gives and takes only the configured King role", async () => {
    const guild = new FakeGuild();
    const server = serverOf(guild);

    await server.giveKing("2");
    await server.takeKing("1");

    expect(guild.added).toEqual([["2", KING_ROLE]]);
    expect(guild.removed).toEqual([["1", KING_ROLE]]);
  });

  test("posts and edits cards in the log channel, and says when a card is gone", async () => {
    const guild = new FakeGuild();
    const server = serverOf(guild);

    expect(await server.postCard({ content: "card" })).toBe("800000000000000001");
    expect(guild.sent).toEqual([{ content: "card" }]);
    expect(await server.editCard("800000000000000001", { content: "applied" })).toBe(true);
    guild.editError = Object.assign(new Error("Unknown Message"), { code: RESTJSONErrorCodes.UnknownMessage });
    expect(await server.editCard("800000000000000001", { content: "applied" })).toBe(false);
  });

  test("logs a line with mentions off", async () => {
    const logs: BaseMessageOptions[] = [];
    await serverOf(new FakeGuild(), logs).log("line <@1>");
    expect(logs).toEqual([{ content: "line <@1>", allowedMentions: { parse: [] } }]);
  });
});
