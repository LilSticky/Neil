import { describe, expect, test } from "vitest";
import { isManagedRoleName } from "./managed-roles.js";
import { ONBOARDING_ROLE_NAME, planOnboardingRole, wantsOnboardingRole } from "./onboarding-role.js";

describe("ONBOARDING_ROLE_NAME", () => {
  test("is the name of the Onboarding Role", () => {
    expect(ONBOARDING_ROLE_NAME).toBe("Onboarding");
  });
});

describe("wantsOnboardingRole", () => {
  test("wants the role for a Member who is not a bot and not Linked", () => {
    expect(wantsOnboardingRole({ bot: false, linked: false })).toBe(true);
  });

  test("does not want the role for a Linked Member", () => {
    expect(wantsOnboardingRole({ bot: false, linked: true })).toBe(false);
  });

  test("does not want the role for a bot, Linked or not", () => {
    expect(wantsOnboardingRole({ bot: true, linked: false })).toBe(false);
    expect(wantsOnboardingRole({ bot: true, linked: true })).toBe(false);
  });
});

describe("planOnboardingRole", () => {
  test("gives the role to a Member who wants it and does not hold it", () => {
    expect(planOnboardingRole(false, true)).toBe("give");
  });

  test("takes the role off a Member who holds it and does not want it", () => {
    expect(planOnboardingRole(true, false)).toBe("take-off");
  });

  test("keeps the role for a Member who holds it and wants it", () => {
    expect(planOnboardingRole(true, true)).toBe("keep");
  });

  test("keeps the role absent for a Member who neither holds nor wants it", () => {
    expect(planOnboardingRole(false, false)).toBe("keep");
  });
});

describe("isManagedRoleName", () => {
  test("is false for the Onboarding Role name, so Managed Role applies never touch it", () => {
    expect(isManagedRoleName(ONBOARDING_ROLE_NAME, [])).toBe(false);
    expect(isManagedRoleName(ONBOARDING_ROLE_NAME, ["NML", "R4"])).toBe(false);
  });
});
