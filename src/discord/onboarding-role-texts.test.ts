import { describe, expect, test } from "vitest";
import { onboardingRoleStartupLogLine } from "./onboarding-role-texts.js";

describe("onboardingRoleStartupLogLine", () => {
  test("states the given, taken off and skipped counts", () => {
    const line = onboardingRoleStartupLogLine({ given: 12, takenOff: 34, skipped: 56 }).content;

    expect(line).toContain("12");
    expect(line).toContain("34");
    expect(line).toContain("56");
  });
});
