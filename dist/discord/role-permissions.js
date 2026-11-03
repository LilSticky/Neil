import { PermissionFlagsBits } from "discord.js";
/** The server permissions the name and roles need, with the names Discord shows for them. */
const REQUIRED = [
    { name: "Manage Roles", permission: PermissionFlagsBits.ManageRoles },
    { name: "Manage Nicknames", permission: PermissionFlagsBits.ManageNicknames },
];
/**
 * Posts one line to the log naming each server permission Neil lacks, and nothing when it holds them all. A log that
 * refuses the line is reported through logError and never throws, so Neil still starts.
 */
export async function reportRolePermissions(guild, log, logError = console.error) {
    const missing = REQUIRED.filter(({ permission }) => !guild.members.me.permissions.has(permission)).map(({ name }) => name);
    if (missing.length === 0)
        return;
    try {
        await log({
            content: `🏷️ Neil lacks ${missing.join(" and ")} in this server, so it cannot give Members their name and roles.`,
            allowedMentions: { parse: [] },
        });
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logError(`Posting the missing server permissions to the log failed: ${reason}`);
    }
}
//# sourceMappingURL=role-permissions.js.map