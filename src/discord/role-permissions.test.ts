import { PermissionFlagsBits, type BaseMessageOptions } from "discord.js";
import { describe, expect, test } from "vitest";
import { reportRolePermissions } from "./role-permissions.js";

/** A guild whose bot member holds exactly these permission bits in the server. */
function guildHolding(permissions: readonly bigint[]) {
  return {
    members: {
      me: { permissions: { has: (permission: bigint): boolean => permissions.includes(permission) } },
    },
  };
}

/** A log that records every line it is given; `refusing` makes every post fail, as a deleted log channel would. */
function recordingLog(refusing = false) {
  const lines: BaseMessageOptions[] = [];
  const log = (message: BaseMessageOptions): Promise<void> => {
    if (refusing) return Promise.reject(new Error("Missing Access"));
    lines.push(message);
    return Promise.resolve();
  };
  return { lines, log };
}

function contentOf(message: BaseMessageOptions | undefined): string {
  return message?.content ?? "";
}

const BOTH = [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageNicknames];

describe("reportRolePermissions", () => {
  test.each([
    ["Manage Roles", [PermissionFlagsBits.ManageNicknames]],
    ["Manage Nicknames", [PermissionFlagsBits.ManageRoles]],
  ])("posts one line to the log naming %s when Neil lacks it", async (missing, held) => {
    const { lines, log } = recordingLog();

    await reportRolePermissions(guildHolding(held), log);

    expect(lines).toHaveLength(1);
    expect(contentOf(lines[0])).toContain(missing);
  });

  test("posts one line naming both Manage Roles and Manage Nicknames when Neil lacks both", async () => {
    const { lines, log } = recordingLog();

    await reportRolePermissions(guildHolding([]), log);

    expect(lines).toHaveLength(1);
    expect(contentOf(lines[0])).toContain("Manage Roles");
    expect(contentOf(lines[0])).toContain("Manage Nicknames");
  });

  test("posts nothing when Neil holds both permissions", async () => {
    const { lines, log } = recordingLog();

    await reportRolePermissions(guildHolding(BOTH), log);

    expect(lines).toEqual([]);
  });

  test("does not throw when the log channel refuses the line, so Neil still starts", async () => {
    const { log } = recordingLog(true);

    await expect(reportRolePermissions(guildHolding([]), log)).resolves.toBeUndefined();
  });
});
