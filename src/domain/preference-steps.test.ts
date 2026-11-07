import { describe, expect, test } from "vitest";
import { PREFERENCE_STEPS, nextStep, previousStep } from "./preferences.js";

describe("the Preference steps", () => {
  test("ask Languages and Interests first, then Region and Experience", () => {
    expect(PREFERENCE_STEPS).toEqual(["languages", "interests", "region", "experience"]);
  });

  test("each step but the last has a next step", () => {
    expect(nextStep("languages")).toBe("interests");
    expect(nextStep("interests")).toBe("region");
    expect(nextStep("region")).toBe("experience");
    expect(nextStep("experience")).toBeUndefined();
  });

  test("each step but the first has a previous step", () => {
    expect(previousStep("languages")).toBeUndefined();
    expect(previousStep("interests")).toBe("languages");
    expect(previousStep("experience")).toBe("region");
  });
});
