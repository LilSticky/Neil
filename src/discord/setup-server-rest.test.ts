import { Routes } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import { createRestSetupServer } from "./setup-server-rest.js";

const GUILD_ID = "200000000000000000";
const BOT_USER_ID = "300000000000000000";
const OTHER_MEMBER_ID = "400000000000000000";
const ROLE_ID = "500000000000000000";
const NEW_ROLE_ID = "600000000000000000";
const CHANNEL_ID = "700000000000000000";

/**
 * A fake of the three REST calls the setup makes: GET answers Neil's user, POST answers the id of what it creates, and PATCH
 * answers with an empty body. The calls are recorded by vi.fn, so tests read what the adapter sent.
 */
function fakeRest() {
  return {
    get: vi.fn((route: string): Promise<unknown> => Promise.resolve(route === Routes.user() ? { id: BOT_USER_ID } : {})),
    post: vi.fn<(route: string, options: { body: unknown }) => Promise<unknown>>(() => Promise.resolve({ id: NEW_ROLE_ID })),
    patch: vi.fn<(route: string, options: { body: unknown }) => Promise<unknown>>(() => Promise.resolve({})),
  };
}

describe("createRestSetupServer creates a role with no permissions, not hoisted and not mentionable", () => {
  test("posts the role with permissions 0, hoist false and mentionable false", async () => {
    const rest = fakeRest();
    const server = createRestSetupServer(rest, GUILD_ID);

    await server.createRole("R5");

    expect(rest.post).toHaveBeenCalledWith(Routes.guildRoles(GUILD_ID), {
      body: expect.objectContaining({ name: "R5", permissions: "0", hoist: false, mentionable: false }) as unknown,
    });
  });
});

describe("createRestSetupServer edits overwrites with the type each overwrite carries", () => {
  test("sends a Member overwrite of another user as type 1, a role overwrite as type 0, and Neil's as type 1", async () => {
    const rest = fakeRest();
    const server = createRestSetupServer(rest, GUILD_ID);

    await server.editOverwrites(CHANNEL_ID, [
      { targetId: OTHER_MEMBER_ID, type: 1, allow: 1024n, deny: 0n },
      { targetId: ROLE_ID, type: 0, allow: 0n, deny: 2048n },
      { targetId: BOT_USER_ID, type: 1, allow: 1n, deny: 0n },
    ]);

    expect(rest.patch).toHaveBeenCalledWith(Routes.channel(CHANNEL_ID), {
      body: {
        permission_overwrites: [
          { id: OTHER_MEMBER_ID, type: 1, allow: "1024", deny: "0" },
          { id: ROLE_ID, type: 0, allow: "0", deny: "2048" },
          { id: BOT_USER_ID, type: 1, allow: "1", deny: "0" },
        ],
      },
    });
  });
});
