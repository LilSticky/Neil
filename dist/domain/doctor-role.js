/** The name of the Doctor Role: a role with no permissions, given to a Member who is Linked. */
export const DOCTOR_ROLE_NAME = "Doctor";
/** A Member wants the Doctor Role when they are not a bot and Linked. */
export function wantsDoctorRole(member) {
    return !member.bot && member.linked;
}
//# sourceMappingURL=doctor-role.js.map