import { PermissionFlagsBits, type BaseMessageOptions } from "discord.js";

/** The part of the bot's member the permission check reads: whether it holds a permission in the server. */
export interface PermissionHolder {
  readonly permissions: { has(permission: bigint): boolean };
}

/** The guild as the permission check reads it: the bot's own member in it. */
export interface PermissionsGuild {
  readonly members: { readonly me: PermissionHolder };
}

/** The server permissions the name and roles need, with the names Discord shows for them. */
const REQUIRED: readonly { readonly name: string; readonly permission: bigint }[] = [
  { name: "Manage Roles", permission: PermissionFlagsBits.ManageRoles },
  { name: "Manage Nicknames", permission: PermissionFlagsBits.ManageNicknames },
];

/**
 * Posts one line to the log naming each server permission Neil lacks, and nothing when it holds them all. A log that
 * refuses the line is reported through logError and never throws, so Neil still starts.
 */
export async function reportRolePermissions(
  guild: PermissionsGuild,
  log: (message: BaseMessageOptions) => Promise<void>,
  logError: (line: string) => void = console.error,
): Promise<void> {
  const missing = REQUIRED.filter(({ permission }) => !guild.members.me.permissions.has(permission)).map(({ name }) => name);
  if (missing.length === 0) return;
  try {
    await log({
      content: `🏷️ Neil lacks ${missing.join(" and ")} in this server, so it cannot give Members their name and roles.`,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logError(`Posting the missing server permissions to the log failed: ${reason}`);
  }
}
