import { describe, expect, test } from "vitest";
import { isManagedRoleName } from "./managed-roles.js";
import { DOCTOR_ROLE_NAME, wantsDoctorRole } from "./doctor-role.js";

describe("DOCTOR_ROLE_NAME", () => {
  test("is the name of the Doctor Role", () => {
    expect(DOCTOR_ROLE_NAME).toBe("Doctor");
  });
});

describe("wantsDoctorRole", () => {
  test("wants the role for a Member who is not a bot and is Linked", () => {
    expect(wantsDoctorRole({ bot: false, linked: true })).toBe(true);
  });

  test("does not want the role for a Member who is not Linked", () => {
    expect(wantsDoctorRole({ bot: false, linked: false })).toBe(false);
  });

  test("does not want the role for a bot, Linked or not", () => {
    expect(wantsDoctorRole({ bot: true, linked: true })).toBe(false);
    expect(wantsDoctorRole({ bot: true, linked: false })).toBe(false);
  });
});

describe("isManagedRoleName", () => {
  test("is false for the Doctor Role name, so Managed Role applies never touch it", () => {
    expect(isManagedRoleName(DOCTOR_ROLE_NAME, [])).toBe(false);
    expect(isManagedRoleName(DOCTOR_ROLE_NAME, ["NML", "R4"])).toBe(false);
  });
});
