import { describe, expect, test } from "vitest";
import { MAX_ATTEMPTS, retryDelay } from "./retry.js";

describe("MAX_ATTEMPTS", () => {
  test("is 3", () => {
    expect(MAX_ATTEMPTS).toBe(3);
  });
});

describe("retryDelay", () => {
  test("before the second attempt is 500 ms when random is 0", () => {
    expect(retryDelay(1, 0)).toBe(500);
  });

  test("before the second attempt stays just under 1500 ms as random approaches 1", () => {
    const delay = retryDelay(1, 0.999);

    expect(delay).toBeLessThan(1500);
    expect(delay).toBeCloseTo(1499, 0);
  });

  test("doubles for each attempt, so before the third attempt with random 0.5 is 2000 ms", () => {
    expect(retryDelay(2, 0.5)).toBe(2000);
  });
});
