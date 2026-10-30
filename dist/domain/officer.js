/** Whether a Member is an Officer: they have at least one of the configured Moderator or King role IDs. */
export function isOfficer(memberRoleIds, officerRoleIds) {
    return memberRoleIds.some((roleId) => officerRoleIds.includes(roleId));
}
//# sourceMappingURL=officer.js.map