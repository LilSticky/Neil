/** The step that makes a Member's holding of a role match what they want. */
export function planRoleStep(holds, wants) {
    if (wants && !holds)
        return "give";
    if (holds && !wants)
        return "take-off";
    return "keep";
}
//# sourceMappingURL=link-state-role.js.map