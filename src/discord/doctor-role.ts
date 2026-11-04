import { DOCTOR_ROLE_NAME, wantsDoctorRole } from "../domain/doctor-role.js";
import { createLinkStateRole, type LinkStateRole, type LinkStateRoleDeps, type LinkStateRoleLinks } from "./link-state-role.js";
import { doctorRoleSkippedLogLine, doctorRoleStartupLogLine } from "./doctor-role-texts.js";

/** The Links the Doctor Role reads. */
export type DoctorRoleLinks = LinkStateRoleLinks;

export type DoctorRoleDeps = LinkStateRoleDeps;

/**
 * The Doctor Role: given to a Member who is Linked, taken off a Member who is not. Its methods never throw: a failure is
 * logged with the Member and changes nothing else.
 */
export type DoctorRole = LinkStateRole;

/** Builds the Doctor Role service. */
export function createDoctorRole(deps: DoctorRoleDeps): DoctorRole {
  return createLinkStateRole(deps, {
    name: DOCTOR_ROLE_NAME,
    wants: wantsDoctorRole,
    startupLogLine: doctorRoleStartupLogLine,
    skippedLogLine: doctorRoleSkippedLogLine,
  });
}
