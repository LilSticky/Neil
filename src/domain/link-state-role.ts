/** What to do with a role for a Member: give it, take it off, or leave it as it is. */
export type RoleStep = "give" | "take-off" | "keep";

/** The step that makes a Member's holding of a role match what they want. */
export function planRoleStep(holds: boolean, wants: boolean): RoleStep {
  if (wants && !holds) return "give";
  if (holds && !wants) return "take-off";
  return "keep";
}
