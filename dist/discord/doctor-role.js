import { DOCTOR_ROLE_NAME, wantsDoctorRole } from "../domain/doctor-role.js";
import { createLinkStateRole } from "./link-state-role.js";
import { doctorRoleSkippedLogLine, doctorRoleStartupLogLine } from "./doctor-role-texts.js";
/** Builds the Doctor Role service. */
export function createDoctorRole(deps) {
    return createLinkStateRole(deps, {
        name: DOCTOR_ROLE_NAME,
        wants: wantsDoctorRole,
        startupLogLine: doctorRoleStartupLogLine,
        skippedLogLine: doctorRoleSkippedLogLine,
    });
}
//# sourceMappingURL=doctor-role.js.map